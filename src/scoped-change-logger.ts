import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  ChangeEvent,
  AuditLog,
  ChangeFilter,
  TrackingConfig,
  ConflictInfo,
  Checkpoint,
  RollbackResult,
  CreateCheckpointRequest,
  RollbackChangeRequest,
  TrackingError,
  ConflictError,
  AuditLogCorruptError,
  FieldChange,
  ChangeType,
  EntityType,
  ActionType
} from './tracking-types.js';

// Project-scoped audit log
interface ProjectAuditLog {
  projectId: string;
  workspaceId: string;
  events: ChangeEvent[];
  lastCompacted: Date;
  retentionDays: number;
  version: string;
}

// Workspace-level audit log (for workspace events like project creation)
interface WorkspaceAuditLog {
  workspaceId: string;
  events: ChangeEvent[];
  lastCompacted: Date;
  retentionDays: number;
  version: string;
}

export class ProjectChangeLogger {
  private projectId: string;
  private workspaceId: string;
  private baseDir = path.join(os.homedir(), '.claude-todos-mcp');
  private dataDir = path.join(this.baseDir, 'data');
  private config: TrackingConfig;
  private auditLogCache: ProjectAuditLog | null = null;
  
  constructor(projectId: string, workspaceId: string, config?: Partial<TrackingConfig>) {
    this.projectId = projectId;
    this.workspaceId = workspaceId;
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
  
  private async ensureDirectories(): Promise<void> {
    const projectDir = this.getProjectDir();
    const checkpointsDir = path.join(projectDir, 'checkpoints');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(checkpointsDir, { recursive: true });
  }
  
  private getProjectDir(): string {
    return path.join(this.dataDir, this.workspaceId, 'projects', this.projectId);
  }
  
  private getProjectAuditLogPath(): string {
    return path.join(this.getProjectDir(), 'audit-log.json');
  }
  
  private async loadProjectAuditLog(): Promise<ProjectAuditLog> {
    if (this.auditLogCache) return this.auditLogCache;
    
    const logPath = this.getProjectAuditLogPath();
    
    try {
      const data = await fs.readFile(logPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      const auditLog: ProjectAuditLog = {
        projectId: this.projectId,
        workspaceId: this.workspaceId,
        events: parsed.events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
          relatedChanges: e.relatedChanges || [],
          conflictsWith: e.conflictsWith || [],
          changes: e.changes || []
        })),
        lastCompacted: new Date(parsed.lastCompacted || Date.now()),
        retentionDays: parsed.retentionDays || this.config.retentionDays,
        version: parsed.version || '1.0.0'
      };
      
      this.auditLogCache = auditLog;
      return auditLog;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Create new audit log
        const auditLog: ProjectAuditLog = {
          projectId: this.projectId,
          workspaceId: this.workspaceId,
          events: [],
          lastCompacted: new Date(),
          retentionDays: this.config.retentionDays,
          version: '1.0.0'
        };
        
        this.auditLogCache = auditLog;
        return auditLog;
      } else {
        throw new AuditLogCorruptError(this.projectId, (error as Error).message);
      }
    }
  }
  
  private async saveProjectAuditLog(auditLog: ProjectAuditLog): Promise<void> {
    if (!this.config.enabled) return;
    
    await this.ensureDirectories();
    
    const logPath = this.getProjectAuditLogPath();
    const tempPath = `${logPath}.tmp`;
    
    const data = {
      projectId: auditLog.projectId,
      workspaceId: auditLog.workspaceId,
      events: auditLog.events,
      lastCompacted: auditLog.lastCompacted.toISOString(),
      retentionDays: auditLog.retentionDays,
      version: auditLog.version
    };
    
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, logPath);
    
    this.auditLogCache = auditLog;
  }
  
  private calculateFieldChanges(oldValue: any, newValue: any): FieldChange[] {
    const changes: FieldChange[] = [];
    
    if (!oldValue && newValue) {
      // Creation - all fields are new
      Object.keys(newValue).forEach(key => {
        if (newValue[key] !== undefined) {
          changes.push({
            field: key,
            newValue: newValue[key],
            type: 'added'
          });
        }
      });
    } else if (oldValue && !newValue) {
      // Deletion - all fields are removed
      Object.keys(oldValue).forEach(key => {
        changes.push({
          field: key,
          oldValue: oldValue[key],
          type: 'removed'
        });
      });
    } else if (oldValue && newValue) {
      // Update - compare fields
      const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
      
      allKeys.forEach(key => {
        const oldVal = oldValue[key];
        const newVal = newValue[key];
        
        if (oldVal === undefined && newVal !== undefined) {
          changes.push({
            field: key,
            newValue: newVal,
            type: 'added'
          });
        } else if (oldVal !== undefined && newVal === undefined) {
          changes.push({
            field: key,
            oldValue: oldVal,
            type: 'removed'
          });
        } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push({
            field: key,
            oldValue: oldVal,
            newValue: newVal,
            type: 'modified'
          });
        }
      });
    }
    
    return changes;
  }
  
  async logChange(event: Omit<ChangeEvent, 'id' | 'timestamp' | 'projectId' | 'workspaceId'>): Promise<ChangeEvent> {
    if (!this.config.enabled) {
      return { 
        ...event, 
        id: 'disabled', 
        timestamp: new Date(),
        projectId: this.projectId,
        workspaceId: this.workspaceId
      } as ChangeEvent;
    }
    
    const startTime = Date.now();
    
    const changeEvent: ChangeEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      projectId: this.projectId,
      workspaceId: this.workspaceId,
      changes: event.changes || this.calculateFieldChanges(event.oldValue, event.newValue),
      relatedChanges: event.relatedChanges || [],
      conflictsWith: event.conflictsWith || [],
      duration: undefined // Will be set at the end
    };
    
    // Load project audit log
    const auditLog = await this.loadProjectAuditLog();
    
    // Check for conflicts if enabled
    if (this.config.enableConflictDetection) {
      const conflicts = await this.detectConflicts(changeEvent, auditLog);
      if (conflicts.length > 0) {
        changeEvent.conflictsWith = conflicts.map(c => c.id);
        
        // If there are high-severity conflicts, consider throwing an error
        const highSeverityConflicts = conflicts.filter(c => c.severity === 'high');
        if (highSeverityConflicts.length > 0) {
          throw new ConflictError('High-severity conflicts detected', highSeverityConflicts);
        }
      }
    }
    
    // Add event to audit log
    auditLog.events.push(changeEvent);
    
    // Check if compaction is needed
    if (auditLog.events.length > this.config.maxEventsPerFile) {
      await this.compactAuditLog(auditLog);
    }
    
    // Save audit log
    await this.saveProjectAuditLog(auditLog);
    
    changeEvent.duration = Date.now() - startTime;
    
    return changeEvent;
  }
  
  private async detectConflicts(event: ChangeEvent, auditLog: ProjectAuditLog): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];
    const recentEvents = auditLog.events.filter(e => 
      e.timestamp.getTime() > Date.now() - (5 * 60 * 1000) // Last 5 minutes
    );
    
    for (const recentEvent of recentEvents) {
      // Same entity, different workers
      if (recentEvent.entityType === event.entityType &&
          recentEvent.entityId === event.entityId &&
          recentEvent.workerId !== event.workerId) {
        
        // Concurrent edit conflict
        if (recentEvent.action === 'update' && event.action === 'update') {
          const conflictingFields = event.changes.filter(change =>
            recentEvent.changes.some(rc => rc.field === change.field)
          );
          
          if (conflictingFields.length > 0) {
            conflicts.push({
              id: uuidv4(),
              type: 'concurrent_edit',
              events: [recentEvent, event],
              severity: 'medium',
              autoResolvable: false,
              description: `Workers ${recentEvent.workerId} and ${event.workerId} both modified ${event.entityType} ${event.entityId}`,
              suggestedResolution: 'Manual review required to merge changes'
            });
          }
        }
      }
    }
    
    return conflicts;
  }
  
  async getChanges(filters: ChangeFilter = {}): Promise<ChangeEvent[]> {
    const auditLog = await this.loadProjectAuditLog();
    let filteredEvents = auditLog.events;
    
    // Apply filters
    if (filters.workerId) {
      filteredEvents = filteredEvents.filter(e => e.workerId === filters.workerId);
    }
    
    if (filters.entityType) {
      filteredEvents = filteredEvents.filter(e => e.entityType === filters.entityType);
    }
    
    if (filters.entityId) {
      filteredEvents = filteredEvents.filter(e => e.entityId === filters.entityId);
    }
    
    if (filters.changeType) {
      filteredEvents = filteredEvents.filter(e => filters.changeType!.includes(e.type));
    }
    
    if (filters.action) {
      filteredEvents = filteredEvents.filter(e => filters.action!.includes(e.action));
    }
    
    if (filters.since) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.since!);
    }
    
    if (filters.until) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.until!);
    }
    
    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    if (filters.offset) {
      filteredEvents = filteredEvents.slice(filters.offset);
    }
    
    if (filters.limit) {
      filteredEvents = filteredEvents.slice(0, filters.limit);
    }
    
    return filteredEvents;
  }
  
  async getChangeHistory(entityType: EntityType, entityId: string): Promise<ChangeEvent[]> {
    return this.getChanges({
      entityType,
      entityId
    });
  }
  
  private async compactAuditLog(auditLog: ProjectAuditLog): Promise<void> {
    const cutoffDate = new Date(Date.now() - (auditLog.retentionDays * 24 * 60 * 60 * 1000));
    
    // Separate recent and old events
    const recentEvents = auditLog.events.filter(e => e.timestamp >= cutoffDate);
    const oldEvents = auditLog.events.filter(e => e.timestamp < cutoffDate);
    
    if (oldEvents.length > 0) {
      // Archive old events
      const archivePath = path.join(
        this.getProjectDir(),
        'checkpoints',
        `audit-log-archive-${Date.now()}.json`
      );
      
      await fs.writeFile(archivePath, JSON.stringify(oldEvents, null, 2));
      console.log(`📦 Archived ${oldEvents.length} old audit events for project ${this.projectId}`);
    }
    
    // Keep only recent events
    auditLog.events = recentEvents;
    auditLog.lastCompacted = new Date();
  }
  
  async getStats(): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByWorker: Record<string, number>;
    oldestEvent?: Date;
    newestEvent?: Date;
  }> {
    const auditLog = await this.loadProjectAuditLog();
    
    const eventsByType: Record<string, number> = {};
    const eventsByWorker: Record<string, number> = {};
    
    auditLog.events.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsByWorker[event.workerId] = (eventsByWorker[event.workerId] || 0) + 1;
    });
    
    const timestamps = auditLog.events.map(e => e.timestamp);
    const oldestEvent = timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : undefined;
    const newestEvent = timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : undefined;
    
    return {
      totalEvents: auditLog.events.length,
      eventsByType,
      eventsByWorker,
      oldestEvent,
      newestEvent
    };
  }
  
  async clearCache(): Promise<void> {
    this.auditLogCache = null;
  }
}

