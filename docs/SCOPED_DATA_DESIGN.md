# Scoped Data Organization Design

## Overview

Redesigning the data organization to be properly scoped by workspace and project, eliminating global state and ensuring clean separation of concerns.

## Problems with Current Design

1. **Mixed Scoping**: Workers are global but work on workspace-specific projects
2. **Global Worker Registry**: Workers registered globally but should be workspace-scoped
3. **Inconsistent Audit Logs**: Some events in global log, others in workspace log
4. **Cross-Workspace Pollution**: Workers from one workspace visible to others
5. **Complex Cleanup**: Global state makes it hard to clean up workspace-specific data

## New Data Structure

```
~/.claude-todos-mcp/
├── config.json                     # Global configuration only
└── data/
    └── {workspace-id}/              # One directory per workspace
        ├── workspace.json           # Workspace metadata
        ├── workers/                 # Workers active in this workspace
        │   ├── registry.json        # Active workers for this workspace
        │   └── {worker-id}.json     # Worker state files
        ├── projects/                # Projects in this workspace
        │   ├── {project-id}/
        │   │   ├── project.json     # Project data (todos, phases, docs)
        │   │   ├── audit-log.json   # All changes to this project
        │   │   └── checkpoints/     # Project checkpoints for rollback
        │   │       └── {checkpoint-id}.json
        │   └── {project-id-2}/
        │       └── ...
        └── audit-log.json           # Workspace-level events (project creation/deletion)
```

## Benefits

1. **Clean Isolation**: Complete separation between workspaces
2. **Project-Scoped Tracking**: All changes to a project stored with the project
3. **Workspace-Scoped Workers**: Workers register per workspace they're working in
4. **Easy Cleanup**: Delete workspace directory to remove all related data
5. **Scalable**: Can handle many workspaces without global state bloat
6. **Parallel Work**: Multiple instances can work on different workspaces without conflicts

## Updated Data Models

### Workspace-Scoped Worker Registry

```typescript
interface WorkspaceWorkerRegistry {
  workspaceId: string;
  workers: Map<string, WorkerIdentity>;
  lastCleanup: Date;
  inactiveTimeoutMs: number;
}

interface WorkerIdentity {
  id: string;                    // Unique across all workspaces
  sessionId: string;             // Unique session ID
  workspaceId: string;           // Which workspace this worker is active in
  name?: string;
  capabilities: string[];
  registeredAt: Date;            // When registered in this workspace
  lastSeen: Date;
  currentProjectId?: string;     // Currently active project
  metadata: {
    model?: string;
    user?: string;
    purpose?: string;
  };
}
```

### Project-Scoped Audit Log

```typescript
interface ProjectAuditLog {
  projectId: string;
  workspaceId: string;
  events: ChangeEvent[];
  lastCompacted: Date;
  retentionDays: number;
  version: string;
}

interface ChangeEvent {
  id: string;
  workerId: string;              // Worker who made the change
  sessionId: string;             // Session when change was made
  timestamp: Date;
  type: ChangeType;
  entityType: EntityType;
  entityId: string;
  projectId: string;             // Always present - all changes are project-scoped
  workspaceId: string;           // Always present
  action: ActionType;
  oldValue?: any;
  newValue?: any;
  changes: FieldChange[];
  reason?: string;
  duration?: number;
  relatedChanges: string[];
  conflictsWith: string[];
}
```

### Workspace-Level Events

```typescript
// Only workspace-level events in workspace audit log
type WorkspaceChangeType = 
  | 'workspace.worker.registered'
  | 'workspace.worker.deregistered'
  | 'workspace.project.created'
  | 'workspace.project.deleted'
  | 'workspace.project.moved';    // Future: moving projects between workspaces
```

## Implementation Changes

### 1. Workspace-Scoped Worker Registry

```typescript
export class WorkspaceWorkerRegistry {
  private workspaceId: string;
  private workersDir: string;
  private registryFile: string;
  private registry: WorkspaceWorkerRegistry | null = null;
  
  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.workersDir = path.join(this.getWorkspaceDir(workspaceId), 'workers');
    this.registryFile = path.join(this.workersDir, 'registry.json');
  }
  
  async registerWorker(request: RegisterWorkerRequest): Promise<WorkerIdentity> {
    const worker: WorkerIdentity = {
      id: this.generateWorkerId(),
      sessionId: this.generateSessionId(),
      workspaceId: this.workspaceId,
      name: request.name,
      capabilities: request.capabilities || [],
      registeredAt: new Date(),
      lastSeen: new Date(),
      metadata: { ...request.metadata }
    };
    
    const registry = await this.loadRegistry();
    registry.workers.set(worker.id, worker);
    await this.saveRegistry(registry);
    
    return worker;
  }
  
  async setCurrentProject(workerId: string, projectId: string): Promise<void> {
    const registry = await this.loadRegistry();
    const worker = registry.workers.get(workerId);
    if (worker) {
      worker.currentProjectId = projectId;
      worker.lastSeen = new Date();
      await this.saveRegistry(registry);
    }
  }
}
```

### 2. Project-Scoped Change Logger

```typescript
export class ProjectChangeLogger {
  private projectId: string;
  private workspaceId: string;
  private auditLogPath: string;
  
  constructor(projectId: string, workspaceId: string) {
    this.projectId = projectId;
    this.workspaceId = workspaceId;
    this.auditLogPath = this.getProjectAuditLogPath(workspaceId, projectId);
  }
  
  private getProjectAuditLogPath(workspaceId: string, projectId: string): string {
    return path.join(
      this.getWorkspaceDir(workspaceId), 
      'projects', 
      projectId, 
      'audit-log.json'
    );
  }
  
  async logChange(event: Omit<ChangeEvent, 'id' | 'timestamp' | 'projectId' | 'workspaceId'>): Promise<ChangeEvent> {
    const changeEvent: ChangeEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      projectId: this.projectId,
      workspaceId: this.workspaceId
    };
    
    const auditLog = await this.loadProjectAuditLog();
    auditLog.events.push(changeEvent);
    await this.saveProjectAuditLog(auditLog);
    
    return changeEvent;
  }
}
```

