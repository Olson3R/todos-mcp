import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerIdentity,
  WorkerStatus,
  WorkerMetrics,
  RegisterWorkerRequest,
  TrackingConfig,
  WorkerNotFoundError,
  TrackingError
} from './tracking-types.js';

// Updated WorkerIdentity for workspace scoping
export interface ScopedWorkerIdentity extends Omit<WorkerIdentity, 'startedAt'> {
  workspaceId: string;           // Which workspace this worker is active in
  registeredAt: Date;            // When registered in this workspace
  currentProjectId?: string;     // Currently active project
}

interface WorkspaceWorkerRegistry {
  workspaceId: string;
  workers: Map<string, ScopedWorkerIdentity>;
  lastCleanup: Date;
  inactiveTimeoutMs: number;
}

export class ScopedWorkerRegistryManager {
  private baseDir = path.join(os.homedir(), '.claude-todos-mcp');
  private dataDir = path.join(this.baseDir, 'data');
  
  // Cache of workspace registries
  private registryCache = new Map<string, WorkspaceWorkerRegistry>();
  private config: TrackingConfig;
  
  constructor(config?: Partial<TrackingConfig>) {
    this.config = {
      enabled: true,
      maxEventsPerFile: 10000,
      retentionDays: 90,
      compactionInterval: 24 * 60 * 60 * 1000, // 24 hours
      maxFileSize: 10 * 1024 * 1024, // 10MB
      enableRealTimeSync: true,
      enableConflictDetection: true,
      workerTimeoutMs: 5 * 60 * 1000, // 5 minutes
      heartbeatIntervalMs: 60 * 1000, // 60 seconds
      ...config
    };
  }
  
