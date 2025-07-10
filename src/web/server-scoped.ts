import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as path from 'path';
import { ScopedTodosStorage } from '../scoped-storage.js';
import { ValidationError } from '../validation.js';
import { 
  RegisterWorkerRequest, 
  ChangeEvent 
} from '../tracking-types.js';
import { ScopedWorkerIdentity } from '../scoped-worker-registry.js';
import {
  CreateProjectRequest,
  CreateTodoRequest,
  UpdateTodoRequest,
  AddDependencyRequest,
  RemoveDependencyRequest
} from '../types.js';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const storage = new ScopedTodosStorage();

// CORS middleware for Express routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Track connected workers and their socket connections
const connectedWorkers = new Map<string, { worker: ScopedWorkerIdentity; socketId: string }>();
const socketToWorker = new Map<string, string>(); // socketId -> workerId

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Worker registration via WebSocket
  socket.on('worker:register', async (data: RegisterWorkerRequest & { workspacePath?: string }) => {
    try {
      console.log(`👤 Worker registering: ${data.name}`);
      
      const workspacePath = data.workspacePath || process.cwd();
      const workspace = await storage.getOrCreateWorkspace(workspacePath);
      
      const worker = await storage.registerWorkerForWorkspace(workspace.id, {
        name: data.name,
        capabilities: data.capabilities || [],
        purpose: data.purpose || 'Web interface user'
      });

      // Track the connection
      connectedWorkers.set(worker.id, { worker, socketId: socket.id });
      socketToWorker.set(socket.id, worker.id);

      // Join workspace room for real-time updates
      socket.join(`workspace:${workspace.id}`);
      socket.join(`worker:${worker.id}`);

      console.log(`✅ Worker registered: ${worker.name} (${worker.id}) in workspace ${workspace.id}`);

      // Send worker info back to client
      socket.emit('worker:registered', { worker, workspace });

      // Broadcast to other clients in the workspace
      socket.to(`workspace:${workspace.id}`).emit('worker:joined', worker);

      // Send current workspace state
      const projects = await getWorkspaceProjects(workspace.id);
      const activeWorkers = await storage.getWorkspaceWorkers(workspace.id);
      
      socket.emit('workspace:state', {
        workspace,
        projects,
        workers: activeWorkers
      });

    } catch (error) {
      console.error('❌ Worker registration failed:', error);
      socket.emit('worker:registration-failed', { 
        error: error instanceof Error ? error.message : 'Registration failed' 
      });
    }
  });

  // Worker heartbeat
  socket.on('worker:heartbeat', async () => {
    const workerId = socketToWorker.get(socket.id);
    if (workerId) {
      await storage.heartbeat();
      
      // Broadcast heartbeat to workspace
      const workerData = connectedWorkers.get(workerId);
      if (workerData) {
        socket.to(`workspace:${workerData.worker.workspaceId}`).emit('worker:heartbeat', {
          workerId,
          timestamp: new Date()
        });
      }
    }
  });

  // Project operations
  socket.on('project:create', async (data: CreateProjectRequest) => {
    try {
      const workerId = socketToWorker.get(socket.id);
      if (!workerId) {
        socket.emit('error', { message: 'Worker not registered' });
        return;
      }

      const project = await storage.createProject(data);
      const workspace = await storage.getOrCreateWorkspace(data.workspacePath);

      // Broadcast to workspace
      io.to(`workspace:${workspace.id}`).emit('project:created', { project, workerId });
      
      console.log(`📋 Project created: ${project.name} by worker ${workerId}`);
    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to create project' 
      });
    }
  });

  // Todo operations with real-time updates
  socket.on('todo:create', async (data: CreateTodoRequest) => {
    try {
      const workerId = socketToWorker.get(socket.id);
      if (!workerId) {
        socket.emit('error', { message: 'Worker not registered' });
        return;
      }

      const todo = await storage.createTodo(data);
      if (todo) {
        const project = await storage.getProject(data.projectId);
        if (project) {
          // Broadcast to workspace
          io.to(`workspace:${project.workspaceId}`).emit('todo:created', { 
            todo, 
            projectId: data.projectId,
            workerId,
            timestamp: new Date()
          });

          // Check if this unblocks other todos
          const graph = await storage.getDependencyGraph(data.projectId);
          io.to(`workspace:${project.workspaceId}`).emit('dependency-graph:updated', {
            projectId: data.projectId,
            graph,
            workerId
          });
        }
      }
    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to create todo' 
      });
    }
  });

  socket.on('todo:update', async (data: UpdateTodoRequest) => {
    try {
      const workerId = socketToWorker.get(socket.id);
      if (!workerId) {
        socket.emit('error', { message: 'Worker not registered' });
        return;
      }

      const oldTodo = await findTodoById(data.id);
      const updatedTodo = await storage.updateTodo(data);
      
      if (updatedTodo && oldTodo) {
        const project = await findProjectByTodoId(data.id);
        if (project) {
          // Broadcast update to workspace
          io.to(`workspace:${project.workspaceId}`).emit('todo:updated', {
            todo: updatedTodo,
            oldTodo,
            projectId: project.id,
            workerId,
            timestamp: new Date(),
            changes: getChangedFields(oldTodo, updatedTodo)
          });

          // If status changed, update dependency graph
          if (oldTodo.status !== updatedTodo.status) {
            const graph = await storage.getDependencyGraph(project.id);
            io.to(`workspace:${project.workspaceId}`).emit('dependency-graph:updated', {
              projectId: project.id,
              graph,
              workerId
            });
          }

          console.log(`📝 Todo updated: ${updatedTodo.title} -> ${updatedTodo.status} by worker ${workerId}`);
        }
      }
    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to update todo' 
      });
    }
  });

  // Dependency management
  socket.on('dependency:add', async (data: AddDependencyRequest) => {
    try {
      const workerId = socketToWorker.get(socket.id);
      if (!workerId) {
        socket.emit('error', { message: 'Worker not registered' });
        return;
      }

      const result = await storage.addDependency(data);
      if (result) {
        const project = await findProjectByTodoId(data.todoId);
        if (project) {
          const graph = await storage.getDependencyGraph(project.id);
          
          io.to(`workspace:${project.workspaceId}`).emit('dependency:added', {
            todoId: data.todoId,
            dependsOnId: data.dependsOnId,
            workerId,
            timestamp: new Date()
          });

          io.to(`workspace:${project.workspaceId}`).emit('dependency-graph:updated', {
            projectId: project.id,
            graph,
            workerId
          });
        }
      }
    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to add dependency' 
      });
    }
  });

  socket.on('dependency:remove', async (data: RemoveDependencyRequest) => {
    try {
      const workerId = socketToWorker.get(socket.id);
      if (!workerId) {
        socket.emit('error', { message: 'Worker not registered' });
        return;
      }

      const result = await storage.removeDependency(data);
      if (result) {
        const project = await findProjectByTodoId(data.todoId);
        if (project) {
          const graph = await storage.getDependencyGraph(project.id);
          
          io.to(`workspace:${project.workspaceId}`).emit('dependency:removed', {
            todoId: data.todoId,
            dependsOnId: data.dependsOnId,
            workerId,
            timestamp: new Date()
          });

          io.to(`workspace:${project.workspaceId}`).emit('dependency-graph:updated', {
            projectId: project.id,
            graph,
            workerId
          });
        }
      }
    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to remove dependency' 
      });
    }
  });

  // Worker status queries
  socket.on('workers:get', async (workspaceId: string) => {
    try {
      const workers = await storage.getWorkspaceWorkers(workspaceId);
      const connectedWorkerIds = Array.from(connectedWorkers.keys());
      
      // Add real-time connection status
      const workersWithStatus = workers.map(worker => ({
        ...worker,
        isConnected: connectedWorkerIds.includes(worker.id),
        lastSeen: connectedWorkers.get(worker.id) ? new Date() : worker.lastSeen
      }));
      
      socket.emit('workers:list', workersWithStatus);
    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to get workers' 
      });
    }
  });

  // Worker disconnect handling
  socket.on('disconnect', async () => {
    const workerId = socketToWorker.get(socket.id);
    if (workerId) {
      const workerData = connectedWorkers.get(workerId);
      
      if (workerData) {
        console.log(`👋 Worker disconnected: ${workerData.worker.name} (${workerId})`);
        
        // Broadcast to workspace
        socket.to(`workspace:${workerData.worker.workspaceId}`).emit('worker:disconnected', {
          workerId,
          timestamp: new Date()
        });

        // Clean up tracking
        connectedWorkers.delete(workerId);
        socketToWorker.delete(socket.id);

        // Deregister worker from storage
        await storage.deregisterWorker();
      }
    }
    
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Helper functions
async function getWorkspaceProjects(workspaceId: string) {
  const workspace = await storage.getWorkspaceByPath(''); // This needs workspace ID lookup
  return workspace?.projects || [];
}

async function findTodoById(todoId: string) {
  const projects = await storage.listProjects();
  for (const project of projects) {
    const todo = project.todos.find(t => t.id === todoId);
    if (todo) return todo;
  }
  return null;
}

async function findProjectByTodoId(todoId: string) {
  const projects = await storage.listProjects();
  return projects.find(project => 
    project.todos.some(todo => todo.id === todoId)
  ) || null;
}

function getChangedFields(oldTodo: any, newTodo: any): string[] {
  const changes: string[] = [];
  const fields = ['title', 'description', 'status', 'priority', 'dependsOn'];
  
  for (const field of fields) {
    if (JSON.stringify(oldTodo[field]) !== JSON.stringify(newTodo[field])) {
      changes.push(field);
    }
  }
  
  return changes;
}

// REST API endpoints (for non-real-time operations)
app.get('/api/workspaces', async (req, res) => {
  try {
    const workspaces = await storage.listWorkspaces();
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await storage.listProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/projects/:id/dependency-graph', async (req, res) => {
  try {
    const graph = await storage.getDependencyGraph(req.params.id);
    if (!graph) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(graph);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/projects/:id/available-work', async (req, res) => {
  try {
    const workerId = req.query.workerId as string;
    const availableWork = await storage.getAvailableWork(req.params.id, workerId);
    res.json(availableWork);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/projects/:id/changes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const entityType = req.query.entityType as string;
    const entityId = req.query.entityId as string;
    
    const changes = await storage.getProjectChangeHistory(req.params.id, entityType, entityId);
    res.json(changes.slice(0, limit));
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/workspaces/:id/workers', async (req, res) => {
  try {
    const workers = await storage.getWorkspaceWorkers(req.params.id);
    const connectedWorkerIds = Array.from(connectedWorkers.keys());
    
    // Add real-time connection status
    const workersWithStatus = workers.map(worker => ({
      ...worker,
      isConnected: connectedWorkerIds.includes(worker.id),
      socketId: connectedWorkers.get(worker.id)?.socketId
    }));
    
    res.json(workersWithStatus);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Serve the web interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`🚀 Scoped todos server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time collaboration`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  // Disconnect all workers
  for (const [workerId, data] of connectedWorkers) {
    try {
      await storage.deregisterWorker();
    } catch (error) {
      console.error(`Failed to deregister worker ${workerId}:`, error);
    }
  }
  
  await storage.shutdown();
  server.close(() => {
    console.log('✅ Server shutdown complete');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  await storage.shutdown();
  process.exit(0);
});