### 3. Updated Storage Manager

```typescript
export class ScopedTodosStorage extends TodosStorageV2 {
  private workspaceWorkerRegistry: Map<string, WorkspaceWorkerRegistry> = new Map();
  private projectChangeLoggers: Map<string, ProjectChangeLogger> = new Map();
  private currentWorker: WorkerIdentity | null = null;
  
  async registerWorkerForWorkspace(workspaceId: string, request: RegisterWorkerRequest): Promise<WorkerIdentity> {
    let registry = this.workspaceWorkerRegistry.get(workspaceId);
    if (!registry) {
      registry = new WorkspaceWorkerRegistry(workspaceId);
      this.workspaceWorkerRegistry.set(workspaceId, registry);
    }
    
    const worker = await registry.registerWorker(request);
    this.currentWorker = worker;
    
    // Log workspace-level event
    await this.logWorkspaceEvent(workspaceId, {
      workerId: worker.id,
      sessionId: worker.sessionId,
      type: 'workspace.worker.registered',
      entityType: 'worker',
      entityId: worker.id,
      action: 'register',
      newValue: worker,
      reason: `Worker ${worker.name || worker.id} registered in workspace`
    });
    
    return worker;
  }
  
  async createProject(request: CreateProjectRequest): Promise<Project> {
    const project = await super.createProject(request);
    
    // Update worker's current project
    if (this.currentWorker) {
      const registry = this.workspaceWorkerRegistry.get(project.workspaceId);
      if (registry) {
        await registry.setCurrentProject(this.currentWorker.id, project.id);
      }
    }
    
    // Log workspace-level event
    await this.logWorkspaceEvent(project.workspaceId, {
      workerId: this.currentWorker!.id,
      sessionId: this.currentWorker!.sessionId,
      type: 'workspace.project.created',
      entityType: 'project',
      entityId: project.id,
      action: 'create',
      newValue: { id: project.id, name: project.name },
      reason: `Created project "${project.name}"`
    });
    
    return project;
  }
  
  async createTodo(request: CreateTodoRequest): Promise<TodoItem | null> {
    const todo = await super.createTodo(request);
    
    if (todo) {
      const project = await super.getProject(request.projectId);
      if (project) {
        // Log project-level event
        await this.logProjectEvent(project.id, project.workspaceId, {
          workerId: this.currentWorker!.id,
          sessionId: this.currentWorker!.sessionId,
          type: 'todo.created',
          entityType: 'todo',
          entityId: todo.id,
          action: 'create',
          newValue: todo,
          reason: `Created todo "${todo.title}"`
        });
      }
    }
    
    return todo;
  }
  
  private async logProjectEvent(
    projectId: string, 
    workspaceId: string, 
    event: Omit<ChangeEvent, 'id' | 'timestamp' | 'projectId' | 'workspaceId'>
  ): Promise<void> {
    let logger = this.projectChangeLoggers.get(projectId);
    if (!logger) {
      logger = new ProjectChangeLogger(projectId, workspaceId);
      this.projectChangeLoggers.set(projectId, logger);
    }
    
    await logger.logChange(event);
  }
  
  private async logWorkspaceEvent(
    workspaceId: string,
    event: Omit<ChangeEvent, 'id' | 'timestamp' | 'projectId' | 'workspaceId'>
  ): Promise<void> {
    // Use a special workspace-level logger
    const logger = new WorkspaceChangeLogger(workspaceId);
    await logger.logChange(event);
  }
}
```

## Query Updates

### Project-Scoped Queries

```typescript
// Get change history for a specific project entity
async getChangeHistory(projectId: string, entityType: EntityType, entityId: string): Promise<ChangeEvent[]>

// Get recent changes in a specific project
async getProjectChanges(projectId: string, filters?: ChangeFilter): Promise<ChangeEvent[]>

// Get all changes by a worker in a project
async getWorkerChangesInProject(workerId: string, projectId: string): Promise<ChangeEvent[]>
```

### Workspace-Scoped Queries

```typescript
// Get all workers in a workspace
async getWorkspaceWorkers(workspaceId: string): Promise<WorkerIdentity[]>

// Get workspace-level changes (project creation/deletion, worker registration)
async getWorkspaceChanges(workspaceId: string): Promise<ChangeEvent[]>

// Get all projects a worker has touched in a workspace
async getWorkerProjects(workerId: string, workspaceId: string): Promise<string[]>
```

## Migration Strategy

### 1. Data Migration Tool

```typescript
async function migrateToScopedData(): Promise<void> {
  // 1. Read old global worker registry
  // 2. Read old global and workspace audit logs
  // 3. Group workers by workspace they worked in
  // 4. Split audit events by project
  // 5. Create new scoped directory structure
  // 6. Archive old global data
}
```

### 2. Backward Compatibility

- Keep old data format for 30 days
- Provide migration tool as MCP command
- Warn users about old format on startup

## Benefits Summary

1. **Clean Architecture**: Each workspace is completely isolated
2. **Project Ownership**: All project data (including audit trail) stays with project
3. **Worker Scoping**: Workers only see data for workspaces they're active in
4. **Easy Cleanup**: Remove workspace directory = remove all data
5. **Better Performance**: Smaller, more focused data files
6. **Parallel Work**: No global state conflicts between workspace instances
7. **Future-Proof**: Sets up for workspace sharing and project movement features

This scoped approach will make the system much more organized and scalable!