export class WorkspaceChangeLogger {
  private workspaceId: string;
  private baseDir = path.join(os.homedir(), '.claude-todos-mcp');
  private dataDir = path.join(this.baseDir, 'data');
  private config: TrackingConfig;
  private auditLogCache: WorkspaceAuditLog | null = null;
  
  constructor(workspaceId: string, config?: Partial<TrackingConfig>) {
    this.workspaceId = workspaceId;
    this.config = {
      enabled: true,
      maxEventsPerFile: 10000,
      retentionDays: 90,
      compactionInterval: 24 * 60 * 60 * 1000,
      maxFileSize: 10 * 1024 * 1024,
      enableRealTimeSync: true,
      enableConflictDetection: true,
      workerTimeoutMs: 5 * 60 * 1000,
      heartbeatIntervalMs: 60 * 1000,
      ...config
    };
  }
  
  private async ensureDirectories(): Promise<void> {
    const workspaceDir = this.getWorkspaceDir();
    await fs.mkdir(workspaceDir, { recursive: true });
  }
  
  private getWorkspaceDir(): string {
    return path.join(this.dataDir, this.workspaceId);
  }
  
  private getWorkspaceAuditLogPath(): string {
    return path.join(this.getWorkspaceDir(), 'audit-log.json');
  }
  
