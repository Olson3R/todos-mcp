export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  // Dependency graph fields
  dependsOn: string[];  // Array of todo IDs this todo depends on
  dependents: string[]; // Array of todo IDs that depend on this todo (computed field)
  blockedBy: string[];  // Array of todo IDs currently blocking this todo (computed field)
  estimatedDuration?: number; // Estimated time in minutes
  actualDuration?: number;    // Actual time spent in minutes
  priority: 'low' | 'medium' | 'high' | 'critical';
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
  dependsOn?: string[];
  estimatedDuration?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface UpdateTodoRequest {
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  dependsOn?: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
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

// Dependency management interfaces
export interface AddDependencyRequest {
  todoId: string;
  dependsOnId: string;
}

export interface RemoveDependencyRequest {
  todoId: string;
  dependsOnId: string;
}

export interface DependencyGraphNode {
  todo: TodoItem;
  dependencies: TodoItem[];
  dependents: TodoItem[];
  isBlocked: boolean;
  canStart: boolean;
  depth: number;
}

export interface DependencyGraphResult {
  nodes: DependencyGraphNode[];
  readyToWork: TodoItem[];
  blocked: TodoItem[];
  cycles: string[][];
  criticalPath: TodoItem[];
}

export interface WorkAllocationResult {
  assignedTodos: { workerId: string; todos: TodoItem[] }[];
  unassignedTodos: TodoItem[];
  conflicts: { todoId: string; reason: string }[];
}