import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  Project,
  TodoItem,
  Phase,
  Document,
  Workspace,
  TodosData,
  CreateProjectRequest,
  CreateTodoRequest,
  UpdateTodoRequest,
  CreatePhaseRequest,
  AttachDocumentRequest,
  ReorderTodosRequest,
} from './types.js';
import { 
  ValidationError, 
  validateProjectName,
  validateTodoTitle,
  validateTodoStatus,
  validateDocumentType,
  validateDocumentData,
  validatePhaseName
} from './validation.js';

interface WorkspaceMetadata {
  id: string;
  path: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  projectIds: string[];
}

interface Config {
  version: string;
  dataDirectory: string;
  backupEnabled: boolean;
  backupRetentionDays: number;
  features: {
    dependencies: boolean;
    concurrentWork: boolean;
  };
}

export class TodosStorageV2 {
  private homeDir = os.homedir();
  private baseDir = path.join(this.homeDir, '.claude-todos-mcp');
  private dataDir = path.join(this.baseDir, 'data');
  private configPath = path.join(this.baseDir, 'config.json');
  private config: Config | null = null;
  
  // Cache for workspace metadata
  private workspaceCache = new Map<string, WorkspaceMetadata>();
  
  constructor() {}
  
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.dataDir, { recursive: true });
  }
  
  private async loadConfig(): Promise<Config> {
    if (this.config) return this.config;
    
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
      return this.config!;
    } catch {
      // Create default config
      this.config = {
        version: '2.0.0',
        dataDirectory: this.dataDir,
        backupEnabled: true,
        backupRetentionDays: 30,
        features: {
          dependencies: false,
          concurrentWork: false
        }
      };
      
      await this.saveConfig();
      return this.config;
    }
  }
  
  private async saveConfig(): Promise<void> {
    await this.ensureDirectories();
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }
  
  // Path helper methods
  protected getWorkspaceDir(workspaceId: string): string {
    return path.join(this.dataDir, workspaceId);
  }
  
  protected getWorkspaceFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), 'workspace.json');
  }
  
  protected getProjectFile(workspaceId: string, projectId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), `project-${projectId}.json`);
  }
  
  // Atomic file operations
  protected async writeJsonFile(filePath: string, data: any): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, filePath);
  }
  
  protected async readJsonFile<T>(filePath: string): Promise<T> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in file: ${filePath}`);
      }
      throw error;
    }
  }
  
  // Migration from old format
  async migrateFromV1(oldDataPath?: string): Promise<void> {
    const defaultOldPath = path.join(process.cwd(), 'todos-data.json');
    const sourcePath = oldDataPath || defaultOldPath;
    
    try {
      const oldData = await this.readJsonFile<TodosData>(sourcePath);
      console.log(`Migrating ${oldData.workspaces.length} workspaces...`);
      
      await this.ensureDirectories();
      
      for (const workspace of oldData.workspaces) {
        const workspaceId = workspace.id || uuidv4();
        const workspaceDir = this.getWorkspaceDir(workspaceId);
        await fs.mkdir(workspaceDir, { recursive: true });
        
        // Save workspace metadata
        const workspaceMeta: WorkspaceMetadata = {
          id: workspaceId,
          path: workspace.path,
          name: path.basename(workspace.path),
          createdAt: new Date(),
          updatedAt: new Date(),
          projectIds: workspace.projects.map(p => p.id)
        };
        
        await this.writeJsonFile(this.getWorkspaceFile(workspaceId), workspaceMeta);
        
        // Save each project
        for (const project of workspace.projects) {
          await this.writeJsonFile(
            this.getProjectFile(workspaceId, project.id),
            project
          );
        }
        
        console.log(`Migrated workspace: ${workspace.path} (${workspace.projects.length} projects)`);
      }
      
      // Archive old file
      const backupDir = path.join(this.baseDir, 'backups', 'migration');
      await fs.mkdir(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `todos-data-v1-${Date.now()}.json`);
      await fs.copyFile(sourcePath, backupPath);
      
      console.log(`Migration complete! Old data backed up to: ${backupPath}`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('No old data file found, starting fresh.');
      } else {
        throw error;
      }
    }
  }
  
  // Workspace operations
  async getOrCreateWorkspace(workspacePath: string): Promise<WorkspaceMetadata> {
    await this.ensureDirectories();
    
    // Check cache first
    for (const [id, workspace] of this.workspaceCache) {
      if (workspace.path === workspacePath) {
        return workspace;
      }
    }
    
    // Check all workspace directories
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const workspaceFile = this.getWorkspaceFile(entry.name);
            const workspace = await this.readJsonFile<WorkspaceMetadata>(workspaceFile);
            
            this.workspaceCache.set(workspace.id, workspace);
            
            if (workspace.path === workspacePath) {
              return workspace;
            }
          } catch {
            // Invalid workspace directory, skip
          }
        }
      }
    } catch {
      // Data directory doesn't exist yet
    }
    
    // Create new workspace
    const workspaceId = uuidv4();
    const workspace: WorkspaceMetadata = {
      id: workspaceId,
      path: workspacePath,
      name: path.basename(workspacePath),
      createdAt: new Date(),
      updatedAt: new Date(),
      projectIds: []
    };
    
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    await fs.mkdir(workspaceDir, { recursive: true });
    await this.writeJsonFile(this.getWorkspaceFile(workspaceId), workspace);
    
    this.workspaceCache.set(workspaceId, workspace);
    return workspace;
  }
  
  // Project operations
  async createProject(request: CreateProjectRequest): Promise<Project> {
    // Validate project name
    validateProjectName(request.name);
    
    const workspace = await this.getOrCreateWorkspace(request.workspacePath);
    
    const project: Project = {
      id: uuidv4(),
      workspaceId: workspace.id,
      name: request.name,
      description: request.description || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      phases: [],
      todos: [],
      documents: []
    };
    
    await this.writeJsonFile(
      this.getProjectFile(workspace.id, project.id),
      project
    );
    
    // Update workspace metadata
    workspace.projectIds.push(project.id);
    workspace.updatedAt = new Date();
    await this.writeJsonFile(this.getWorkspaceFile(workspace.id), workspace);
    
    return project;
  }
  
  async getProject(projectId: string): Promise<Project | null> {
    // Search all workspaces for the project
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const projectFile = this.getProjectFile(entry.name, projectId);
            const project = await this.readJsonFile<Project>(projectFile);
            return project;
          } catch {
            // Project not in this workspace
          }
        }
      }
    } catch {
      // Data directory doesn't exist
    }
    
    return null;
  }
  
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    const workspaceId = await this.findWorkspaceForProject(projectId);
    if (!workspaceId) return null;
    
    const project = await this.getProject(projectId);
    if (!project) return null;
    
    const updated = {
      ...project,
      ...updates,
      id: project.id, // Prevent ID change
      updatedAt: new Date()
    };
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, projectId),
      updated
    );
    
    return updated;
  }
  
  async deleteProject(projectId: string): Promise<boolean> {
    const workspaceId = await this.findWorkspaceForProject(projectId);
    if (!workspaceId) return false;
    
    try {
      await fs.unlink(this.getProjectFile(workspaceId, projectId));
      
      // Update workspace metadata
      const workspace = await this.readJsonFile<WorkspaceMetadata>(
        this.getWorkspaceFile(workspaceId)
      );
      workspace.projectIds = workspace.projectIds.filter(id => id !== projectId);
      workspace.updatedAt = new Date();
      await this.writeJsonFile(this.getWorkspaceFile(workspaceId), workspace);
      
      return true;
    } catch {
      return false;
    }
  }
  
  async listProjects(): Promise<Project[]> {
    const projects: Project[] = [];
    
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspaceDir = this.getWorkspaceDir(entry.name);
          const files = await fs.readdir(workspaceDir);
          
          for (const file of files) {
            if (file.startsWith('project-') && file.endsWith('.json')) {
              try {
                const project = await this.readJsonFile<Project>(
                  path.join(workspaceDir, file)
                );
                projects.push(project);
              } catch {
                // Invalid project file, skip
              }
            }
          }
        }
      }
    } catch {
      // Data directory doesn't exist
    }
    
    return projects;
  }
  
  // Todo operations
  async createTodo(request: CreateTodoRequest): Promise<TodoItem | null> {
    // Validate todo title
    validateTodoTitle(request.title);
    
    const workspaceId = await this.findWorkspaceForProject(request.projectId);
    if (!workspaceId) return null;
    
    const project = await this.getProject(request.projectId);
    if (!project) return null;
    
    // Check single in-progress constraint (will be removed in dependency update)
    const inProgressTodo = project.todos.find(t => t.status === 'in-progress');
    if (inProgressTodo) {
      throw new ValidationError('Only one todo can be in-progress at a time');
    }
    
    const todo: TodoItem = {
      id: uuidv4(),
      title: request.title,
      description: request.description,
      status: 'pending',
      phaseId: request.phaseId,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: project.todos.length,
      // Dependency fields - initialize as empty
      dependsOn: [],
      dependents: [],
      blockedBy: [],
      priority: 'medium',
      // Application areas - provide defaults for backwards compatibility
      areas: request.areas || ['backend'],
      primaryArea: request.primaryArea || request.areas?.[0] || 'backend',
      // Documentation fields
      notes: request.notes
    };
    
    project.todos.push(todo);
    project.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, request.projectId),
      project
    );
    
    return todo;
  }
  
  async updateTodo(request: UpdateTodoRequest): Promise<TodoItem | null> {
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
    
    // Check status constraints
    if (request.status === 'in-progress') {
      const inProgressTodo = targetProject.todos.find(
        t => t.status === 'in-progress' && t.id !== request.id
      );
      if (inProgressTodo) {
        throw new ValidationError('Only one todo can be in-progress at a time');
      }
    }
    
    const oldTodo = targetProject.todos[todoIndex];
    const updated = {
      ...oldTodo,
      ...request,
      id: oldTodo.id, // Prevent ID change
      updatedAt: new Date(),
      // Set startedAt when status changes to in-progress
      startedAt: request.status === 'in-progress' && oldTodo.status !== 'in-progress'
        ? new Date()
        : oldTodo.startedAt,
      // Set completedAt when status changes to completed
      completedAt: request.status === 'completed' && oldTodo.status !== 'completed' 
        ? new Date() 
        : oldTodo.completedAt
    };
    
    targetProject.todos[todoIndex] = updated;
    targetProject.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, targetProject.id),
      targetProject
    );
    
    return updated;
  }

  async changeStatus(todoId: string, newStatus: 'pending' | 'in-progress' | 'completed'): Promise<TodoItem | null> {
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
    
    // Check status constraints
    if (newStatus === 'in-progress') {
      const inProgressTodo = targetProject.todos.find(
        t => t.status === 'in-progress' && t.id !== todoId
      );
      if (inProgressTodo) {
        throw new ValidationError('Only one todo can be in-progress at a time');
      }
    }
    
    // Only update status and updatedAt, preserve all other fields
    const existingTodo = targetProject.todos[todoIndex];
    const updated = {
      ...existingTodo,
      status: newStatus,
      updatedAt: new Date(),
      // Set startedAt when status changes to in-progress
      startedAt: newStatus === 'in-progress' && existingTodo.status !== 'in-progress'
        ? new Date()
        : existingTodo.startedAt,
      // Set completedAt when status changes to completed
      completedAt: newStatus === 'completed' && existingTodo.status !== 'completed' 
        ? new Date() 
        : existingTodo.completedAt
    };
    
    targetProject.todos[todoIndex] = updated;
    targetProject.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, targetProject.id),
      targetProject
    );
    
    return updated;
  }
  
  async deleteTodo(todoId: string): Promise<boolean> {
    const projects = await this.listProjects();
    
    for (const project of projects) {
      const todoIndex = project.todos.findIndex(t => t.id === todoId);
      if (todoIndex !== -1) {
        const workspaceId = await this.findWorkspaceForProject(project.id);
        if (!workspaceId) continue;
        
        project.todos.splice(todoIndex, 1);
        
        // Reorder remaining todos
        project.todos.forEach((todo, index) => {
          todo.order = index;
        });
        
        project.updatedAt = new Date();
        
        await this.writeJsonFile(
          this.getProjectFile(workspaceId, project.id),
          project
        );
        
        return true;
      }
    }
    
    return false;
  }
  
  // Helper method to find workspace containing a project
  protected async findWorkspaceForProject(projectId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectFile = this.getProjectFile(entry.name, projectId);
          try {
            await fs.access(projectFile);
            return entry.name;
          } catch {
            // Project not in this workspace
          }
        }
      }
    } catch {
      // Data directory doesn't exist
    }
    
    return null;
  }
  
  // Other operations (phases, documents, etc.) follow similar patterns...
  
  async createPhase(request: CreatePhaseRequest): Promise<Phase | null> {
    const workspaceId = await this.findWorkspaceForProject(request.projectId);
    if (!workspaceId) return null;
    
    const project = await this.getProject(request.projectId);
    if (!project) return null;
    
    const phase: Phase = {
      id: uuidv4(),
      projectId: request.projectId,
      name: request.name,
      description: request.description,
      order: project.phases.length
    };
    
    project.phases.push(phase);
    project.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, request.projectId),
      project
    );
    
    return phase;
  }
  
  async reorderTodos(request: ReorderTodosRequest): Promise<boolean> {
    const workspaceId = await this.findWorkspaceForProject(request.projectId);
    if (!workspaceId) return false;
    
    const project = await this.getProject(request.projectId);
    if (!project) return false;
    
    const reorderedTodos: TodoItem[] = [];
    
    for (let i = 0; i < request.todoIds.length; i++) {
      const todo = project.todos.find(t => t.id === request.todoIds[i]);
      if (todo) {
        todo.order = i;
        reorderedTodos.push(todo);
      }
    }
    
    project.todos = reorderedTodos;
    project.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, request.projectId),
      project
    );
    
    return true;
  }
  
  async attachDocument(request: AttachDocumentRequest): Promise<Document | null> {
    const workspaceId = await this.findWorkspaceForProject(request.projectId);
    if (!workspaceId) return null;
    
    const project = await this.getProject(request.projectId);
    if (!project) return null;
    
    const document: Document = {
      id: uuidv4(),
      type: request.type,
      title: request.title,
      url: request.url,
      filePath: request.filePath,
      confluenceSpace: request.confluenceSpace,
      confluencePage: request.confluencePage,
      createdAt: new Date()
    };
    
    project.documents.push(document);
    project.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, request.projectId),
      project
    );
    
    return document;
  }
  
  async removeDocument(projectId: string, documentId: string): Promise<boolean> {
    const workspaceId = await this.findWorkspaceForProject(projectId);
    if (!workspaceId) return false;
    
    const project = await this.getProject(projectId);
    if (!project) return false;
    
    const docIndex = project.documents.findIndex(d => d.id === documentId);
    if (docIndex === -1) return false;
    
    project.documents.splice(docIndex, 1);
    project.updatedAt = new Date();
    
    await this.writeJsonFile(
      this.getProjectFile(workspaceId, projectId),
      project
    );
    
    return true;
  }
  
  async getWorkspaceByPath(workspacePath: string): Promise<Workspace | null> {
    const workspaceMeta = await this.getOrCreateWorkspace(workspacePath);
    const projects: Project[] = [];
    
    for (const projectId of workspaceMeta.projectIds) {
      const project = await this.getProject(projectId);
      if (project) {
        projects.push(project);
      }
    }
    
    return {
      id: workspaceMeta.id,
      path: workspaceMeta.path,
      name: workspaceMeta.name,
      createdAt: workspaceMeta.createdAt,
      projects
    };
  }
  
  async listWorkspaces(): Promise<Workspace[]> {
    const workspaces: Workspace[] = [];
    
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const workspaceMeta = await this.readJsonFile<WorkspaceMetadata>(
              this.getWorkspaceFile(entry.name)
            );
            
            const projects: Project[] = [];
            for (const projectId of workspaceMeta.projectIds) {
              const project = await this.getProject(projectId);
              if (project) {
                projects.push(project);
              }
            }
            
            workspaces.push({
              id: workspaceMeta.id,
              path: workspaceMeta.path,
              name: workspaceMeta.name,
              createdAt: workspaceMeta.createdAt,
              projects
            });
          } catch {
            // Invalid workspace directory, skip
          }
        }
      }
    } catch {
      // Data directory doesn't exist
    }
    
    return workspaces;
  }
}