  private async loadWorkspaceAuditLog(): Promise<WorkspaceAuditLog> {
    if (this.auditLogCache) return this.auditLogCache;
    
    const logPath = this.getWorkspaceAuditLogPath();
    
    try {
      const data = await fs.readFile(logPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      const auditLog: WorkspaceAuditLog = {
        workspaceId: this.workspaceId,
        events: parsed.events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        })),
        lastCompacted: new Date(parsed.lastCompacted || Date.now()),
        retentionDays: parsed.retentionDays || this.config.retentionDays,
        version: parsed.version || '1.0.0'
      };
      
      this.auditLogCache = auditLog;
      return auditLog;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Create new audit log
        const auditLog: WorkspaceAuditLog = {
          workspaceId: this.workspaceId,
          events: [],
          lastCompacted: new Date(),
          retentionDays: this.config.retentionDays,
          version: '1.0.0'
        };
        
        this.auditLogCache = auditLog;
        return auditLog;
      } else {
        throw new AuditLogCorruptError(this.workspaceId, (error as Error).message);
      }
    }
  }
  
  private async saveWorkspaceAuditLog(auditLog: WorkspaceAuditLog): Promise<void> {
    if (!this.config.enabled) return;
    
    await this.ensureDirectories();
    
    const logPath = this.getWorkspaceAuditLogPath();
    const tempPath = `${logPath}.tmp`;
    
    const data = {
      workspaceId: auditLog.workspaceId,
      events: auditLog.events,
      lastCompacted: auditLog.lastCompacted.toISOString(),
      retentionDays: auditLog.retentionDays,
      version: auditLog.version
    };
    
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, logPath);
    
    this.auditLogCache = auditLog;
  }
  
  async logChange(event: Omit<ChangeEvent, 'id' | 'timestamp' | 'workspaceId'>): Promise<ChangeEvent> {
    if (!this.config.enabled) {
      return { 
        ...event, 
        id: 'disabled', 
        timestamp: new Date(),
        workspaceId: this.workspaceId
      } as ChangeEvent;
    }
    
    const changeEvent: ChangeEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      workspaceId: this.workspaceId,
      changes: event.changes || [],
      relatedChanges: event.relatedChanges || [],
      conflictsWith: event.conflictsWith || []
    };
    
    const auditLog = await this.loadWorkspaceAuditLog();
    auditLog.events.push(changeEvent);
    await this.saveWorkspaceAuditLog(auditLog);
    
    return changeEvent;
  }
  
  async getChanges(filters: ChangeFilter = {}): Promise<ChangeEvent[]> {
    const auditLog = await this.loadWorkspaceAuditLog();
    let filteredEvents = auditLog.events;
    
    // Apply similar filtering as ProjectChangeLogger
    if (filters.workerId) {
      filteredEvents = filteredEvents.filter(e => e.workerId === filters.workerId);
    }
    
    if (filters.since) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.since!);
    }
    
    if (filters.until) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.until!);
    }
    
    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    if (filters.limit) {
      filteredEvents = filteredEvents.slice(0, filters.limit);
    }
    
    return filteredEvents;
  }
}