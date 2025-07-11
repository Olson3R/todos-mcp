# Website Upgrade Plan: React + Tailwind + Live Worker Collaboration

## 🎯 Current State Analysis

**Current Stack:**
- ✅ Express.js REST API server
- ✅ Vanilla HTML/CSS/JavaScript frontend  
- ✅ Basic project/todo CRUD operations
- ❌ Uses old `TodosStorage` (being removed)
- ❌ No real-time updates or worker status visibility
- ❌ No modern build system
- ❌ No dependency graph visualization
- ❌ No multi-worker coordination features
- ❌ No live worker presence indicators

**Target Stack:**
- 🎯 Express.js + WebSocket server with scoped storage
- 🎯 React 18 with TypeScript
- 🎯 Tailwind CSS for styling
- 🎯 Real-time updates via WebSockets
- 🎯 Vite for build system
- 🎯 **Comprehensive worker status visibility**
- 🎯 **Live worker presence indicators**
- 🎯 **Real-time worker activity tracking**
- 🎯 Integration with scoped storage + dependency graphs
- 🎯 Multi-worker live collaboration with conflict prevention

## 📋 Implementation Plan

### **Phase 1: Project Setup & Infrastructure** ⏱️ ~2-3 hours

#### 1.1 Frontend Build System Setup
```bash
# Create React frontend in web/frontend directory
cd src/web
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Add Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Add additional dependencies
npm install @types/node socket.io-client lucide-react
npm install -D @types/socket.io-client
```

#### 1.2 Project Structure
```
src/web/
├── backend/              # Express + WebSocket server  
│   ├── server.ts         # Main server with WebSocket support
│   ├── api/              # REST API routes
│   │   ├── projects.ts
│   │   ├── todos.ts
│   │   ├── workers.ts
│   │   └── dependencies.ts
│   └── websocket/        # WebSocket handlers
│       ├── index.ts
│       ├── workers.ts
│       └── changes.ts
├── frontend/             # React application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks
│   │   ├── utils/        # Utilities
│   │   ├── types/        # TypeScript types
│   │   └── stores/       # State management
│   ├── public/
│   └── dist/             # Built assets
└── shared/               # Shared types between frontend/backend
    └── types.ts
```

#### 1.3 Development Scripts
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "tsx watch backend/server.ts",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "cd frontend && npm run build",
    "build:backend": "tsc backend/**/*.ts --outDir dist/backend"
  }
}
```

### **Phase 2: Backend API Upgrade & Worker Status System** ⏱️ ~3-4 hours

#### 2.1 Remove Old Storage System
- **Delete old `TodosStorage` and related files**
- **Remove all imports and references to old storage**
- **Update all endpoints to use `ScopedTodosStorage` exclusively**

#### 2.2 Worker Status & Presence System
- **Real-time worker registration/deregistration**
- **Live heartbeat tracking**  
- **Worker activity monitoring**
- **Connection status management**
- **Current task tracking per worker**

#### 2.2 WebSocket Integration
```typescript
// backend/websocket/index.ts
import { Server as SocketServer } from 'socket.io';
import { ScopedTodosStorage } from '../../scoped-storage.js';

export class WebSocketManager {
  private io: SocketServer;
  private storage: ScopedTodosStorage;
  private workerSessions = new Map<string, string>(); // socketId -> workerId

  async handleWorkerRegister(socket: Socket, data: RegisterWorkerRequest) {
    const worker = await this.storage.registerWorkerForWorkspace(data.workspaceId, data);
    this.workerSessions.set(socket.id, worker.id);
    
    // Notify all clients about new worker
    this.io.to(`workspace:${data.workspaceId}`).emit('worker:registered', worker);
    
    // Send current state to new worker
    socket.emit('workspace:state', await this.getWorkspaceState(data.workspaceId));
  }

