# State Change Tracking Design

## Overview

Adding comprehensive state change tracking to todos-mcp to monitor which worker made what changes, enabling better coordination, debugging, and audit trails for concurrent work.

## Goals

1. **Full Audit Trail**: Track every change to todos, projects, and phases
2. **Worker Attribution**: Identify which Claude instance made each change
3. **Change History**: Maintain complete history of state transitions
4. **Conflict Detection**: Identify when multiple workers modify the same entity
5. **Performance Monitoring**: Track worker efficiency and bottlenecks
6. **Rollback Capability**: Enable reverting problematic changes

## Data Model

### Worker Identity

```typescript
interface WorkerIdentity {
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
  };
}
```

### Change Event

```typescript
interface ChangeEvent {
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
}

type ChangeType = 
  | 'project.created' | 'project.updated' | 'project.deleted'
  | 'todo.created' | 'todo.updated' | 'todo.deleted' | 'todo.reordered'
  | 'phase.created' | 'phase.updated' | 'phase.deleted'
  | 'document.attached' | 'document.removed'
  | 'dependency.added' | 'dependency.removed'  // Future
  | 'lock.acquired' | 'lock.released';         // Future

type EntityType = 'project' | 'todo' | 'phase' | 'document' | 'workspace';
type ActionType = 'create' | 'update' | 'delete' | 'reorder' | 'lock' | 'unlock';

interface FieldChange {
  field: string;
  oldValue?: any;
  newValue?: any;
}
```

### Audit Log Storage

```typescript
interface AuditLog {
  workspaceId: string;
  events: ChangeEvent[];
  lastCompacted: Date;     // When log was last compacted
  retentionDays: number;   // How long to keep events
}
```

## File Structure Updates

```
~/.claude-todos-mcp/
├── config.json
├── workers/
│   ├── worker-registry.json     # Active worker registry
│   └── {worker-id}.json         # Individual worker state
├── data/
│   └── {workspace-id}/
│       ├── workspace.json
│       ├── project-{id}.json
│       └── audit-log.json       # Change events for this workspace
└── backups/
    └── audit-logs/              # Archived audit logs
```

## Implementation Strategy

### Phase 1: Core Tracking Infrastructure

1. **Worker Registration System**
   ```typescript
   class WorkerRegistry {
     async registerWorker(identity: Partial<WorkerIdentity>): Promise<WorkerIdentity>
     async updateHeartbeat(workerId: string): Promise<void>
     async getActiveWorkers(workspaceId?: string): Promise<WorkerIdentity[]>
     async deregisterWorker(workerId: string): Promise<void>
   }
   ```

2. **Change Event Logger**
   ```typescript
   class ChangeLogger {
     async logChange(event: Omit<ChangeEvent, 'id' | 'timestamp'>): Promise<ChangeEvent>
     async getChanges(filters: ChangeFilter): Promise<ChangeEvent[]>
     async getChangeHistory(entityType: EntityType, entityId: string): Promise<ChangeEvent[]>
   }
   ```

3. **Enhanced Storage Operations**
   ```typescript
   class TrackedTodosStorage extends TodosStorageV2 {
     private logger: ChangeLogger;
     private worker: WorkerIdentity;
     
     // Override all mutation methods to log changes
     async createProject(request: CreateProjectRequest): Promise<Project> {
       const project = await super.createProject(request);
       await this.logger.logChange({
         workerId: this.worker.id,
         sessionId: this.worker.sessionId,
         type: 'project.created',
         entityType: 'project',
         entityId: project.id,
         workspaceId: project.workspaceId,
         action: 'create',
         newValue: project,
         changes: []
       });
       return project;
     }
   }
   ```

### Phase 2: Worker Coordination

1. **Worker Status Dashboard**
   ```typescript
   interface WorkerStatus {
     worker: WorkerIdentity;
     currentWork: {
       projectId?: string;
       todoIds: string[];
       startedAt: Date;
     };
     recentActivity: ChangeEvent[];
     metrics: {
       changesLast24h: number;
       todosCompleted: number;
       averageTimePerTodo: number;
     };
   }
   ```

2. **Conflict Detection**
   ```typescript
   class ConflictDetector {
     async detectConflicts(event: ChangeEvent): Promise<ConflictInfo[]>
     async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void>
   }
   
   interface ConflictInfo {
     id: string;
     type: 'concurrent_edit' | 'dependency_violation' | 'lock_conflict';
     events: ChangeEvent[];
     severity: 'low' | 'medium' | 'high';
     autoResolvable: boolean;
   }
   ```

### Phase 3: Advanced Features

1. **Change Rollback**
   ```typescript
   class ChangeRollback {
     async createCheckpoint(workspaceId: string, name: string): Promise<Checkpoint>
     async rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult>
     async rollbackChange(changeId: string): Promise<RollbackResult>
   }
   ```

2. **Analytics and Insights**
   ```typescript
   class WorkerAnalytics {
     async getProductivityMetrics(workerId: string, timeRange: TimeRange): Promise<ProductivityMetrics>
     async getCollaborationInsights(projectId: string): Promise<CollaborationInsights>
     async getBottleneckAnalysis(workspaceId: string): Promise<BottleneckAnalysis>
   }
   ```

## New MCP Tools

### Worker Management Tools

```typescript
// Register this worker instance
register_worker: {
  name?: string;
  capabilities?: string[];
  purpose?: string;
}

// Get status of all workers
list_workers: {
  workspaceId?: string;
  activeOnly?: boolean;
}

// Update worker heartbeat
worker_heartbeat: {
  // No parameters, uses current worker
}
```

