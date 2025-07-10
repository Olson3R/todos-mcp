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

export class ChangeLogger {
  private baseDir = path.join(os.homedir(), '.claude-todos-mcp');
  private dataDir = path.join(this.baseDir, 'data');
  private backupsDir = path.join(this.baseDir, 'backups', 'audit-logs');
  
  private auditLogCache = new Map<string, AuditLog>();
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
  
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.backupsDir, { recursive: true });
  }
  
  private getAuditLogPath(workspaceId: string): string {
    return path.join(this.dataDir, workspaceId, 'audit-log.json');
  }
  
  private async loadAuditLog(workspaceId: string): Promise<AuditLog> {
    const cached = this.auditLogCache.get(workspaceId);
    if (cached) return cached;
    
    const logPath = this.getAuditLogPath(workspaceId);
    
    try {
      const data = await fs.readFile(logPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      const auditLog: AuditLog = {
        workspaceId,
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
      
      this.auditLogCache.set(workspaceId, auditLog);
      return auditLog;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Create new audit log
        const auditLog: AuditLog = {
          workspaceId,
          events: [],
          lastCompacted: new Date(),
          retentionDays: this.config.retentionDays,
          version: '1.0.0'
        };
        
        this.auditLogCache.set(workspaceId, auditLog);
        return auditLog;
      } else {
        throw new AuditLogCorruptError(workspaceId, (error as Error).message);
      }
    }
  }
  
  private async saveAuditLog(auditLog: AuditLog): Promise<void> {
    if (!this.config.enabled) return;
    
    await this.ensureDirectories();
    
    const workspaceDir = path.dirname(this.getAuditLogPath(auditLog.workspaceId));
    await fs.mkdir(workspaceDir, { recursive: true });
    
    const logPath = this.getAuditLogPath(auditLog.workspaceId);
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
    
    this.auditLogCache.set(auditLog.workspaceId, auditLog);
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
  
  async logChange(event: Omit<ChangeEvent, 'id' | 'timestamp'>): Promise<ChangeEvent> {
    if (!this.config.enabled) {
      return { ...event, id: 'disabled', timestamp: new Date() } as ChangeEvent;
    }
    
    const startTime = Date.now();
    
    const changeEvent: ChangeEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      changes: event.changes || this.calculateFieldChanges(event.oldValue, event.newValue),
      relatedChanges: event.relatedChanges || [],
      conflictsWith: event.conflictsWith || [],
      duration: undefined // Will be set at the end
    };
    
    // Load audit log for the workspace
    const auditLog = await this.loadAuditLog(event.workspaceId);
    
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
    await this.saveAuditLog(auditLog);
    
    changeEvent.duration = Date.now() - startTime;
    
    if (this.config.enableRealTimeSync) {
      // Emit event for real-time subscribers (future feature)
      // this.emit('change', changeEvent);
    }
    
    return changeEvent;
  }
  
  private async detectConflicts(event: ChangeEvent, auditLog: AuditLog): Promise<ConflictInfo[]> {
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
        
        // Lock conflict (future feature)
        if (recentEvent.type.includes('lock') && event.action === 'update') {
          conflicts.push({
            id: uuidv4(),
            type: 'lock_conflict',
            events: [recentEvent, event],
            severity: 'high',
            autoResolvable: false,
            description: `Worker ${event.workerId} attempted to modify locked ${event.entityType} ${event.entityId}`,
            suggestedResolution: 'Wait for lock to be released or contact lock holder'
          });
        }
      }
      
      // Dependency violations (future feature)
      // This would require dependency graph integration
    }
    
    return conflicts;
  }
  
  async getChanges(filter: ChangeFilter): Promise<ChangeEvent[]> {
    const workspaceIds = filter.workspaceId ? [filter.workspaceId] : await this.getAllWorkspaceIds();
    let allEvents: ChangeEvent[] = [];
    
    for (const workspaceId of workspaceIds) {
      const auditLog = await this.loadAuditLog(workspaceId);
      allEvents = allEvents.concat(auditLog.events);
    }
    
    // Apply filters
    let filteredEvents = allEvents;
    
    if (filter.projectId) {
      filteredEvents = filteredEvents.filter(e => e.projectId === filter.projectId);
    }
    
    if (filter.workerId) {
      filteredEvents = filteredEvents.filter(e => e.workerId === filter.workerId);
    }
    
    if (filter.entityType) {
      filteredEvents = filteredEvents.filter(e => e.entityType === filter.entityType);
    }
    
    if (filter.entityId) {
      filteredEvents = filteredEvents.filter(e => e.entityId === filter.entityId);
    }
    
    if (filter.changeType) {
      filteredEvents = filteredEvents.filter(e => filter.changeType!.includes(e.type));
    }
    
    if (filter.action) {
      filteredEvents = filteredEvents.filter(e => filter.action!.includes(e.action));
    }
    
    if (filter.since) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= filter.since!);
    }
    
    if (filter.until) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= filter.until!);
    }
    
    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    if (filter.offset) {
      filteredEvents = filteredEvents.slice(filter.offset);
    }
    
    if (filter.limit) {
      filteredEvents = filteredEvents.slice(0, filter.limit);
    }
    
    return filteredEvents;
  }
  
  async getChangeHistory(entityType: EntityType, entityId: string): Promise<ChangeEvent[]> {
    return this.getChanges({
      entityType,
      entityId
    });
  }
  
  private async getAllWorkspaceIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }
  
  private async compactAuditLog(auditLog: AuditLog): Promise<void> {
    const cutoffDate = new Date(Date.now() - (auditLog.retentionDays * 24 * 60 * 60 * 1000));
    
    // Separate recent and old events
    const recentEvents = auditLog.events.filter(e => e.timestamp >= cutoffDate);
    const oldEvents = auditLog.events.filter(e => e.timestamp < cutoffDate);
    
    if (oldEvents.length > 0) {
      // Archive old events
      const archivePath = path.join(
        this.backupsDir,
        auditLog.workspaceId,
        `audit-log-${Date.now()}.json`
      );
      
      await fs.mkdir(path.dirname(archivePath), { recursive: true });
      await fs.writeFile(archivePath, JSON.stringify(oldEvents, null, 2));
      
      console.log(`📦 Archived ${oldEvents.length} old audit events to ${archivePath}`);
    }
    
    // Keep only recent events
    auditLog.events = recentEvents;
    auditLog.lastCompacted = new Date();
  }
  
  async createCheckpoint(request: CreateCheckpointRequest, createdBy: string): Promise<Checkpoint> {
    // TODO: Implement checkpoint creation
    // This would require capturing the full workspace state
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      workspaceId: request.workspaceId,
      name: request.name,
      description: request.description,
      createdAt: new Date(),
      createdBy,
      dataSnapshot: {}, // TODO: Capture actual workspace state
      changeEventId: '' // TODO: Get last change event ID
    };
    
    // Save checkpoint
    const checkpointPath = path.join(this.backupsDir, request.workspaceId, 'checkpoints', `${checkpoint.id}.json`);
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
    
    return checkpoint;
  }
  
  async rollbackChange(request: RollbackChangeRequest): Promise<RollbackResult> {
    // TODO: Implement change rollback
    // This would require understanding how to reverse each type of change
    return {
      success: false,
      rolledBackChanges: [],
      conflicts: [],
      message: 'Rollback not yet implemented'
    };
  }
  
  // Utility methods
  async getStats(workspaceId: string): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByWorker: Record<string, number>;
    oldestEvent?: Date;
    newestEvent?: Date;
  }> {
    const auditLog = await this.loadAuditLog(workspaceId);
    
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
    this.auditLogCache.clear();
  }
}