  async handleTodoUpdate(socket: Socket, data: UpdateTodoRequest) {
    const workerId = this.workerSessions.get(socket.id);
    if (!workerId) return;

    const result = await this.storage.updateTodo(data);
    if (result) {
      // Broadcast change to all workspace members
      const project = await this.storage.getProject(result.projectId);
      this.io.to(`workspace:${project.workspaceId}`).emit('todo:updated', {
        todo: result,
        workerId,
        timestamp: new Date()
      });
    }
  }
}
```

#### 2.3 Enhanced API Endpoints
```typescript
// New endpoints for dependency graph features
app.post('/api/workers/register', handleWorkerRegistration);
app.get('/api/projects/:id/dependency-graph', getDependencyGraph);
app.post('/api/todos/:id/dependencies', addDependency);
app.delete('/api/todos/:id/dependencies/:depId', removeDependency);
app.get('/api/projects/:id/available-work', getAvailableWork);
app.post('/api/projects/:id/allocate-work', allocateWork);
app.get('/api/projects/:id/changes', getChangeHistory);
app.get('/api/workspaces/:id/workers', getWorkspaceWorkers);
```

### **Phase 3: React Frontend Development** ⏱️ ~5-6 hours

#### 3.1 Core Components Architecture
```typescript
// App component structure
App
├── Layout
│   ├── Header (with worker status)
│   ├── Sidebar (workspace/project nav)
│   └── Main content area
├── Pages
│   ├── Dashboard (overview)
│   ├── ProjectView (detailed project view)
│   ├── DependencyGraph (visual dependency graph)
│   └── WorkerView (multi-worker coordination)
└── Components
    ├── TodoCard (with dependency info)
    ├── WorkerBadge (live worker status)
    ├── DependencyVisualization
    ├── LiveUpdatesIndicator
    └── NotificationToast
```

#### 3.2 State Management with Zustand
```typescript
// stores/useProjectStore.ts
interface ProjectStore {
  projects: Project[];
  currentProject: Project | null;
  dependencyGraph: DependencyGraphResult | null;
  workers: ScopedWorkerIdentity[];
  
  // Actions
  loadProjects: () => Promise<void>;
  updateTodo: (id: string, updates: Partial<TodoItem>) => Promise<void>;
  addDependency: (todoId: string, dependsOnId: string) => Promise<void>;
  
