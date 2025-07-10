import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerIdentity,
  WorkerRegistry,
  WorkerStatus,
  WorkerMetrics,
  RegisterWorkerRequest,
  ListWorkersRequest,
  TrackingConfig,
  WorkerNotFoundError,
  TrackingError
} from './tracking-types.js';

export class WorkerRegistryManager {
  private baseDir = path.join(os.homedir(), '.claude-todos-mcp');
  private workersDir = path.join(this.baseDir, 'workers');
  private registryFile = path.join(this.workersDir, 'worker-registry.json');
  
  private registry: WorkerRegistry | null = null;
  private currentWorker: WorkerIdentity | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  private config: TrackingConfig = {
    enabled: true,
    maxEventsPerFile: 10000,
    retentionDays: 90,
    compactionInterval: 24 * 60 * 60 * 1000, // 24 hours
    maxFileSize: 10 * 1024 * 1024, // 10MB
    enableRealTimeSync: true,
    enableConflictDetection: true,
    workerTimeoutMs: 5 * 60 * 1000, // 5 minutes
    heartbeatIntervalMs: 60 * 1000 // 60 seconds
  };
  
  constructor(config?: Partial<TrackingConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }
  
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.workersDir, { recursive: true });
  }
  
  private async loadRegistry(): Promise<WorkerRegistry> {
    if (this.registry) return this.registry;
    
    await this.ensureDirectories();
    
    try {
      const data = await fs.readFile(this.registryFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Convert Map from JSON
      this.registry = {
        workers: new Map(Object.entries(parsed.workers || {})),
        lastCleanup: new Date(parsed.lastCleanup || Date.now()),
        inactiveTimeoutMs: parsed.inactiveTimeoutMs || this.config.workerTimeoutMs
      };
    } catch (error) {
      // Create new registry if file doesn't exist
      this.registry = {
        workers: new Map(),
        lastCleanup: new Date(),
        inactiveTimeoutMs: this.config.workerTimeoutMs
      };
    }
    
    return this.registry;
  }
  
  private async saveRegistry(): Promise<void> {
    if (!this.registry) return;
    
    await this.ensureDirectories();
    
    // Convert Map to JSON-serializable format
    const data = {
      workers: Object.fromEntries(this.registry.workers),
      lastCleanup: this.registry.lastCleanup.toISOString(),
      inactiveTimeoutMs: this.registry.inactiveTimeoutMs
    };
    
    const tempFile = `${this.registryFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, this.registryFile);
  }
  
  private async saveWorkerState(worker: WorkerIdentity): Promise<void> {
    const workerFile = path.join(this.workersDir, `${worker.id}.json`);
    const tempFile = `${workerFile}.tmp`;
    
    await fs.writeFile(tempFile, JSON.stringify(worker, null, 2));
    await fs.rename(tempFile, workerFile);
  }
  
  private generateWorkerId(): string {
    // Create a stable but unique worker ID based on hostname and process
    const hostname = os.hostname();
    const pid = process.pid;
    const timestamp = Date.now();
    const random = uuidv4().slice(0, 8);
    
    return `worker-${hostname}-${pid}-${random}`;
  }
  
  private generateSessionId(): string {
    return `session-${Date.now()}-${uuidv4().slice(0, 8)}`;
  }
  
  async registerWorker(request: RegisterWorkerRequest): Promise<WorkerIdentity> {
    const registry = await this.loadRegistry();
    
    const worker: WorkerIdentity = {
      id: this.generateWorkerId(),
      sessionId: this.generateSessionId(),
      name: request.name,
      capabilities: request.capabilities || [],
      startedAt: new Date(),
      lastSeen: new Date(),
      metadata: {
        model: process.env.CLAUDE_MODEL || 'unknown',
        user: process.env.USER || process.env.USERNAME || 'unknown',
        ...request.metadata
      }
    };
    
    registry.workers.set(worker.id, worker);
    await this.saveRegistry();
    await this.saveWorkerState(worker);
    
    this.currentWorker = worker;
    this.startHeartbeat();
    
    console.log(`🤖 Worker registered: ${worker.name || worker.id}`);
    return worker;
  }
  
  async updateHeartbeat(workerId?: string): Promise<void> {
    const registry = await this.loadRegistry();
    const targetId = workerId || this.currentWorker?.id;
    
    if (!targetId) {
      throw new WorkerNotFoundError('No worker ID provided and no current worker');
    }
    
    const worker = registry.workers.get(targetId);
    if (!worker) {
      throw new WorkerNotFoundError(targetId);
    }
    
    worker.lastSeen = new Date();
    registry.workers.set(targetId, worker);
    
    await this.saveRegistry();
    await this.saveWorkerState(worker);
  }
  
  async deregisterWorker(workerId?: string): Promise<void> {
    const registry = await this.loadRegistry();
    const targetId = workerId || this.currentWorker?.id;
    
    if (!targetId) return;
    
    registry.workers.delete(targetId);
    await this.saveRegistry();
    
    // Remove worker state file
    try {
      const workerFile = path.join(this.workersDir, `${targetId}.json`);
      await fs.unlink(workerFile);
    } catch {
      // File may not exist, ignore
    }
    
    if (targetId === this.currentWorker?.id) {
      this.stopHeartbeat();
      this.currentWorker = null;
    }
    
    console.log(`🤖 Worker deregistered: ${targetId}`);
  }
  
  async getActiveWorkers(workspaceId?: string): Promise<WorkerIdentity[]> {
    const registry = await this.loadRegistry();
    await this.cleanupInactiveWorkers();
    
    const now = Date.now();
    const workers = Array.from(registry.workers.values()).filter(worker => {
      const timeSinceLastSeen = now - worker.lastSeen.getTime();
      const isActive = timeSinceLastSeen < registry.inactiveTimeoutMs;
      
      // TODO: Filter by workspaceId if provided
      // This would require tracking which workspace each worker is active in
      
      return isActive;
    });
    
    return workers;
  }
  
  async getAllWorkers(): Promise<WorkerIdentity[]> {
    const registry = await this.loadRegistry();
    return Array.from(registry.workers.values());
  }
  
  async getWorker(workerId: string): Promise<WorkerIdentity | null> {
    const registry = await this.loadRegistry();
    return registry.workers.get(workerId) || null;
  }
  
  async getCurrentWorker(): Promise<WorkerIdentity | null> {
    return this.currentWorker;
  }
  
  async getWorkerStatus(workerId: string): Promise<WorkerStatus | null> {
    const worker = await this.getWorker(workerId);
    if (!worker) return null;
    
    const now = Date.now();
    const timeSinceLastSeen = now - worker.lastSeen.getTime();
    const isActive = timeSinceLastSeen < this.config.workerTimeoutMs;
    
    // TODO: Implement actual metrics calculation
    // This would require integration with the change logger
    const metrics: WorkerMetrics = {
      changesLast24h: 0,
      todosCompleted: 0,
      todosInProgress: 0,
      averageTimePerTodo: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      uptime: now - worker.startedAt.getTime()
    };
    
    return {
      worker,
      isActive,
      currentWork: {
        todoIds: [],
        startedAt: worker.startedAt
      },
      recentActivity: [], // TODO: Get from change logger
      metrics
    };
  }
  
  private async cleanupInactiveWorkers(): Promise<void> {
    const registry = await this.loadRegistry();
    const now = Date.now();
    
    // Only cleanup if it's been a while since last cleanup
    const timeSinceCleanup = now - registry.lastCleanup.getTime();
    if (timeSinceCleanup < 60 * 1000) return; // Cleanup at most once per minute
    
    const toRemove: string[] = [];
    
    for (const [workerId, worker] of registry.workers) {
      const timeSinceLastSeen = now - worker.lastSeen.getTime();
      if (timeSinceLastSeen > registry.inactiveTimeoutMs * 2) { // Extra buffer before removal
        toRemove.push(workerId);
      }
    }
    
    for (const workerId of toRemove) {
      console.log(`🧹 Cleaning up inactive worker: ${workerId}`);
      await this.deregisterWorker(workerId);
    }
    
    registry.lastCleanup = new Date();
    await this.saveRegistry();
  }
  
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.updateHeartbeat();
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, this.config.heartbeatIntervalMs);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  // Graceful shutdown
  async shutdown(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.currentWorker) {
      await this.deregisterWorker(this.currentWorker.id);
    }
  }
  
  // Utility methods for testing and debugging
  async resetRegistry(): Promise<void> {
    this.registry = {
      workers: new Map(),
      lastCleanup: new Date(),
      inactiveTimeoutMs: this.config.workerTimeoutMs
    };
    
    await this.saveRegistry();
    
    // Clean up worker state files
    try {
      const files = await fs.readdir(this.workersDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'worker-registry.json') {
          await fs.unlink(path.join(this.workersDir, file));
        }
      }
    } catch {
      // Directory may not exist
    }
  }
  
  async getRegistryStats(): Promise<{
    totalWorkers: number;
    activeWorkers: number;
    inactiveWorkers: number;
    averageUptime: number;
  }> {
    const allWorkers = await this.getAllWorkers();
    const activeWorkers = await this.getActiveWorkers();
    const now = Date.now();
    
    const totalUptime = allWorkers.reduce((sum, worker) => {
      return sum + (now - worker.startedAt.getTime());
    }, 0);
    
    return {
      totalWorkers: allWorkers.length,
      activeWorkers: activeWorkers.length,
      inactiveWorkers: allWorkers.length - activeWorkers.length,
      averageUptime: allWorkers.length > 0 ? totalUptime / allWorkers.length : 0
    };
  }
}

// Singleton instance for global use
let globalRegistry: WorkerRegistryManager | null = null;

export function getWorkerRegistry(config?: Partial<TrackingConfig>): WorkerRegistryManager {
  if (!globalRegistry) {
    globalRegistry = new WorkerRegistryManager(config);
  }
  return globalRegistry;
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  if (globalRegistry) {
    console.log('\n🛑 Shutting down worker registry...');
    await globalRegistry.shutdown();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (globalRegistry) {
    await globalRegistry.shutdown();
  }
  process.exit(0);
});