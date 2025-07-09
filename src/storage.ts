import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  TodosData,
  Workspace,
  Project,
  TodoItem,
  Phase,
  Document,
  CreateProjectRequest,
  CreateTodoRequest,
  UpdateTodoRequest,
  CreatePhaseRequest,
  AttachDocumentRequest,
  ReorderTodosRequest
} from './types.js';
import {
  validateProjectName,
  validateWorkspacePath,
  validateTodoTitle,
  validateTodoStatus,
  validateDocumentData,
  validatePhaseName,
  validateUUID,
  ValidationError
} from './validation.js';

export class TodosStorage {
  private dataPath: string;
  private data: TodosData | null = null;

  constructor(dataPath: string = path.join(process.cwd(), 'todos-data.json')) {
    this.dataPath = dataPath;
  }

  async loadData(): Promise<TodosData> {
    if (this.data) {
      return this.data;
    }

    try {
      const fileContent = await fs.readFile(this.dataPath, 'utf-8');
      const rawData = JSON.parse(fileContent);
      
      this.data = {
        workspaces: rawData.workspaces || [],
        lastUpdated: new Date(rawData.lastUpdated || new Date())
      };
    } catch (error) {
      this.data = {
        workspaces: [],
        lastUpdated: new Date()
      };
    }

    return this.data;
  }

  async saveData(): Promise<void> {
    if (!this.data) return;

    this.data.lastUpdated = new Date();
    await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  async getWorkspaceByPath(workspacePath: string): Promise<Workspace | null> {
    const data = await this.loadData();
    return data.workspaces.find(w => w.path === workspacePath) || null;
  }

  async createWorkspace(workspacePath: string): Promise<Workspace> {
    const data = await this.loadData();
    const existing = data.workspaces.find(w => w.path === workspacePath);
    
    if (existing) {
      return existing;
    }

    const workspace: Workspace = {
      id: uuidv4(),
      name: path.basename(workspacePath),
      path: workspacePath,
      projects: [],
      createdAt: new Date()
    };

    data.workspaces.push(workspace);
    await this.saveData();
    return workspace;
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    validateProjectName(request.name);
    validateWorkspacePath(request.workspacePath);
    
    const data = await this.loadData();
    let workspace = await this.getWorkspaceByPath(request.workspacePath);
    
    if (!workspace) {
      workspace = await this.createWorkspace(request.workspacePath);
    }

    // Check for duplicate project names in the workspace
    const existingProject = workspace.projects.find(p => p.name === request.name);
    if (existingProject) {
      throw new ValidationError('A project with this name already exists in the workspace');
    }

    const project: Project = {
      id: uuidv4(),
      name: request.name,
      description: request.description,
      workspaceId: workspace.id,
      phases: [],
      todos: [],
      documents: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    workspace.projects.push(project);
    await this.saveData();
    return project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const data = await this.loadData();
    
    for (const workspace of data.workspaces) {
      const project = workspace.projects.find(p => p.id === projectId);
      if (project) return project;
    }
    
    return null;
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    Object.assign(project, updates, { updatedAt: new Date() });
    await this.saveData();
    return project;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const data = await this.loadData();
    
    for (const workspace of data.workspaces) {
      const index = workspace.projects.findIndex(p => p.id === projectId);
      if (index >= 0) {
        workspace.projects.splice(index, 1);
        await this.saveData();
        return true;
      }
    }
    
    return false;
  }

  async createPhase(request: CreatePhaseRequest): Promise<Phase | null> {
    validateUUID(request.projectId);
    validatePhaseName(request.name);
    
    const project = await this.getProject(request.projectId);
    if (!project) return null;

    // Check for duplicate phase names in the project
    const existingPhase = project.phases.find(p => p.name === request.name);
    if (existingPhase) {
      throw new ValidationError('A phase with this name already exists in the project');
    }

    const phase: Phase = {
      id: uuidv4(),
      name: request.name,
      description: request.description,
      order: project.phases.length,
      projectId: request.projectId
    };

    project.phases.push(phase);
    project.updatedAt = new Date();
    await this.saveData();
    return phase;
  }

  async createTodo(request: CreateTodoRequest): Promise<TodoItem | null> {
    validateUUID(request.projectId);
    validateTodoTitle(request.title);
    
    if (request.phaseId) {
      validateUUID(request.phaseId);
    }
    
    const project = await this.getProject(request.projectId);
    if (!project) return null;

    // Validate phase exists if specified
    if (request.phaseId) {
      const phase = project.phases.find(p => p.id === request.phaseId);
      if (!phase) {
        throw new ValidationError('Phase not found');
      }
    }

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
      order: project.todos.length
    };

    project.todos.push(todo);
    project.updatedAt = new Date();
    await this.saveData();
    return todo;
  }

  async updateTodo(request: UpdateTodoRequest): Promise<TodoItem | null> {
    validateUUID(request.id);
    
    if (request.title !== undefined) {
      validateTodoTitle(request.title);
    }
    
    if (request.status !== undefined) {
      validateTodoStatus(request.status);
    }
    
    if (request.phaseId !== undefined) {
      validateUUID(request.phaseId);
    }
    
    const data = await this.loadData();
    
    for (const workspace of data.workspaces) {
      for (const project of workspace.projects) {
        const todo = project.todos.find(t => t.id === request.id);
        if (todo) {
          // Validate phase exists if specified
          if (request.phaseId !== undefined) {
            const phase = project.phases.find(p => p.id === request.phaseId);
            if (!phase && request.phaseId) {
              throw new ValidationError('Phase not found');
            }
          }
          
          if (request.status === 'in-progress') {
            const inProgressTodo = project.todos.find(t => t.status === 'in-progress' && t.id !== request.id);
            if (inProgressTodo) {
              throw new ValidationError('Only one todo can be in-progress at a time');
            }
          }

          if (request.title !== undefined) todo.title = request.title;
          if (request.description !== undefined) todo.description = request.description;
          if (request.status !== undefined) todo.status = request.status;
          if (request.phaseId !== undefined) todo.phaseId = request.phaseId;
          
          todo.updatedAt = new Date();
          project.updatedAt = new Date();
          await this.saveData();
          return todo;
        }
      }
    }
    
    return null;
  }

  async deleteTodo(todoId: string): Promise<boolean> {
    const data = await this.loadData();
    
    for (const workspace of data.workspaces) {
      for (const project of workspace.projects) {
        const index = project.todos.findIndex(t => t.id === todoId);
        if (index >= 0) {
          project.todos.splice(index, 1);
          project.updatedAt = new Date();
          await this.saveData();
          return true;
        }
      }
    }
    
    return false;
  }

  async reorderTodos(request: ReorderTodosRequest): Promise<boolean> {
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
    await this.saveData();
    return true;
  }

  async attachDocument(request: AttachDocumentRequest): Promise<Document | null> {
    validateUUID(request.projectId);
    validateDocumentData(request.type, request);
    
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
    await this.saveData();
    return document;
  }

  async removeDocument(projectId: string, documentId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    if (!project) return false;

    const index = project.documents.findIndex(d => d.id === documentId);
    if (index >= 0) {
      project.documents.splice(index, 1);
      project.updatedAt = new Date();
      await this.saveData();
      return true;
    }
    
    return false;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const data = await this.loadData();
    return data.workspaces;
  }

  async listProjects(workspaceId?: string): Promise<Project[]> {
    const data = await this.loadData();
    
    if (workspaceId) {
      const workspace = data.workspaces.find(w => w.id === workspaceId);
      return workspace?.projects || [];
    }
    
    return data.workspaces.flatMap(w => w.projects);
  }
}