  private async ensureDirectories(workspaceId: string): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    const workersDir = this.getWorkersDir(workspaceId);
    await fs.mkdir(workersDir, { recursive: true });
  }
  
  private getWorkspaceDir(workspaceId: string): string {
    return path.join(this.dataDir, workspaceId);
  }
  
  private getWorkersDir(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), 'workers');
  }
  
  private getRegistryFile(workspaceId: string): string {
    return path.join(this.getWorkersDir(workspaceId), 'registry.json');
  }
  
  private getWorkerFile(workspaceId: string, workerId: string): string {
    return path.join(this.getWorkersDir(workspaceId), `${workerId}.json`);
  }
  
  private async loadRegistry(workspaceId: string): Promise<WorkspaceWorkerRegistry> {
    const cached = this.registryCache.get(workspaceId);
    if (cached) return cached;
    
    await this.ensureDirectories(workspaceId);
    
    const registryFile = this.getRegistryFile(workspaceId);
    
    try {
      const data = await fs.readFile(registryFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Convert Map from JSON and fix date types
      const workers = new Map<string, ScopedWorkerIdentity>();
      for (const [workerId, workerData] of Object.entries(parsed.workers || {})) {
        const worker = workerData as any;
        workers.set(workerId, {
          ...worker,
          registeredAt: new Date(worker.registeredAt),
          lastSeen: new Date(worker.lastSeen)
        });
      }
      
      const registry: WorkspaceWorkerRegistry = {
        workspaceId,
        workers,
        lastCleanup: new Date(parsed.lastCleanup || Date.now()),
        inactiveTimeoutMs: parsed.inactiveTimeoutMs || this.config.workerTimeoutMs
      };
      
      this.registryCache.set(workspaceId, registry);
      return registry;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Create new registry
        const registry: WorkspaceWorkerRegistry = {
          workspaceId,
          workers: new Map(),
          lastCleanup: new Date(),
          inactiveTimeoutMs: this.config.workerTimeoutMs
        };
        
        this.registryCache.set(workspaceId, registry);
        return registry;
      } else {
        throw new TrackingError(`Failed to load worker registry for workspace ${workspaceId}`, 'REGISTRY_LOAD_ERROR', error);
      }
    }
  }
  
  private async saveRegistry(registry: WorkspaceWorkerRegistry): Promise<void> {
    await this.ensureDirectories(registry.workspaceId);
    
    const registryFile = this.getRegistryFile(registry.workspaceId);
    
    // Convert Map to JSON-serializable format
    const data = {
      workspaceId: registry.workspaceId,
      workers: Object.fromEntries(registry.workers),
      lastCleanup: registry.lastCleanup.toISOString(),
      inactiveTimeoutMs: registry.inactiveTimeoutMs
    };
    
    const tempFile = `${registryFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, registryFile);
    
    this.registryCache.set(registry.workspaceId, registry);
  }
  
  private async saveWorkerState(worker: ScopedWorkerIdentity): Promise<void> {
    const workerFile = this.getWorkerFile(worker.workspaceId, worker.id);
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
  
  async registerWorker(workspaceId: string, request: RegisterWorkerRequest): Promise<ScopedWorkerIdentity> {
    const registry = await this.loadRegistry(workspaceId);
    
    const worker: ScopedWorkerIdentity = {
      id: this.generateWorkerId(),
      sessionId: this.generateSessionId(),
      workspaceId,
      name: request.name,
      capabilities: request.capabilities || [],
      registeredAt: new Date(),
      lastSeen: new Date(),
      metadata: {
        model: process.env.CLAUDE_MODEL || 'unknown',
        user: process.env.USER || process.env.USERNAME || 'unknown',
        ...request.metadata
      }
    };
    
    registry.workers.set(worker.id, worker);
    await this.saveRegistry(registry);
    await this.saveWorkerState(worker);
    
    console.log(`🤖 Worker registered in workspace ${workspaceId}: ${worker.name || worker.id}`);
    return worker;
  }
  
  async updateHeartbeat(workspaceId: string, workerId: string): Promise<void> {
    const registry = await this.loadRegistry(workspaceId);
    const worker = registry.workers.get(workerId);
    
    if (!worker) {
      throw new WorkerNotFoundError(workerId);
    }
    
    worker.lastSeen = new Date();
    registry.workers.set(workerId, worker);
    
    await this.saveRegistry(registry);
    await this.saveWorkerState(worker);
  }
  
  async setCurrentProject(workspaceId: string, workerId: string, projectId?: string): Promise<void> {
    const registry = await this.loadRegistry(workspaceId);
    const worker = registry.workers.get(workerId);
    
    if (!worker) {
      throw new WorkerNotFoundError(workerId);
    }
    
    worker.currentProjectId = projectId;
    worker.lastSeen = new Date();
    registry.workers.set(workerId, worker);
    
    await this.saveRegistry(registry);
    await this.saveWorkerState(worker);
  }
  
  async deregisterWorker(workspaceId: string, workerId: string): Promise<void> {
    const registry = await this.loadRegistry(workspaceId);
    
    if (!registry.workers.has(workerId)) {
      return; // Already deregistered
    }
    
    registry.workers.delete(workerId);
    await this.saveRegistry(registry);
    
    // Remove worker state file
    try {
      const workerFile = this.getWorkerFile(workspaceId, workerId);
      await fs.unlink(workerFile);
    } catch {
      // File may not exist, ignore
    }
    
    console.log(`🤖 Worker deregistered from workspace ${workspaceId}: ${workerId}`);
  }
  
  async getActiveWorkersInWorkspace(workspaceId: string): Promise<ScopedWorkerIdentity[]> {
    const registry = await this.loadRegistry(workspaceId);
    await this.cleanupInactiveWorkers(workspaceId);
    
    const now = Date.now();
    const workers = Array.from(registry.workers.values()).filter(worker => {
      const timeSinceLastSeen = now - worker.lastSeen.getTime();
      return timeSinceLastSeen < registry.inactiveTimeoutMs;
    });
    
    return workers;
  }
  
  async getWorkersInProject(workspaceId: string, projectId: string): Promise<ScopedWorkerIdentity[]> {
    const workers = await this.getActiveWorkersInWorkspace(workspaceId);
    return workers.filter(worker => worker.currentProjectId === projectId);
  }
  
  async getWorker(workspaceId: string, workerId: string): Promise<ScopedWorkerIdentity | null> {
    const registry = await this.loadRegistry(workspaceId);
    return registry.workers.get(workerId) || null;
  }
  
  async getWorkerStatus(workspaceId: string, workerId: string): Promise<WorkerStatus | null> {
    const worker = await this.getWorker(workspaceId, workerId);
    if (!worker) return null;
    
    const now = Date.now();
    const timeSinceLastSeen = now - worker.lastSeen.getTime();
    const isActive = timeSinceLastSeen < this.config.workerTimeoutMs;
    
    // TODO: Implement actual metrics calculation from project audit logs
    const metrics: WorkerMetrics = {
      changesLast24h: 0,
      todosCompleted: 0,
      todosInProgress: 0,
      averageTimePerTodo: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      uptime: now - worker.registeredAt.getTime()
    };
    
    return {
      worker: {
        ...worker,
        startedAt: worker.registeredAt // Map registeredAt to startedAt for compatibility
      },
      isActive,
      currentWork: {
        projectId: worker.currentProjectId,
        todoIds: [], // TODO: Get from project data
        startedAt: worker.registeredAt
      },
      recentActivity: [], // TODO: Get from project audit logs
      metrics
    };
  }
  
  private async cleanupInactiveWorkers(workspaceId: string): Promise<void> {
    const registry = await this.loadRegistry(workspaceId);
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
      console.log(`🧹 Cleaning up inactive worker in workspace ${workspaceId}: ${workerId}`);
      await this.deregisterWorker(workspaceId, workerId);
    }
    
    registry.lastCleanup = new Date();
    await this.saveRegistry(registry);
  }
  
  // Get all workspaces that have active workers
  async getActiveWorkspaces(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      const workspaces: string[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspaceId = entry.name;
          const workers = await this.getActiveWorkersInWorkspace(workspaceId);
          if (workers.length > 0) {
            workspaces.push(workspaceId);
          }
        }
      }
      
      return workspaces;
    } catch {
      return [];
    }
  }
  
  // Utility methods for testing and debugging
  async resetWorkspaceRegistry(workspaceId: string): Promise<void> {
    const registry: WorkspaceWorkerRegistry = {
      workspaceId,
      workers: new Map(),
      lastCleanup: new Date(),
      inactiveTimeoutMs: this.config.workerTimeoutMs
    };
    
    await this.saveRegistry(registry);
    
    // Clean up worker state files
    try {
      const workersDir = this.getWorkersDir(workspaceId);
      const files = await fs.readdir(workersDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'registry.json') {
          await fs.unlink(path.join(workersDir, file));
        }
      }
    } catch {
      // Directory may not exist
    }
  }
  
  async getRegistryStats(workspaceId: string): Promise<{
    totalWorkers: number;
    activeWorkers: number;
    inactiveWorkers: number;
    averageUptime: number;
    projectDistribution: Record<string, number>;
  }> {
    const registry = await this.loadRegistry(workspaceId);
    const allWorkers = Array.from(registry.workers.values());
    const activeWorkers = await this.getActiveWorkersInWorkspace(workspaceId);
    const now = Date.now();
    
    const totalUptime = allWorkers.reduce((sum, worker) => {
      return sum + (now - worker.registeredAt.getTime());
    }, 0);
    
    const projectDistribution: Record<string, number> = {};
    activeWorkers.forEach(worker => {
      if (worker.currentProjectId) {
        projectDistribution[worker.currentProjectId] = (projectDistribution[worker.currentProjectId] || 0) + 1;
      }
    });
    
    return {
      totalWorkers: allWorkers.length,
      activeWorkers: activeWorkers.length,
      inactiveWorkers: allWorkers.length - activeWorkers.length,
      averageUptime: allWorkers.length > 0 ? totalUptime / allWorkers.length : 0,
      projectDistribution
    };
  }
}