  // Real-time updates
  handleTodoUpdate: (update: TodoUpdateEvent) => void;
  handleWorkerJoined: (worker: ScopedWorkerIdentity) => void;
}
```

#### 3.3 Real-time Hooks
```typescript
// hooks/useWebSocket.ts
export function useWebSocket(workspaceId: string) {
  const socket = useRef<Socket>();
  const [isConnected, setIsConnected] = useState(false);
  const [liveUpdates, setLiveUpdates] = useState<ChangeEvent[]>([]);

  useEffect(() => {
    socket.current = io('/ws');
    
    socket.current.emit('workspace:join', { workspaceId });
    
    socket.current.on('todo:updated', handleTodoUpdate);
    socket.current.on('worker:registered', handleWorkerJoined);
    socket.current.on('dependency:changed', handleDependencyChange);
    
    return () => socket.current?.disconnect();
  }, [workspaceId]);

  return { socket: socket.current, isConnected, liveUpdates };
}
```

#### 3.4 Key UI Components

**TodoCard with Dependencies:**
```tsx
function TodoCard({ todo, onUpdate, onAddDependency }: TodoCardProps) {
  return (
    <div className={`
      p-4 rounded-lg border-l-4 transition-all duration-200
      ${getStatusColors(todo.status)}
      ${todo.blockedBy.length > 0 ? 'opacity-75 cursor-not-allowed' : 'hover:shadow-md'}
    `}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">{todo.title}</h4>
          {todo.description && (
            <p className="text-sm text-gray-600 mt-1">{todo.description}</p>
          )}
          
          {/* Dependency indicators */}
          {todo.dependsOn.length > 0 && (
            <div className="flex items-center mt-2 text-xs text-gray-500">
              <Link size={12} className="mr-1" />
              Depends on {todo.dependsOn.length} task(s)
            </div>
          )}
          
          {todo.blockedBy.length > 0 && (
            <div className="flex items-center mt-1 text-xs text-red-600">
              <AlertCircle size={12} className="mr-1" />
              Blocked by {todo.blockedBy.length} task(s)
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <PriorityBadge priority={todo.priority} />
          <StatusDropdown 
            status={todo.status} 
            disabled={todo.blockedBy.length > 0}
            onChange={(status) => onUpdate(todo.id, { status })}
          />
        </div>
      </div>
    </div>
  );
}
```

**Comprehensive Worker Status Dashboard:**
```tsx
function WorkerStatusDashboard({ workers, currentUser }: { 
  workers: ScopedWorkerIdentity[]; 
  currentUser: ScopedWorkerIdentity 
}) {
  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header with total worker count */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            🤖 Live Workers ({workers.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-green-600">Real-time</span>
          </div>
        </div>
      </div>

      {/* Current user status */}
      <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-blue-900">You ({currentUser.name})</div>
            <div className="text-sm text-blue-700">
              {currentUser.currentProjectId ? '🚀 Working' : '💤 Idle'} • 
              {currentUser.capabilities.join(', ')}
            </div>
          </div>
          <WorkerStatusBadge worker={currentUser} isCurrentUser={true} />
        </div>
      </div>

      {/* Other workers */}
      <div className="divide-y divide-gray-100">
        {workers.filter(w => w.id !== currentUser.id).map(worker => (
          <WorkerStatusRow key={worker.id} worker={worker} />
        ))}
      </div>

      {/* No other workers message */}
      {workers.length === 1 && (
        <div className="px-6 py-8 text-center text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <div className="text-sm">You're the only active worker</div>
          <div className="text-xs text-gray-400 mt-1">
            Other Claude instances will appear here when they join
          </div>
        </div>
      )}
    </div>
  );
}

function WorkerStatusRow({ worker }: { worker: ScopedWorkerIdentity }) {
  const [lastActivity, setLastActivity] = useState(worker.lastSeen);
  const timeAgo = formatDistanceToNow(lastActivity);

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className="relative">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-gray-600" />
          </div>
          <ConnectionStatusDot isConnected={worker.isConnected} />
        </div>

        {/* Worker info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-gray-900 truncate">
              {worker.name}
            </div>
            <WorkerStatusBadge worker={worker} />
          </div>
          
          <div className="text-sm text-gray-500 mt-1">
            {worker.capabilities.join(' • ')}
          </div>
          
          {/* Current activity */}
          {worker.currentProjectId ? (
            <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Working on project
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-1">
              💤 Idle
            </div>
          )}
        </div>

        {/* Last seen */}
        <div className="text-right">
          <div className="text-xs text-gray-500">
            {worker.isConnected ? (
              <span className="text-green-600 font-medium">Online</span>
            ) : (
              <span>Last seen {timeAgo} ago</span>
            )}
          </div>
          {worker.heartbeatAt && (
            <div className="text-xs text-gray-400 mt-1">
              ♥️ {formatDistanceToNow(worker.heartbeatAt)} ago
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkerStatusBadge({ worker, isCurrentUser = false }: { 
  worker: ScopedWorkerIdentity; 
  isCurrentUser?: boolean 
}) {
  if (isCurrentUser) {
    return (
      <Badge className="bg-blue-100 text-blue-800 text-xs">
        You
      </Badge>
    );
  }

  if (!worker.isConnected) {
    return (
      <Badge variant="secondary" className="text-xs">
        Offline
      </Badge>
    );
  }

  if (worker.currentProjectId) {
    return (
      <Badge className="bg-green-100 text-green-800 text-xs">
        🚀 Working
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs">
      💤 Idle
    </Badge>
  );
}

function ConnectionStatusDot({ isConnected }: { isConnected: boolean }) {
  return (
    <div className={`
      absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white
      ${isConnected 
        ? 'bg-green-400 animate-pulse' 
        : 'bg-gray-400'
      }
    `} />
  );
}
```

**Dependency Graph Visualization:**
```tsx
function DependencyGraphVisualization({ graph }: { graph: DependencyGraphResult }) {
  return (
    <div className="bg-white rounded-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard
          title="Ready to Work" 
          count={graph.readyToWork.length}
          color="green"
          icon={<Play size={20} />}
        />
        <StatCard
          title="Blocked" 
          count={graph.blocked.length}
          color="red"
          icon={<Clock size={20} />}
        />
        <StatCard
          title="In Progress" 
          count={graph.nodes.filter(n => n.todo.status === 'in-progress').length}
          color="blue"
          icon={<Activity size={20} />}
        />
      </div>
      
      {/* Interactive graph visualization */}
      <DependencyGraphCanvas nodes={graph.nodes} />
      
      {/* Critical path display */}
      {graph.criticalPath.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium text-gray-900 mb-3">Critical Path</h4>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {graph.criticalPath.map((todo, index) => (
              <React.Fragment key={todo.id}>
                <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded text-sm whitespace-nowrap">
                  {todo.title}
                </div>
                {index < graph.criticalPath.length - 1 && (
                  <ArrowRight size={16} className="text-orange-600 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### **Phase 4: Live Updates & Real-time Features** ⏱️ ~2-3 hours

#### 4.1 WebSocket Event Handling
```typescript
// Real-time event types
interface LiveUpdateEvents {
  'todo:created': { todo: TodoItem; workerId: string };
  'todo:updated': { todo: TodoItem; workerId: string; changes: string[] };
  'todo:deleted': { todoId: string; workerId: string };
  'dependency:added': { todoId: string; dependsOnId: string; workerId: string };
  'worker:joined': { worker: ScopedWorkerIdentity };
  'worker:left': { workerId: string };
  'project:graph-changed': { projectId: string; graph: DependencyGraphResult };
}
```

#### 4.2 Optimistic Updates
```typescript
// hooks/useOptimisticTodos.ts
export function useOptimisticTodos(projectId: string) {
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, TodoItem>>(new Map());
  
  const updateTodoOptimistically = useCallback((id: string, updates: Partial<TodoItem>) => {
    setOptimisticUpdates(prev => new Map(prev.set(id, { ...prev.get(id), ...updates })));
    
    // Send actual update
    socket.emit('todo:update', { id, ...updates });
    
    // Clear optimistic update when real update arrives
    setTimeout(() => {
      setOptimisticUpdates(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
    }, 5000);
  }, [socket]);
  
  return { optimisticUpdates, updateTodoOptimistically };
}
```

#### 4.3 Live Activity Feed
```tsx
function LiveActivityFeed({ changes }: { changes: ChangeEvent[] }) {
  return (
    <div className="bg-white rounded-lg p-4 max-h-96 overflow-y-auto">
      <h3 className="font-medium text-gray-900 mb-3">Live Activity</h3>
      <div className="space-y-3">
        {changes.slice(0, 20).map(change => (
          <div key={change.id} className="flex items-start gap-3 text-sm">
            <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-gray-900">{change.reason}</div>
              <div className="text-gray-500 text-xs">
                by {change.workerId.split('-')[0]} • {formatDistanceToNow(change.timestamp)} ago
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### **Phase 5: Advanced Features** ⏱️ ~3-4 hours

#### 5.1 Interactive Dependency Graph
- Drag-and-drop to add dependencies
- Visual indicators for blocking relationships
- Zoom and pan functionality
- Real-time updates from other workers

#### 5.2 Smart Work Recommendations
```tsx
function WorkRecommendations({ projectId }: { projectId: string }) {
  const { data: availableWork } = useQuery(['available-work', projectId], 
    () => api.getAvailableWork(projectId)
  );
  
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
      <h3 className="font-medium text-gray-900 mb-3">🎯 Recommended for You</h3>
      {availableWork?.map(todo => (
        <RecommendedTodoCard 
          key={todo.id} 
          todo={todo} 
          onClaim={() => claimTodo(todo.id)}
        />
      ))}
    </div>
  );
}
```

#### 5.3 Conflict Resolution UI
```tsx
function ConflictResolutionModal({ conflicts }: { conflicts: ConflictEvent[] }) {
  return (
    <Modal>
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          ⚠️ Dependency Conflicts Detected
        </h3>
        {conflicts.map(conflict => (
          <ConflictCard 
            key={conflict.id}
            conflict={conflict}
            onResolve={handleResolveConflict}
          />
        ))}
      </div>
    </Modal>
  );
}
```

## 🚀 Deployment & Testing Strategy

### **Testing Plan**
```typescript
// __tests__/integration/multi-worker.test.ts
describe('Multi-worker collaboration', () => {
  it('should sync todo updates across workers in real-time', async () => {
    const worker1 = new TestWorker('worker-1');
    const worker2 = new TestWorker('worker-2');
    
    await worker1.updateTodo(todoId, { status: 'in-progress' });
    
    // Worker 2 should receive the update immediately
    await expect(worker2.waitForTodoUpdate(todoId)).resolves.toMatchObject({
      status: 'in-progress'
    });
  });
  
  it('should prevent dependency cycles across workers', async () => {
    const worker1 = new TestWorker('worker-1');
    const worker2 = new TestWorker('worker-2');
    
    await worker1.addDependency(todoA, todoB);
    
    // Worker 2 should not be able to create a cycle
    await expect(worker2.addDependency(todoB, todoA))
      .rejects.toThrow('cycle detected');
  });
});
```

### **Production Deployment**
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY src/web/frontend/dist/ ./public/

EXPOSE 3000
CMD ["node", "dist/web/backend/server.js"]
```

## 📊 Success Metrics

### **Performance Targets**
- ⚡ Page load time: < 2 seconds
- 🔄 Real-time update latency: < 100ms
- 📱 Mobile responsiveness: Perfect on all devices
- 🎯 Dependency graph rendering: < 500ms for 100+ todos

### **User Experience Goals**
- ✅ Zero-conflict concurrent editing
- ✅ Instant visual feedback for all actions
- ✅ Intuitive dependency management
- ✅ Clear worker status and activity visibility

## 🎯 Implementation Priority

**Must Have (Phase 1-3):**
1. ✅ React + Tailwind conversion
2. ✅ Basic real-time updates
3. ✅ Dependency graph integration
4. ✅ Multi-worker coordination

**Nice to Have (Phase 4-5):**
1. 🎨 Interactive graph visualization
2. 🤖 Smart work recommendations  
3. ⚡ Advanced conflict resolution
4. 📊 Analytics and insights

This plan provides a complete roadmap for upgrading the website to a modern, real-time collaborative todo management system with dependency graphs and multi-worker support!