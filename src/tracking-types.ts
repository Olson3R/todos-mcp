// State Change Tracking Types

export interface WorkerIdentity {
  id: string;              // Unique worker ID (persistent across sessions)
  sessionId: string;       // Current session ID (changes per restart)
  name?: string;           // Human-readable name (e.g., "Claude-Design", "Claude-Backend")
  capabilities: string[];  // What this worker can do ["coding", "testing", "documentation"]
  startedAt: Date;         // When this worker session started
  lastSeen: Date;          // Last heartbeat
  metadata: {
    model?: string;        // AI model version
    user?: string;         // User who started this worker
    purpose?: string;      // What this worker is working on
    environment?: string;  // Development environment info
  };
}

export interface ChangeEvent {
  id: string;              // Unique change ID
  workerId: string;        // Worker that made the change
  sessionId: string;       // Session when change was made
  timestamp: Date;         // When the change occurred
  type: ChangeType;        // Type of change
  entityType: EntityType; // What was changed
  entityId: string;        // ID of the changed entity
  projectId?: string;      // Project context (for todos/phases)
  workspaceId: string;     // Workspace context
  
  // Change details
  action: ActionType;      // create, update, delete, reorder
  oldValue?: any;          // Previous state (for updates/deletes)
  newValue?: any;          // New state (for creates/updates)
  changes: FieldChange[];  // Specific field changes
  
  // Context
  reason?: string;         // Why this change was made
  relatedChanges: string[]; // IDs of related changes in this operation
  conflictsWith?: string[]; // IDs of conflicting changes
  duration?: number;       // How long the operation took (ms)
}

export type ChangeType = 
  | 'project.created' | 'project.updated' | 'project.deleted'
  | 'todo.created' | 'todo.updated' | 'todo.deleted' | 'todo.reordered'
  | 'todo.dependency.added' | 'todo.dependency.removed'
  | 'phase.created' | 'phase.updated' | 'phase.deleted'
  | 'document.attached' | 'document.removed'
  | 'dependency.added' | 'dependency.removed'  // Future
  | 'lock.acquired' | 'lock.released'          // Future
  | 'worker.registered' | 'worker.heartbeat' | 'worker.deregistered'
  | 'workspace.worker.registered' | 'workspace.worker.deregistered'
  | 'workspace.project.created' | 'workspace.project.deleted';

export type EntityType = 'project' | 'todo' | 'phase' | 'document' | 'workspace' | 'worker';
export type ActionType = 'create' | 'update' | 'delete' | 'reorder' | 'lock' | 'unlock' | 'register' | 'heartbeat';

export interface FieldChange {
  field: string;
  oldValue?: any;
  newValue?: any;
  type: 'added' | 'modified' | 'removed';
}

export interface AuditLog {
  workspaceId: string;
  events: ChangeEvent[];
  lastCompacted: Date;     // When log was last compacted
  retentionDays: number;   // How long to keep events
  version: string;         // Audit log format version
}

export interface WorkerRegistry {
  workers: Map<string, WorkerIdentity>;
  lastCleanup: Date;
  inactiveTimeoutMs: number; // How long before worker is considered inactive
}

// Conflict detection
export interface ConflictInfo {
  id: string;
  type: 'concurrent_edit' | 'dependency_violation' | 'lock_conflict' | 'stale_data';
  events: ChangeEvent[];
  severity: 'low' | 'medium' | 'high';
  autoResolvable: boolean;
  description: string;
  suggestedResolution?: string;
}

// Worker status and metrics
export interface WorkerStatus {
  worker: WorkerIdentity;
  isActive: boolean;
  currentWork: {
    projectId?: string;
    todoIds: string[];
    startedAt: Date;
  };
  recentActivity: ChangeEvent[];
  metrics: WorkerMetrics;
}

export interface WorkerMetrics {
  changesLast24h: number;
  todosCompleted: number;
  todosInProgress: number;
  averageTimePerTodo: number;
  conflictsDetected: number;
  conflictsResolved: number;
  uptime: number; // milliseconds
}

