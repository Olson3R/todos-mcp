import { TodosStorageV2 } from './storage-v2.js';
import { ChangeLogger } from './change-logger.js';
import { WorkerRegistryManager, getWorkerRegistry } from './worker-registry.js';
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
} from './types.js';
import {
  WorkerIdentity,
  ChangeEvent,
  TrackingConfig,
  RegisterWorkerRequest
} from './tracking-types.js';

export class TrackedTodosStorage extends TodosStorageV2 {
  private changeLogger: ChangeLogger;
  private workerRegistry: WorkerRegistryManager;
  private currentWorker: WorkerIdentity | null = null;
  
  constructor(config?: Partial<TrackingConfig>) {
    super();
    this.changeLogger = new ChangeLogger(config);
    this.workerRegistry = getWorkerRegistry(config);
  }
  
  // Worker management
  async registerWorker(request: RegisterWorkerRequest): Promise<WorkerIdentity> {
    const worker = await this.workerRegistry.registerWorker(request);
    this.currentWorker = worker;
    
    // Log worker registration
    await this.changeLogger.logChange({
      workerId: worker.id,
      sessionId: worker.sessionId,
      type: 'worker.registered',
      entityType: 'worker',
      entityId: worker.id,
      workspaceId: 'global', // Worker registration is global
      action: 'register',
      newValue: worker,
      reason: 'Worker registered for session',
      changes: [],
      relatedChanges: [],
      conflictsWith: []
    });
    
    return worker;
  }
  
  async getCurrentWorker(): Promise<WorkerIdentity | null> {
    if (!this.currentWorker) {
      this.currentWorker = await this.workerRegistry.getCurrentWorker();
    }
    return this.currentWorker;
  }
  
  async heartbeat(): Promise<void> {
    const worker = await this.getCurrentWorker();
    if (worker) {
      await this.workerRegistry.updateHeartbeat(worker.id);
      
      // Log heartbeat (optional, might be too verbose)
      // await this.logChange({
      //   workerId: worker.id,
      //   sessionId: worker.sessionId,
      //   type: 'worker.heartbeat',
      //   entityType: 'worker',
      //   entityId: worker.id,
      //   workspaceId: 'global',
      //   action: 'heartbeat'
      // });
    }
  }
  
  // Helper method to log changes
  private async logChange(eventData: Omit<ChangeEvent, 'id' | 'timestamp' | 'changes' | 'relatedChanges' | 'conflictsWith' | 'workerId' | 'sessionId'>): Promise<ChangeEvent> {
    const worker = await this.getCurrentWorker();
    if (!worker) {
      throw new Error('No worker registered. Call registerWorker() first.');
    }
    
    return this.changeLogger.logChange({
      ...eventData,
      workerId: worker.id,
      sessionId: worker.sessionId,
      changes: [],
      relatedChanges: [],
      conflictsWith: []
    });
  }
  
  // Enhanced project operations with tracking
  async createProject(request: CreateProjectRequest): Promise<Project> {
    const startTime = Date.now();
    const project = await super.createProject(request);
    
    await this.logChange({
      type: 'project.created',
      entityType: 'project',
      entityId: project.id,
      workspaceId: project.workspaceId,
      action: 'create',
      newValue: project,
      reason: `Created project "${project.name}"`,
      duration: Date.now() - startTime
    });
    
    return project;
  }
  
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    const startTime = Date.now();
    const oldProject = await super.getProject(projectId);
    const updatedProject = await super.updateProject(projectId, updates);
    
    if (updatedProject && oldProject) {
      await this.logChange({
        type: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        workspaceId: updatedProject.workspaceId,
        action: 'update',
        oldValue: oldProject,
        newValue: updatedProject,
        reason: `Updated project "${updatedProject.name}"`,
        duration: Date.now() - startTime
      });
    }
    
