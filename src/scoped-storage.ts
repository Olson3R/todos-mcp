import { TodosStorageV2 } from './storage-v2.js';
import { ProjectChangeLogger, WorkspaceChangeLogger } from './scoped-change-logger.js';
import { ScopedWorkerRegistryManager, ScopedWorkerIdentity } from './scoped-worker-registry.js';
import { DependencyManager } from './dependency-manager.js';
import {
  Project,
  TodoItem,
  Phase,
  Document,
  CreateProjectRequest,
  CreateTodoRequest,
  UpdateTodoRequest,
  CreatePhaseRequest,
  AttachDocumentRequest,
  ReorderTodosRequest,
  AddDependencyRequest,
  RemoveDependencyRequest,
  DependencyGraphResult,
  WorkAllocationResult,
} from './types.js';
import {
  TrackingConfig,
  RegisterWorkerRequest,
  ChangeFilter,
  ChangeEvent
} from './tracking-types.js';

// ScopedWorkerIdentity is now imported from scoped-worker-registry.ts

export class ScopedTodosStorage extends TodosStorageV2 {
  private workerRegistry: ScopedWorkerRegistryManager;
  private dependencyManager: DependencyManager;
  private projectLoggers: Map<string, ProjectChangeLogger> = new Map();
  private workspaceLoggers: Map<string, WorkspaceChangeLogger> = new Map();
  private currentWorker: ScopedWorkerIdentity | null = null;
  private trackingConfig: TrackingConfig;
  
  constructor(config?: Partial<TrackingConfig>) {
    super();
    this.trackingConfig = {
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
    
    this.workerRegistry = new ScopedWorkerRegistryManager(this.trackingConfig);
    this.dependencyManager = new DependencyManager();
  }
  
  // Worker management - now workspace-scoped
  async registerWorkerForWorkspace(workspaceId: string, request: RegisterWorkerRequest): Promise<ScopedWorkerIdentity> {
    const worker = await this.workerRegistry.registerWorker(workspaceId, request);
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
      reason: `Worker ${worker.name || worker.id} registered in workspace`,
      changes: [],
      relatedChanges: [],
      conflictsWith: []
    });
    
