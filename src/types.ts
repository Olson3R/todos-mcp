export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
}

export interface Phase {
  id: string;
  name: string;
  description?: string;
  order: number;
  projectId: string;
}

export interface Document {
  id: string;
  type: 'link' | 'file' | 'confluence';
  title: string;
  url?: string;
  filePath?: string;
  confluenceSpace?: string;
  confluencePage?: string;
  createdAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  phases: Phase[];
  todos: TodoItem[];
  documents: Document[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  projects: Project[];
  createdAt: Date;
}

export interface TodosData {
  workspaces: Workspace[];
  lastUpdated: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspacePath: string;
}

export interface CreateTodoRequest {
  title: string;
  description?: string;
  projectId: string;
  phaseId?: string;
}

export interface UpdateTodoRequest {
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
}

export interface CreatePhaseRequest {
  name: string;
  description?: string;
  projectId: string;
}

export interface AttachDocumentRequest {
  projectId: string;
  type: 'link' | 'file' | 'confluence';
  title: string;
  url?: string;
  filePath?: string;
  confluenceSpace?: string;
  confluencePage?: string;
}

export interface ReorderTodosRequest {
  projectId: string;
  todoIds: string[];
}