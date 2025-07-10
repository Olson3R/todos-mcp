// Shared types between frontend and backend
export interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  todos: TodoItem[];
  phases: Phase[];
  documents: Document[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  // Dependency fields
  dependsOn: string[];
  dependents: string[];
  blockedBy: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Phase {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
}

export interface Document {
  id: string;
  type: 'link' | 'file' | 'confluence';
  title: string;
  url?: string;
  filePath?: string;
  confluenceSpace?: string;
  confluencePage?: string;
  projectId: string;
  createdAt: Date;
}

export interface ScopedWorkerIdentity {
  id: string;
  sessionId: string;
  workspaceId: string;
  name?: string;
  capabilities: string[];
  registeredAt: Date;
  lastSeen: Date;
  currentProjectId?: string;
  isConnected?: boolean;
  metadata: {
    model?: string;
    user?: string;
    purpose?: string;
    environment?: string;
  };
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  projects: Project[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DependencyGraphResult {
  nodes: DependencyGraphNode[];
  readyToWork: TodoItem[];
  blocked: TodoItem[];
  criticalPath: TodoItem[];
  estimatedTotalDuration: number;
}

export interface DependencyGraphNode {
  todo: TodoItem;
  dependencies: string[];
  dependents: string[];
  canStart: boolean;
  blockedBy: string[];
  level: number;
  criticalPath: boolean;
}

// WebSocket event types
export interface SocketEvents {
  // Worker events
  'worker:register': (data: { name: string; capabilities: string[]; purpose?: string; workspacePath?: string }) => void;
  'worker:registered': (data: { worker: ScopedWorkerIdentity; workspace: Workspace }) => void;
  'worker:registration-failed': (data: { error: string }) => void;
  'worker:heartbeat': () => void;
  'worker:joined': (worker: ScopedWorkerIdentity) => void;
  'worker:disconnected': (data: { workerId: string; timestamp: Date }) => void;
  
  // Project events
  'project:create': (data: { name: string; description?: string; workspacePath?: string }) => void;
  'project:created': (data: { project: Project; workerId: string }) => void;
  
  // Todo events
  'todo:create': (data: { projectId: string; title: string; description?: string; dependsOn?: string[]; priority?: string; estimatedDuration?: number }) => void;
  'todo:created': (data: { todo: TodoItem; projectId: string; workerId: string; timestamp: Date }) => void;
  'todo:update': (data: { id: string; title?: string; description?: string; status?: string; dependsOn?: string[] }) => void;
  'todo:updated': (data: { todo: TodoItem; oldTodo: TodoItem; projectId: string; workerId: string; timestamp: Date; changes: string[] }) => void;
  
  // Dependency events
  'dependency:add': (data: { todoId: string; dependsOnId: string }) => void;
  'dependency:added': (data: { todoId: string; dependsOnId: string; workerId: string; timestamp: Date }) => void;
  'dependency:remove': (data: { todoId: string; dependsOnId: string }) => void;
  'dependency:removed': (data: { todoId: string; dependsOnId: string; workerId: string; timestamp: Date }) => void;
  'dependency-graph:updated': (data: { projectId: string; graph: DependencyGraphResult; workerId: string }) => void;
  
  // Worker status
  'workers:get': (workspaceId: string) => void;
  'workers:list': (workers: ScopedWorkerIdentity[]) => void;
  
  // Workspace state
  'workspace:state': (data: { workspace: Workspace; projects: Project[]; workers: ScopedWorkerIdentity[] }) => void;
  
  // Error handling
  'error': (data: { message: string }) => void;
}

// Live update event for the activity feed
export interface LiveUpdateEvent {
  id: string;
  type: string;
  workerId: string;
  workerName?: string;
  timestamp: Date;
  message: string;
  projectId?: string;
  todoId?: string;
}