    return worker;
  }
  
  async getCurrentWorker(): Promise<ScopedWorkerIdentity | null> {
    return this.currentWorker;
  }
  
  async heartbeat(): Promise<void> {
    if (this.currentWorker) {
      await this.workerRegistry.updateHeartbeat(this.currentWorker.workspaceId, this.currentWorker.id);
    }
  }
  
  async deregisterWorker(): Promise<void> {
    if (this.currentWorker) {
      await this.logWorkspaceEvent(this.currentWorker.workspaceId, {
        workerId: this.currentWorker.id,
        sessionId: this.currentWorker.sessionId,
        type: 'workspace.worker.deregistered',
        entityType: 'worker',
        entityId: this.currentWorker.id,
        action: 'register',
        oldValue: this.currentWorker,
        reason: 'Worker session ended',
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
      
      await this.workerRegistry.deregisterWorker(this.currentWorker.workspaceId, this.currentWorker.id);
      this.currentWorker = null;
    }
  }
  
  // Helper methods for logging
  private async getProjectLogger(projectId: string, workspaceId: string): Promise<ProjectChangeLogger> {
    let logger = this.projectLoggers.get(projectId);
    if (!logger) {
      logger = new ProjectChangeLogger(projectId, workspaceId, this.trackingConfig);
      this.projectLoggers.set(projectId, logger);
    }
    return logger;
  }
  
  private async getWorkspaceLogger(workspaceId: string): Promise<WorkspaceChangeLogger> {
    let logger = this.workspaceLoggers.get(workspaceId);
    if (!logger) {
      logger = new WorkspaceChangeLogger(workspaceId, this.trackingConfig);
      this.workspaceLoggers.set(workspaceId, logger);
    }
    return logger;
  }
  
  private async logProjectEvent(
    projectId: string,
    workspaceId: string,
    event: Omit<ChangeEvent, 'id' | 'timestamp' | 'projectId' | 'workspaceId'>
  ): Promise<ChangeEvent> {
    const logger = await this.getProjectLogger(projectId, workspaceId);
    return logger.logChange(event);
  }
  
  private async logWorkspaceEvent(
    workspaceId: string,
    event: Omit<ChangeEvent, 'id' | 'timestamp' | 'workspaceId' | 'projectId'>
  ): Promise<ChangeEvent> {
    const logger = await this.getWorkspaceLogger(workspaceId);
    return logger.logChange({
      ...event,
      projectId: 'workspace-level'
    });
  }
  
  private ensureWorkerRegistered(): void {
    if (!this.currentWorker) {
      throw new Error('No worker registered. Call registerWorkerForWorkspace() first.');
    }
  }
  
  // Enhanced project operations with scoped tracking
  async createProject(request: CreateProjectRequest): Promise<Project> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    const project = await super.createProject(request);
    
    // Update worker's current project
    await this.workerRegistry.setCurrentProject(
      this.currentWorker!.workspaceId,
      this.currentWorker!.id,
      project.id
    );
    
    // Log workspace-level event (project creation)
    await this.logWorkspaceEvent(project.workspaceId, {
      workerId: this.currentWorker!.id,
      sessionId: this.currentWorker!.sessionId,
      type: 'workspace.project.created',
      entityType: 'project',
      entityId: project.id,
      action: 'create',
      newValue: { id: project.id, name: project.name },
      reason: `Created project "${project.name}"`,
      duration: Date.now() - startTime,
      changes: [],
      relatedChanges: [],
      conflictsWith: []
    });
    
    return project;
  }
  
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    const oldProject = await super.getProject(projectId);
    const updatedProject = await super.updateProject(projectId, updates);
    
    if (updatedProject && oldProject) {
      // Log project-level event
      await this.logProjectEvent(projectId, updatedProject.workspaceId, {
        workerId: this.currentWorker!.id,
        sessionId: this.currentWorker!.sessionId,
        type: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        action: 'update',
        oldValue: oldProject,
        newValue: updatedProject,
        reason: `Updated project "${updatedProject.name}"`,
        duration: Date.now() - startTime,
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
    
    return updatedProject;
  }
  
  async deleteProject(projectId: string): Promise<boolean> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    const project = await super.getProject(projectId);
    const success = await super.deleteProject(projectId);
    
    if (success && project) {
      // Log workspace-level event
      await this.logWorkspaceEvent(project.workspaceId, {
        workerId: this.currentWorker!.id,
        sessionId: this.currentWorker!.sessionId,
        type: 'workspace.project.deleted',
        entityType: 'project',
        entityId: projectId,
        action: 'delete',
        oldValue: { id: project.id, name: project.name },
        reason: `Deleted project "${project.name}"`,
        duration: Date.now() - startTime,
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
    
    return success;
  }
  
  // Enhanced todo operations with project-scoped tracking and dependency support
  async createTodo(request: CreateTodoRequest): Promise<TodoItem | null> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    
    // Use our enhanced implementation instead of super.createTodo() to avoid single in-progress constraint
    const workspaceId = await this.findWorkspaceForProject(request.projectId);
    if (!workspaceId) return null;
    
    const project = await super.getProject(request.projectId);
    if (!project) return null;
    
    const todo: TodoItem = {
      id: this.generateId(),
      title: request.title,
      description: request.description,
      status: 'pending',
      phaseId: request.phaseId,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: project.todos.length,
      // Dependency fields
      dependsOn: request.dependsOn || [],
      dependents: [], // Will be computed
      blockedBy: [], // Will be computed
      estimatedDuration: request.estimatedDuration,
      priority: request.priority || 'medium'
    };
    
    // Validate dependencies with actual todo ID
    if (todo.dependsOn.length > 0) {
      for (const depId of todo.dependsOn) {
        // Check if dependency exists in the project
        const dependsOnTodo = project.todos.find(t => t.id === depId);
        if (!dependsOnTodo) {
          throw new Error(`Dependency todo with ID ${depId} not found in project`);
        }
      }
      
      // Check for cycles by temporarily adding the todo and testing
      const testTodos = [...project.todos, todo];
      const cycles = this.dependencyManager.detectCycles(testTodos);
      if (cycles.length > 0) {
        throw new Error(`Adding these dependencies would create a cycle: ${cycles[0].join(' -> ')}`);
      }
    }
    
    project.todos.push(todo);
    project.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, request.projectId),
      project
    );
    
    // Update worker's current project if not already set
    if (this.currentWorker!.currentProjectId !== project.id) {
      await this.workerRegistry.setCurrentProject(
        this.currentWorker!.workspaceId,
        this.currentWorker!.id,
        project.id
      );
    }
    
    // Log project-level event
    await this.logProjectEvent(project.id, project.workspaceId, {
      workerId: this.currentWorker!.id,
      sessionId: this.currentWorker!.sessionId,
      type: 'todo.created',
      entityType: 'todo',
      entityId: todo.id,
      action: 'create',
      newValue: todo,
      reason: `Created todo "${todo.title}"${todo.dependsOn.length > 0 ? ` with ${todo.dependsOn.length} dependencies` : ''}`,
      duration: Date.now() - startTime,
      changes: [],
      relatedChanges: [],
      conflictsWith: []
    });
    
    return todo;
  }
  
  // Helper method to generate IDs (using the same method as base class)
  private generateId(): string {
    return require('uuid').v4();
  }
  
  async updateTodo(request: UpdateTodoRequest): Promise<TodoItem | null> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    
    // Find project containing the todo
    const projects = await this.listProjects();
    let targetProject: Project | null = null;
    let workspaceId: string | null = null;
    
    for (const project of projects) {
      if (project.todos.some(t => t.id === request.id)) {
        targetProject = project;
        workspaceId = await this.findWorkspaceForProject(project.id);
        break;
      }
    }
    
    if (!targetProject || !workspaceId) return null;
    
    const todoIndex = targetProject.todos.findIndex(t => t.id === request.id);
    if (todoIndex === -1) return null;
    
    const oldTodo = targetProject.todos[todoIndex];
    
    // Validate dependencies if being updated
    if (request.dependsOn !== undefined) {
      const tempUpdated = { ...oldTodo, dependsOn: request.dependsOn };
      
      // Remove old dependencies and add new ones for validation
      const otherTodos = targetProject.todos.filter(t => t.id !== request.id);
      for (const depId of request.dependsOn) {
        this.dependencyManager.validateDependency([...otherTodos, tempUpdated], request.id, depId);
      }
    }
    
    // Check if todo can be moved to in-progress based on dependencies
    if (request.status === 'in-progress') {
      const currentDeps = request.dependsOn !== undefined ? request.dependsOn : oldTodo.dependsOn;
      const { canStart, reason } = this.dependencyManager.canStartTodo(
        targetProject.todos.map(t => t.id === request.id ? { ...t, dependsOn: currentDeps } : t),
        request.id
      );
      
      if (!canStart) {
        throw new Error(`Cannot start todo: ${reason}`);
      }
    }
    
    const updated: TodoItem = {
      ...oldTodo,
      ...request,
      id: oldTodo.id, // Prevent ID change
      dependsOn: request.dependsOn !== undefined ? request.dependsOn : oldTodo.dependsOn,
      dependents: oldTodo.dependents, // Keep computed field
      blockedBy: oldTodo.blockedBy, // Keep computed field
      updatedAt: new Date()
    };
    
    targetProject.todos[todoIndex] = updated;
    targetProject.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, targetProject.id),
      targetProject
    );
    
    // Update worker's current project if not already set
    if (this.currentWorker!.currentProjectId !== targetProject.id) {
      await this.workerRegistry.setCurrentProject(
        this.currentWorker!.workspaceId,
        this.currentWorker!.id,
        targetProject.id
      );
    }
    
    // Determine specific change type
    let changeType: 'todo.updated' = 'todo.updated';
    let reason = `Updated todo "${updated.title}"`;
    
    if (oldTodo.status !== updated.status) {
      if (updated.status === 'completed') {
        reason = `Completed todo "${updated.title}"`;
      } else if (oldTodo.status === 'pending' && updated.status === 'in-progress') {
        reason = `Started work on todo "${updated.title}"`;
      }
    }
    
    if (request.dependsOn !== undefined && JSON.stringify(oldTodo.dependsOn) !== JSON.stringify(request.dependsOn)) {
      reason += ` (updated dependencies)`;
    }
    
    // Log project-level event
    await this.logProjectEvent(targetProject.id, targetProject.workspaceId, {
      workerId: this.currentWorker!.id,
      sessionId: this.currentWorker!.sessionId,
      type: changeType,
      entityType: 'todo',
      entityId: request.id,
      action: 'update',
      oldValue: oldTodo,
      newValue: updated,
      reason,
      duration: Date.now() - startTime,
      changes: [],
      relatedChanges: [],
      conflictsWith: []
    });
    
    return updated;
  }

  async changeStatus(todoId: string, newStatus: 'pending' | 'in-progress' | 'completed'): Promise<TodoItem | null> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    
    // Find project containing the todo
    const projects = await this.listProjects();
    let targetProject: Project | null = null;
    let workspaceId: string | null = null;
    
    for (const project of projects) {
      if (project.todos.some(t => t.id === todoId)) {
        targetProject = project;
        workspaceId = await this.findWorkspaceForProject(project.id);
        break;
      }
    }
    
    if (!targetProject || !workspaceId) return null;
    
    const todoIndex = targetProject.todos.findIndex(t => t.id === todoId);
    if (todoIndex === -1) return null;

    const oldTodo = targetProject.todos[todoIndex];
    
    // Check if todo can be moved to in-progress based on dependencies
    if (newStatus === 'in-progress') {
      const { canStart, reason } = this.dependencyManager.canStartTodo(
        targetProject.todos,
        todoId
      );
      
      if (!canStart) {
        throw new Error(`Cannot start todo: ${reason}`);
      }
    }
    
    // Only update status and updatedAt, preserve all other fields
    const updated: TodoItem = {
      ...oldTodo,
      status: newStatus,
      updatedAt: new Date()
    };
    
    targetProject.todos[todoIndex] = updated;
    targetProject.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, targetProject.id),
      targetProject
    );
    
    // Log project-level event
    await this.logProjectEvent(targetProject.id, targetProject.workspaceId, {
      workerId: this.currentWorker!.id,
      sessionId: this.currentWorker!.sessionId,
      type: 'todo.updated',
      entityType: 'todo',
      entityId: todoId,
      action: 'update',
      oldValue: oldTodo,
      newValue: updated,
      reason: `Changed status from "${oldTodo.status}" to "${newStatus}"`,
      duration: Date.now() - startTime,
      changes: [{
        field: 'status',
        oldValue: oldTodo.status,
        newValue: newStatus,
        type: 'modified'
      }],
      relatedChanges: [],
      conflictsWith: []
    });
    
    return updated;
  }
  
  async deleteTodo(todoId: string): Promise<boolean> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    
    // Find the todo before deletion
    const projects = await super.listProjects();
    let todoToDelete: TodoItem | null = null;
    let project: Project | null = null;
    
    for (const proj of projects) {
      const found = proj.todos.find(t => t.id === todoId);
      if (found) {
        todoToDelete = found;
        project = proj;
        break;
      }
    }
    
    const success = await super.deleteTodo(todoId);
    
    if (success && todoToDelete && project) {
      // Log project-level event
      await this.logProjectEvent(project.id, project.workspaceId, {
        workerId: this.currentWorker!.id,
        sessionId: this.currentWorker!.sessionId,
        type: 'todo.deleted',
        entityType: 'todo',
        entityId: todoId,
        action: 'delete',
        oldValue: todoToDelete,
        reason: `Deleted todo "${todoToDelete.title}"`,
        duration: Date.now() - startTime,
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
    
    return success;
  }
  
  async reorderTodos(request: ReorderTodosRequest): Promise<boolean> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    const project = await super.getProject(request.projectId);
    const oldOrder = project?.todos.map(t => ({ id: t.id, order: t.order })) || [];
    
    const success = await super.reorderTodos(request);
    
    if (success && project) {
      // Log project-level event
      await this.logProjectEvent(project.id, project.workspaceId, {
        workerId: this.currentWorker!.id,
        sessionId: this.currentWorker!.sessionId,
        type: 'todo.reordered',
        entityType: 'todo',
        entityId: request.projectId, // Use project ID since multiple todos are affected
        action: 'reorder',
        oldValue: { todoOrder: oldOrder },
        newValue: { todoOrder: request.todoIds.map((id, index) => ({ id, order: index })) },
        reason: `Reordered ${request.todoIds.length} todos in project "${project.name}"`,
        duration: Date.now() - startTime,
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
    
    return success;
  }
  
  // Dependency management methods
  async addDependency(request: AddDependencyRequest): Promise<TodoItem | null> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    
    // Find the project containing the todo
    const projects = await this.listProjects();
    let targetProject: Project | null = null;
    let workspaceId: string | null = null;
    
    for (const project of projects) {
      if (project.todos.some(t => t.id === request.todoId)) {
        targetProject = project;
        workspaceId = await this.findWorkspaceForProject(project.id);
        break;
      }
    }
    
    if (!targetProject || !workspaceId) return null;
    
    // Update todos with new dependency
    const updatedTodos = this.dependencyManager.addDependency(
      targetProject.todos,
      request.todoId,
      request.dependsOnId
    );
    
    targetProject.todos = updatedTodos;
    targetProject.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, targetProject.id),
      targetProject
    );
    
    const updatedTodo = updatedTodos.find(t => t.id === request.todoId);
    
    if (updatedTodo) {
      // Log project-level event
      await this.logProjectEvent(targetProject.id, targetProject.workspaceId, {
        workerId: this.currentWorker!.id,
        sessionId: this.currentWorker!.sessionId,
        type: 'todo.dependency.added',
        entityType: 'todo',
        entityId: request.todoId,
        action: 'update',
        newValue: { todoId: request.todoId, dependsOnId: request.dependsOnId },
        reason: `Added dependency: todo "${request.todoId}" now depends on "${request.dependsOnId}"`,
        duration: Date.now() - startTime,
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
    
    return updatedTodo || null;
  }
  
  async removeDependency(request: RemoveDependencyRequest): Promise<TodoItem | null> {
    this.ensureWorkerRegistered();
    
    const startTime = Date.now();
    
    // Find the project containing the todo
    const projects = await this.listProjects();
    let targetProject: Project | null = null;
    let workspaceId: string | null = null;
    
    for (const project of projects) {
      if (project.todos.some(t => t.id === request.todoId)) {
        targetProject = project;
        workspaceId = await this.findWorkspaceForProject(project.id);
        break;
      }
    }
    
    if (!targetProject || !workspaceId) return null;
    
    // Update todos removing dependency
    const updatedTodos = this.dependencyManager.removeDependency(
      targetProject.todos,
      request.todoId,
      request.dependsOnId
    );
    
    targetProject.todos = updatedTodos;
    targetProject.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, targetProject.id),
      targetProject
    );
    
    const updatedTodo = updatedTodos.find(t => t.id === request.todoId);
    
    if (updatedTodo) {
      // Log project-level event
      await this.logProjectEvent(targetProject.id, targetProject.workspaceId, {
        workerId: this.currentWorker!.id,
        sessionId: this.currentWorker!.sessionId,
        type: 'todo.dependency.removed',
        entityType: 'todo',
        entityId: request.todoId,
        action: 'update',
        newValue: { todoId: request.todoId, removedDependsOnId: request.dependsOnId },
        reason: `Removed dependency: todo "${request.todoId}" no longer depends on "${request.dependsOnId}"`,
        duration: Date.now() - startTime,
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
    
    return updatedTodo || null;
  }
  
  async getDependencyGraph(projectId: string): Promise<DependencyGraphResult | null> {
    const project = await super.getProject(projectId);
    if (!project) return null;
    
    return this.dependencyManager.buildDependencyGraph(project.todos);
  }
  
  async getAvailableWork(projectId: string, workerId?: string): Promise<TodoItem[]> {
    const project = await super.getProject(projectId);
    if (!project) return [];
    
    const actualWorkerId = workerId || this.currentWorker?.id || 'unknown';
    
    return this.dependencyManager.getAvailableWorkForWorker(
      project.todos,
      actualWorkerId,
      this.currentWorker?.capabilities || []
    );
  }
  
  async allocateWork(
    projectId: string,
    workers: Array<{ id: string; capabilities: string[]; maxConcurrentTodos?: number }>
  ): Promise<WorkAllocationResult | null> {
    const project = await super.getProject(projectId);
    if (!project) return null;
    
    return this.dependencyManager.allocateWork(project.todos, workers);
  }
  
  // Query methods - now properly scoped
  async getProjectChangeHistory(projectId: string, entityType?: string, entityId?: string): Promise<ChangeEvent[]> {
    const project = await super.getProject(projectId);
    if (!project) return [];
    
    const logger = await this.getProjectLogger(projectId, project.workspaceId);
    
    if (entityType && entityId) {
      return logger.getChangeHistory(entityType as any, entityId);
    } else {
      return logger.getChanges({ limit: 100 });
    }
  }
  
  async getWorkspaceChanges(workspaceId: string, filters?: ChangeFilter): Promise<ChangeEvent[]> {
    const logger = await this.getWorkspaceLogger(workspaceId);
    return logger.getChanges(filters);
  }
  
  async getWorkerActivity(workspaceId: string, workerId?: string) {
    const targetWorkerId = workerId || this.currentWorker?.id;
    if (!targetWorkerId) return null;
    
    return this.workerRegistry.getWorkerStatus(workspaceId, targetWorkerId);
  }
  
  async getWorkspaceWorkers(workspaceId: string) {
    return this.workerRegistry.getActiveWorkersInWorkspace(workspaceId);
  }
  
  async getProjectWorkers(projectId: string) {
    const project = await super.getProject(projectId);
    if (!project) return [];
    
    return this.workerRegistry.getWorkersInProject(project.workspaceId, projectId);
  }
  
  async getProjectStats(projectId: string) {
    const project = await super.getProject(projectId);
    if (!project) return null;
    
    const logger = await this.getProjectLogger(projectId, project.workspaceId);
    return logger.getStats();
  }
  
  async getWorkspaceStats(workspaceId: string) {
    return this.workerRegistry.getRegistryStats(workspaceId);
  }
  
  // Graceful shutdown
  async shutdown(): Promise<void> {
    await this.deregisterWorker();
    
    // Clear caches
    this.projectLoggers.clear();
    this.workspaceLoggers.clear();
  }
}