// Query filters
export interface ChangeFilter {
  workspaceId?: string;
  projectId?: string;
  workerId?: string;
  entityType?: EntityType;
  entityId?: string;
  changeType?: ChangeType[];
  action?: ActionType[];
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// Checkpoints for rollback
export interface Checkpoint {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdAt: Date;
  createdBy: string; // worker ID
  dataSnapshot: any; // Compressed workspace state
  changeEventId: string; // Last change before checkpoint
}

export interface RollbackResult {
  success: boolean;
  rolledBackChanges: string[]; // Change IDs that were reversed
  conflicts: ConflictInfo[];   // Conflicts that prevented rollback
  newCheckpointId?: string;    // Created checkpoint before rollback
  message: string;
}

// Analytics
export interface ProductivityMetrics {
  workerId: string;
  timeRange: TimeRange;
  todosCompleted: number;
  todosCreated: number;
  todosUpdated: number;
  averageCompletionTime: number;
  peakProductivityHour: number;
  collaborationScore: number; // How well this worker collaborates
  qualityScore: number;       // Based on how often changes are reverted
}

export interface CollaborationInsights {
  projectId: string;
  timeRange: TimeRange;
  activeWorkers: number;
  totalChanges: number;
  conflictRate: number;
  mostActiveWorker: string;
  mostProductiveHour: number;
  collaborationEvents: {
    handoffs: number;        // Worker A completes todo, Worker B starts next
    conflicts: number;       // Direct conflicts between workers
    dependencies: number;    // Worker waits for another's completion
  };
}

export interface BottleneckAnalysis {
  workspaceId: string;
  timeRange: TimeRange;
  bottlenecks: {
    type: 'worker_overload' | 'dependency_chain' | 'resource_conflict' | 'approval_delay';
    severity: number;        // 0-1 scale
    description: string;
    affectedWorkers: string[];
    suggestedAction: string;
    estimatedImpact: string; // Time saved if resolved
  }[];
}

// Request/Response types for MCP tools
export interface RegisterWorkerRequest {
  name?: string;
  capabilities?: string[];
  purpose?: string;
  metadata?: Record<string, any>;
}

export interface ListWorkersRequest {
  workspaceId?: string;
  activeOnly?: boolean;
}

export interface GetChangeHistoryRequest {
  entityType: EntityType;
  entityId: string;
  limit?: number;
  since?: Date;
}

export interface GetRecentChangesRequest {
  workspaceId?: string;
  projectId?: string;
  workerId?: string;
  limit?: number;
  since?: Date;
}

export interface GetWorkerActivityRequest {
  workerId?: string;  // Defaults to current worker
  timeRange?: 'hour' | 'day' | 'week' | 'month';
}

export interface DetectConflictsRequest {
  workspaceId?: string;
  projectId?: string;
  autoResolve?: boolean;
}

export interface CreateCheckpointRequest {
  workspaceId: string;
  name: string;
  description?: string;
}

export interface ListCheckpointsRequest {
  workspaceId: string;
  limit?: number;
}

export interface RollbackChangeRequest {
  changeId: string;
  reason: string;
  createCheckpoint?: boolean;
}

export interface RollbackToCheckpointRequest {
  checkpointId: string;
  reason: string;
}

// Configuration
export interface TrackingConfig {
  enabled: boolean;
  maxEventsPerFile: number;      // Default: 10,000
  retentionDays: number;         // Default: 90
  compactionInterval: number;    // Default: 24 hours (ms)
  maxFileSize: number;           // Default: 10MB
  enableRealTimeSync: boolean;   // Default: true
  enableConflictDetection: boolean; // Default: true
  workerTimeoutMs: number;       // Default: 5 minutes
  heartbeatIntervalMs: number;   // Default: 60 seconds
}

export interface AuditPermissions {
  canViewOwnChanges: boolean;     // Default: true
  canViewAllChanges: boolean;     // Default: false (admin only)
  canRollbackOwnChanges: boolean; // Default: true
  canRollbackAllChanges: boolean; // Default: false (admin only)
  canDeleteAuditLogs: boolean;    // Default: false (admin only)
  canCreateCheckpoints: boolean;  // Default: true
  canManageWorkers: boolean;      // Default: false (admin only)
}

// Error types
export class TrackingError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'TrackingError';
  }
}

export class ConflictError extends TrackingError {
  constructor(message: string, public conflicts: ConflictInfo[]) {
    super(message, 'CONFLICT_DETECTED', conflicts);
  }
}

export class WorkerNotFoundError extends TrackingError {
  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`, 'WORKER_NOT_FOUND', { workerId });
  }
}

export class AuditLogCorruptError extends TrackingError {
  constructor(workspaceId: string, reason: string) {
    super(`Audit log corrupted for workspace ${workspaceId}: ${reason}`, 'AUDIT_LOG_CORRUPT', { workspaceId, reason });
  }
}