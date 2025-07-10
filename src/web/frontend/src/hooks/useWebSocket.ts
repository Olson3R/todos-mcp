import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Define types directly in this file to avoid import issues
interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  dependsOn: string[];
  dependents: string[];
  blockedBy: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface Phase {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
}

interface Document {
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

interface Project {
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

interface ScopedWorkerIdentity {
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

interface Workspace {
  id: string;
  name: string;
  path: string;
  projects: Project[];
  createdAt: Date;
  updatedAt: Date;
}

interface DependencyGraphNode {
  todo: TodoItem;
  dependencies: string[];
  dependents: string[];
  canStart: boolean;
  blockedBy: string[];
  level: number;
  criticalPath: boolean;
}

interface DependencyGraphResult {
  nodes: DependencyGraphNode[];
  readyToWork: TodoItem[];
  blocked: TodoItem[];
  criticalPath: TodoItem[];
  estimatedTotalDuration: number;
}

interface LiveUpdateEvent {
  id: string;
  type: string;
  workerId: string;
  workerName?: string;
  timestamp: Date;
  message: string;
  projectId?: string;
  todoId?: string;
}

interface SocketEvents {
  'worker:register': (data: { name: string; capabilities: string[]; purpose?: string; workspacePath?: string }) => void;
  'worker:registered': (data: { worker: ScopedWorkerIdentity; workspace: Workspace }) => void;
  'worker:registration-failed': (data: { error: string }) => void;
  'worker:heartbeat': () => void;
  'worker:joined': (worker: ScopedWorkerIdentity) => void;
  'worker:disconnected': (data: { workerId: string; timestamp: Date }) => void;
  'project:create': (data: { name: string; description?: string; workspacePath?: string }) => void;
  'project:created': (data: { project: Project; workerId: string }) => void;
  'todo:create': (data: { projectId: string; title: string; description?: string; dependsOn?: string[]; priority?: string; estimatedDuration?: number }) => void;
  'todo:created': (data: { todo: TodoItem; projectId: string; workerId: string; timestamp: Date }) => void;
  'todo:update': (data: { id: string; title?: string; description?: string; status?: string; dependsOn?: string[] }) => void;
  'todo:updated': (data: { todo: TodoItem; oldTodo: TodoItem; projectId: string; workerId: string; timestamp: Date; changes: string[] }) => void;
  'dependency:add': (data: { todoId: string; dependsOnId: string }) => void;
  'dependency:added': (data: { todoId: string; dependsOnId: string; workerId: string; timestamp: Date }) => void;
  'dependency:remove': (data: { todoId: string; dependsOnId: string }) => void;
  'dependency:removed': (data: { todoId: string; dependsOnId: string; workerId: string; timestamp: Date }) => void;
  'dependency-graph:updated': (data: { projectId: string; graph: DependencyGraphResult; workerId: string }) => void;
  'workers:get': (workspaceId: string) => void;
  'workers:list': (workers: ScopedWorkerIdentity[]) => void;
  'workspace:state': (data: { workspace: Workspace; projects: Project[]; workers: ScopedWorkerIdentity[] }) => void;
  'error': (data: { message: string }) => void;
}

interface UseWebSocketProps {
  workspacePath?: string;
  workerName?: string;
  capabilities?: string[];
  purpose?: string;
}

interface WebSocketState {
  socket: Socket | null;
  isConnected: boolean;
  currentWorker: ScopedWorkerIdentity | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  projects: Project[];
  workers: ScopedWorkerIdentity[];
  liveUpdates: LiveUpdateEvent[];
  error: string | null;
}

// Generate or retrieve a stable client ID for this browser
const getStableClientId = () => {
  let clientId = localStorage.getItem('todos-mcp-client-id');
  if (!clientId) {
    clientId = `web-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('todos-mcp-client-id', clientId);
  }
  return clientId;
};

export function useWebSocket({
  workspacePath = '/workspace',
  workerName = 'Web User',
  capabilities = ['ui', 'coordination'],
  purpose = 'Web interface user'
}: UseWebSocketProps = {}) {
  // Stabilize props to prevent unnecessary re-renders
  const stableWorkspacePath = useRef(workspacePath);
  const stableWorkerName = useRef(workerName);
  const stableCapabilities = useRef(capabilities);
  const stablePurpose = useRef(purpose);
  const stableClientId = useRef(getStableClientId());
  
  // Update refs when props change
  useEffect(() => {
    stableWorkspacePath.current = workspacePath;
    stableWorkerName.current = workerName;
    stableCapabilities.current = capabilities;
    stablePurpose.current = purpose;
  }, [workspacePath, workerName, capabilities, purpose]);
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    socket: null,
    isConnected: false,
    currentWorker: null,
    currentWorkspace: null,
    workspaces: [],
    projects: [],
    workers: [],
    liveUpdates: [],
    error: null
  });

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io('http://localhost:3003', {
      transports: ['websocket'],
      autoConnect: true
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('🔌 Connected to server');
      setState(prev => ({ ...prev, isConnected: true, error: null }));
      
      // Register as worker with stable client ID
      socket.emit('worker:register', {
        name: stableWorkerName.current,
        capabilities: stableCapabilities.current,
        purpose: stablePurpose.current,
        workspacePath: stableWorkspacePath.current,
        clientId: stableClientId.current
      });
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      setState(prev => ({ 
        ...prev, 
        isConnected: false, 
        currentWorker: null,
        currentWorkspace: null 
      }));
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error);
      setState(prev => ({ ...prev, error: error.message }));
    });

    // Worker registration events
    socket.on('worker:registered', (data) => {
      console.log('👤 Worker registered:', data.worker);
      console.log('🏠 New workspace:', data.workspace);
      setState(prev => ({ 
        ...prev, 
        currentWorker: data.worker,
        currentWorkspace: data.workspace,
        error: null 
      }));
      
      // Load projects for this workspace as fallback
      if (data.workspace?.id) {
        loadProjects(data.workspace.id);
      }
    });

    socket.on('worker:registration-failed', (data) => {
      console.error('👤 Worker registration failed:', data.error);
      setState(prev => ({ ...prev, error: data.error }));
    });

    // Workspace state
    socket.on('workspace:state', (data) => {
      console.log('🏠 Workspace state received:', data);
      // Deduplicate workers by id
      const uniqueWorkers = data.workers.filter((worker: any, index: number, arr: any[]) => 
        arr.findIndex(w => w.id === worker.id) === index
      );
      setState(prev => ({ 
        ...prev, 
        projects: data.projects,
        workers: uniqueWorkers 
      }));
    });

    // Real-time events
    socket.on('worker:joined', (worker) => {
      console.log('👤 Worker joined:', worker);
      setState(prev => {
        // Ensure no duplicates - filter out existing worker with same id first
        const filteredWorkers = prev.workers.filter(w => w.id !== worker.id);
        return { 
          ...prev, 
          workers: [...filteredWorkers, worker]
        };
      });
      
      addLiveUpdate({
        id: `worker-joined-${worker.id}-${Date.now()}`,
        type: 'worker:joined',
        workerId: worker.id,
        workerName: worker.name,
        timestamp: new Date(),
        message: `${worker.name || worker.id} joined the workspace`
      });
    });

    socket.on('worker:disconnected', (data) => {
      setState(prev => ({ 
        ...prev, 
        workers: prev.workers.filter(w => w.id !== data.workerId)
      }));
      
      addLiveUpdate({
        id: `worker-left-${data.workerId}-${Date.now()}`,
        type: 'worker:disconnected',
        workerId: data.workerId,
        timestamp: new Date(data.timestamp),
        message: `Worker disconnected`
      });
    });

    socket.on('project:created', (data) => {
      setState(prev => ({ 
        ...prev, 
        projects: [...prev.projects, data.project]
      }));
      
      addLiveUpdate({
        id: `project-created-${data.project.id}-${Date.now()}`,
        type: 'project:created',
        workerId: data.workerId,
        timestamp: new Date(),
        message: `Created project "${data.project.name}"`,
        projectId: data.project.id
      });
    });

    socket.on('todo:created', (data) => {
      setState(prev => ({
        ...prev,
        projects: prev.projects.map(p => 
          p.id === data.projectId 
            ? { ...p, todos: [...p.todos, data.todo] }
            : p
        )
      }));
      
      addLiveUpdate({
        id: `todo-created-${data.todo.id}-${Date.now()}`,
        type: 'todo:created',
        workerId: data.workerId,
        timestamp: new Date(data.timestamp),
        message: `Created todo "${data.todo.title}"`,
        projectId: data.projectId,
        todoId: data.todo.id
      });
    });

    socket.on('todo:updated', (data) => {
      setState(prev => ({
        ...prev,
        projects: prev.projects.map(p => 
          p.id === data.projectId 
            ? { 
                ...p, 
                todos: p.todos.map(t => t.id === data.todo.id ? data.todo : t)
              }
            : p
        )
      }));
      
      const statusChange = data.changes.includes('status');
      const message = statusChange 
        ? `${data.todo.title} → ${data.todo.status}`
        : `Updated todo "${data.todo.title}"`;
      
      addLiveUpdate({
        id: `todo-updated-${data.todo.id}-${Date.now()}`,
        type: 'todo:updated',
        workerId: data.workerId,
        timestamp: new Date(data.timestamp),
        message,
        projectId: data.projectId,
        todoId: data.todo.id
      });
    });

    socket.on('dependency:added', (data) => {
      addLiveUpdate({
        id: `dependency-added-${data.todoId}-${Date.now()}`,
        type: 'dependency:added',
        workerId: data.workerId,
        timestamp: new Date(data.timestamp),
        message: `Added dependency between todos`,
        todoId: data.todoId
      });
    });

    socket.on('workers:list', (workers) => {
      // Deduplicate workers by id
      const uniqueWorkers = workers.filter((worker: any, index: number, arr: any[]) => 
        arr.findIndex(w => w.id === worker.id) === index
      );
      setState(prev => ({ ...prev, workers: uniqueWorkers }));
    });

    socket.on('error', (data) => {
      console.error('🚨 Server error:', data.message);
      setState(prev => ({ ...prev, error: data.message }));
    });

    setState(prev => ({ ...prev, socket }));
  }, []); // No dependencies needed since we use refs

  // Helper function to add live updates
  const addLiveUpdate = useCallback((update: LiveUpdateEvent) => {
    setState(prev => ({
      ...prev,
      liveUpdates: [update, ...prev.liveUpdates].slice(0, 50) // Keep last 50 updates
    }));
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState(prev => ({ 
      ...prev, 
      socket: null, 
      isConnected: false,
      currentWorker: null,
      currentWorkspace: null
    }));
  }, []);

  // Workspace operations
  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3003/api/workspaces');
      if (response.ok) {
        const workspaces = await response.json();
        setState(prev => ({ ...prev, workspaces }));
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  }, []);

  const loadProjects = useCallback(async (workspaceId?: string) => {
    try {
      const response = await fetch('http://localhost:3003/api/projects');
      if (response.ok) {
        const allProjects = await response.json();
        console.log('📋 All projects loaded via API:', allProjects);
        
        // Filter projects by current workspace if we have one
        const filteredProjects = workspaceId 
          ? allProjects.filter((project: any) => project.workspaceId === workspaceId)
          : allProjects;
        
        console.log('📋 Filtered projects for workspace:', workspaceId, filteredProjects);
        setState(prev => ({ ...prev, projects: filteredProjects }));
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }, []);

  const switchWorkspace = useCallback((workspacePath: string) => {
    if (state.socket && workspacePath !== stableWorkspacePath.current) {
      console.log('🔄 Switching workspace to:', workspacePath);
      
      // Clear current state
      setState(prev => ({
        ...prev,
        currentWorkspace: null,
        projects: [],
        workers: []
      }));
      
      // Update the stable workspace path
      stableWorkspacePath.current = workspacePath;
      
      // Re-register worker with new workspace
      state.socket.emit('worker:register', {
        name: stableWorkerName.current,
        capabilities: stableCapabilities.current,
        purpose: stablePurpose.current,
        workspacePath: workspacePath,
        clientId: stableClientId.current
      });
    }
  }, [state.socket]);

  const createWorkspace = useCallback((name: string, path: string) => {
    // For now, just switch to the new workspace path
    // The backend will create the workspace when we register
    switchWorkspace(path);
  }, [switchWorkspace]);

  // Action methods
  const createProject = useCallback((name: string, description?: string) => {
    if (state.socket) {
      state.socket.emit('project:create', { name, description, workspacePath: stableWorkspacePath.current });
    }
  }, [state.socket]);

  const createTodo = useCallback((projectId: string, title: string, options: {
    description?: string;
    dependsOn?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
    estimatedDuration?: number;
  } = {}) => {
    if (state.socket) {
      state.socket.emit('todo:create', { projectId, title, ...options });
    }
  }, [state.socket]);

  const updateTodo = useCallback((id: string, updates: {
    title?: string;
    description?: string;
    status?: 'pending' | 'in-progress' | 'completed';
    dependsOn?: string[];
  }) => {
    if (state.socket) {
      state.socket.emit('todo:update', { id, ...updates });
    }
  }, [state.socket]);

  const addDependency = useCallback((todoId: string, dependsOnId: string) => {
    if (state.socket) {
      state.socket.emit('dependency:add', { todoId, dependsOnId });
    }
  }, [state.socket]);

  const removeDependency = useCallback((todoId: string, dependsOnId: string) => {
    if (state.socket) {
      state.socket.emit('dependency:remove', { todoId, dependsOnId });
    }
  }, [state.socket]);

  const sendHeartbeat = useCallback(() => {
    if (state.socket) {
      state.socket.emit('worker:heartbeat');
    }
  }, [state.socket]);

  const getWorkers = useCallback((workspaceId: string) => {
    if (state.socket) {
      state.socket.emit('workers:get', workspaceId);
    }
  }, [state.socket]);

  // Auto-connect on mount (only once)
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []); // Empty dependency array - only run on mount/unmount

  // Handle initial workspace registration only
  useEffect(() => {
    if (state.isConnected && state.socket && !state.currentWorker && workspacePath) {
      console.log('🔄 Initial workspace registration:', workspacePath);
      stableWorkspacePath.current = workspacePath;
      
      // Register worker with initial workspace
      state.socket.emit('worker:register', {
        name: stableWorkerName.current,
        capabilities: stableCapabilities.current,
        purpose: stablePurpose.current,
        workspacePath: workspacePath,
        clientId: stableClientId.current
      });
    }
  }, [workspacePath, state.isConnected, state.socket, state.currentWorker]);

  // Load workspaces when connected
  useEffect(() => {
    if (state.isConnected) {
      loadWorkspaces();
      // Don't load projects here - they come from workspace:state event
    }
  }, [state.isConnected, loadWorkspaces]);

  // Heartbeat interval
  useEffect(() => {
    if (state.isConnected && state.currentWorker) {
      const interval = setInterval(sendHeartbeat, 60000); // Every minute
      return () => clearInterval(interval);
    }
  }, [state.isConnected, state.currentWorker, sendHeartbeat]);

  return {
    ...state,
    connect,
    disconnect,
    loadWorkspaces,
    loadProjects,
    switchWorkspace,
    createWorkspace,
    createProject,
    createTodo,
    updateTodo,
    addDependency,
    removeDependency,
    sendHeartbeat,
    getWorkers
  };
}