### Audit Trail Tools

```typescript
// Get change history for an entity
get_change_history: {
  entityType: 'project' | 'todo' | 'phase';
  entityId: string;
  limit?: number;
  since?: Date;
}

// Get recent changes in workspace/project
get_recent_changes: {
  workspaceId?: string;
  projectId?: string;
  workerId?: string;
  limit?: number;
  since?: Date;
}

// Get worker activity summary
get_worker_activity: {
  workerId?: string;  // Defaults to current worker
  timeRange?: 'hour' | 'day' | 'week';
}

// Detect conflicts
detect_conflicts: {
  workspaceId?: string;
  projectId?: string;
  autoResolve?: boolean;
}
```

### Rollback Tools

```typescript
// Create a checkpoint
create_checkpoint: {
  workspaceId: string;
  name: string;
  description?: string;
}

// List checkpoints
list_checkpoints: {
  workspaceId: string;
}

// Rollback a specific change
rollback_change: {
  changeId: string;
  reason: string;
}
```

## Example Usage Workflows

### Workflow 1: Worker Registration and Tracking

```javascript
// Worker starts up and registers
const worker = await register_worker({
  name: "Claude-Frontend",
  capabilities: ["ui", "styling", "testing"],
  purpose: "Implementing user interface features"
});

// Worker works on todos (automatically tracked)
const todo = await create_todo({
  projectId: "proj-1",
  title: "Add dark mode toggle"
});

// Check what other workers are doing
const workers = await list_workers({ workspaceId: "ws-1" });
console.log(`${workers.length} workers active:`, workers.map(w => w.name));

// Get activity summary
const activity = await get_worker_activity({ timeRange: "day" });
console.log(`Completed ${activity.todosCompleted} todos today`);
```

### Workflow 2: Change History and Debugging

```javascript
// Debug a todo that's not working as expected
const history = await get_change_history({
  entityType: "todo",
  entityId: "todo-123"
});

console.log("Todo change history:");
history.forEach(change => {
  console.log(`${change.timestamp}: ${change.workerId} - ${change.type}`);
  if (change.oldValue && change.newValue) {
    console.log(`  ${change.oldValue.status} → ${change.newValue.status}`);
  }
});

// Check for conflicts
const conflicts = await detect_conflicts({ projectId: "proj-1" });
if (conflicts.length > 0) {
  console.log(`⚠️  Found ${conflicts.length} conflicts to resolve`);
}
```

### Workflow 3: Collaborative Work Coordination

```javascript
// Before starting work, check what others are doing
const recentChanges = await get_recent_changes({
  projectId: "proj-1",
  limit: 10
});

console.log("Recent project activity:");
recentChanges.forEach(change => {
  console.log(`${change.workerId}: ${change.type} on ${change.entityId}`);
});

// Create checkpoint before major changes
await create_checkpoint({
  workspaceId: "ws-1",
  name: "Before refactoring",
  description: "State before Claude-Backend refactors the API structure"
});

// Work proceeds...
// If something goes wrong, can rollback
```

## Performance Considerations

### Optimization Strategies

1. **Batch Logging**: Group related changes into single log entries
2. **Async Logging**: Don't block operations waiting for log writes
3. **Log Rotation**: Archive old events to keep files manageable
4. **Indexing**: Create indexes on commonly queried fields
5. **Compression**: Compress archived audit logs

### Storage Limits

```typescript
interface AuditConfig {
  maxEventsPerFile: number;      // Default: 10,000
  retentionDays: number;         // Default: 90
  compactionInterval: number;    // Default: 24 hours
  maxFileSize: number;           // Default: 10MB
  enableRealTimeSync: boolean;   // Default: true
}
```

## Security and Privacy

### Access Control

```typescript
interface AuditPermissions {
  canViewOwnChanges: boolean;     // Default: true
  canViewAllChanges: boolean;     // Default: false (admin only)
  canRollbackOwnChanges: boolean; // Default: true
  canRollbackAllChanges: boolean; // Default: false (admin only)
  canDeleteAuditLogs: boolean;    // Default: false (admin only)
}
```

### Data Protection

1. **No Sensitive Data**: Don't log sensitive information in change details
2. **Anonymization**: Option to anonymize worker IDs after time period
3. **Encryption**: Encrypt audit logs at rest
4. **Purging**: Automatic cleanup of old audit data

## Migration Strategy

### Backward Compatibility

1. **Gradual Rollout**: New tracking is opt-in initially
2. **Legacy Support**: Old storage continues to work without tracking
3. **Migration Tool**: Convert existing data to tracked format

### Implementation Phases

1. **Week 1-2**: Core tracking infrastructure
2. **Week 3**: Worker registration and basic conflict detection
3. **Week 4**: MCP tools and user interface
4. **Week 5**: Advanced features (rollback, analytics)
5. **Week 6**: Performance optimization and testing

## Success Metrics

1. **Adoption Rate**: % of operations being tracked
2. **Conflict Detection**: Number of conflicts caught and resolved
3. **Worker Efficiency**: Average time per todo completion
4. **System Performance**: Tracking overhead < 5% performance impact
5. **User Satisfaction**: Positive feedback on collaboration features

This state change tracking system will provide complete visibility into who changed what and when, enabling much better coordination between multiple Claude instances working on the same project.