    return updatedProject;
  }
  
  async deleteProject(projectId: string): Promise<boolean> {
    const startTime = Date.now();
    const project = await super.getProject(projectId);
    const success = await super.deleteProject(projectId);
    
    if (success && project) {
      await this.logChange({
        type: 'project.deleted',
        entityType: 'project',
        entityId: projectId,
        workspaceId: project.workspaceId,
        action: 'delete',
        oldValue: project,
        reason: `Deleted project "${project.name}"`,
        duration: Date.now() - startTime
      });
    }
    
    return success;
  }
  
  // Enhanced todo operations with tracking
  async createTodo(request: CreateTodoRequest): Promise<TodoItem | null> {
    const startTime = Date.now();
    const todo = await super.createTodo(request);
    
    if (todo) {
      const project = await super.getProject(request.projectId);
      const workspaceId = project?.workspaceId || 'unknown';
      
      await this.logChange({
        type: 'todo.created',
        entityType: 'todo',
        entityId: todo.id,
        projectId: request.projectId,
        workspaceId,
        action: 'create',
        newValue: todo,
        reason: `Created todo "${todo.title}"`,
        duration: Date.now() - startTime
      });
    }
    
    return todo;
  }
  
  async updateTodo(request: UpdateTodoRequest): Promise<TodoItem | null> {
    const startTime = Date.now();
    
    // Get old state first
    const projects = await super.listProjects();
    let oldTodo: TodoItem | null = null;
    let workspaceId = 'unknown';
    let projectId = 'unknown';
    
    for (const project of projects) {
      const found = project.todos.find(t => t.id === request.id);
      if (found) {
        oldTodo = found;
        workspaceId = project.workspaceId;
        projectId = project.id;
        break;
      }
    }
    
    const updatedTodo = await super.updateTodo(request);
    
    if (updatedTodo && oldTodo) {
      // Determine specific change type
      let changeType: 'todo.updated' | 'todo.completed' = 'todo.updated';
      let reason = `Updated todo "${updatedTodo.title}"`;
      
      if (oldTodo.status !== updatedTodo.status) {
        if (updatedTodo.status === 'completed') {
          changeType = 'todo.updated'; // Could add 'todo.completed' type
          reason = `Completed todo "${updatedTodo.title}"`;
        } else if (oldTodo.status === 'pending' && updatedTodo.status === 'in-progress') {
          reason = `Started work on todo "${updatedTodo.title}"`;
        }
      }
      
      await this.logChange({
        type: changeType,
        entityType: 'todo',
        entityId: request.id,
        projectId,
        workspaceId,
        action: 'update',
        oldValue: oldTodo,
        newValue: updatedTodo,
        reason,
        duration: Date.now() - startTime
      });
    }
    
    return updatedTodo;
  }
  
  async deleteTodo(todoId: string): Promise<boolean> {
    const startTime = Date.now();
    
    // Find the todo before deletion
    const projects = await super.listProjects();
    let todoToDelete: TodoItem | null = null;
    let workspaceId = 'unknown';
    let projectId = 'unknown';
    
    for (const project of projects) {
      const found = project.todos.find(t => t.id === todoId);
      if (found) {
        todoToDelete = found;
        workspaceId = project.workspaceId;
        projectId = project.id;
        break;
      }
    }
    
    const success = await super.deleteTodo(todoId);
    
    if (success && todoToDelete) {
      await this.logChange({
        type: 'todo.deleted',
        entityType: 'todo',
        entityId: todoId,
        projectId,
        workspaceId,
        action: 'delete',
        oldValue: todoToDelete,
        reason: `Deleted todo "${todoToDelete.title}"`,
        duration: Date.now() - startTime
      });
    }
    
    return success;
  }
  
  async reorderTodos(request: ReorderTodosRequest): Promise<boolean> {
    const startTime = Date.now();
    const project = await super.getProject(request.projectId);
    const oldOrder = project?.todos.map(t => ({ id: t.id, order: t.order })) || [];
    
    const success = await super.reorderTodos(request);
    
    if (success && project) {
      await this.logChange({
        type: 'todo.reordered',
        entityType: 'todo',
        entityId: request.projectId, // Use project ID since multiple todos are affected
        projectId: request.projectId,
        workspaceId: project.workspaceId,
        action: 'reorder',
        oldValue: { todoOrder: oldOrder },
        newValue: { todoOrder: request.todoIds.map((id, index) => ({ id, order: index })) },
        reason: `Reordered ${request.todoIds.length} todos in project "${project.name}"`,
        duration: Date.now() - startTime
      });
    }
    
    return success;
  }
  
  // Enhanced phase operations with tracking
  async createPhase(request: CreatePhaseRequest): Promise<Phase | null> {
    const startTime = Date.now();
    const phase = await super.createPhase(request);
    
    if (phase) {
      const project = await super.getProject(request.projectId);
      const workspaceId = project?.workspaceId || 'unknown';
      
      await this.logChange({
        type: 'phase.created',
        entityType: 'phase',
        entityId: phase.id,
        projectId: request.projectId,
        workspaceId,
        action: 'create',
        newValue: phase,
        reason: `Created phase "${phase.name}"`,
        duration: Date.now() - startTime
      });
    }
    
    return phase;
  }
  
  // Enhanced document operations with tracking
  async attachDocument(request: AttachDocumentRequest): Promise<Document | null> {
    const startTime = Date.now();
    const document = await super.attachDocument(request);
    
    if (document) {
      const project = await super.getProject(request.projectId);
      const workspaceId = project?.workspaceId || 'unknown';
      
      await this.logChange({
        type: 'document.attached',
        entityType: 'document',
        entityId: document.id,
        projectId: request.projectId,
        workspaceId,
        action: 'create',
        newValue: document,
        reason: `Attached document "${document.title}"`,
        duration: Date.now() - startTime
      });
    }
    
    return document;
  }
  
  async removeDocument(projectId: string, documentId: string): Promise<boolean> {
    const startTime = Date.now();
    const project = await super.getProject(projectId);
    const document = project?.documents.find(d => d.id === documentId);
    
    const success = await super.removeDocument(projectId, documentId);
    
    if (success && document && project) {
      await this.logChange({
        type: 'document.removed',
        entityType: 'document',
        entityId: documentId,
        projectId,
        workspaceId: project.workspaceId,
        action: 'delete',
        oldValue: document,
        reason: `Removed document "${document.title}"`,
        duration: Date.now() - startTime
      });
    }
    
    return success;
  }
  
  // Tracking-specific methods
  async getChangeHistory(entityType: string, entityId: string) {
    return this.changeLogger.getChangeHistory(entityType as any, entityId);
  }
  
  async getRecentChanges(workspaceId?: string, projectId?: string, workerId?: string, limit?: number) {
    return this.changeLogger.getChanges({
      workspaceId,
      projectId,
      workerId,
      limit: limit || 50,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    });
  }
  
  async getWorkerActivity(workerId?: string) {
    const targetWorkerId = workerId || this.currentWorker?.id;
    if (!targetWorkerId) return null;
    
    return this.workerRegistry.getWorkerStatus(targetWorkerId);
  }
  
  async listActiveWorkers() {
    return this.workerRegistry.getActiveWorkers();
  }
  
  async getAuditStats(workspaceId: string) {
    return this.changeLogger.getStats(workspaceId);
  }
  
  // Graceful shutdown
  async shutdown(): Promise<void> {
    await this.workerRegistry.shutdown();
    
    if (this.currentWorker) {
      await this.changeLogger.logChange({
        workerId: this.currentWorker.id,
        sessionId: this.currentWorker.sessionId,
        type: 'worker.deregistered',
        entityType: 'worker',
        entityId: this.currentWorker.id,
        workspaceId: 'global',
        action: 'register', // Deregistration is still a registration action
        oldValue: this.currentWorker,
        reason: 'Worker session ended',
        changes: [],
        relatedChanges: [],
        conflictsWith: []
      });
    }
  }
}