# Concurrent Work Allocation Strategy

## Overview

This document outlines strategies for efficiently allocating work across multiple Claude instances while respecting dependencies and preventing conflicts.

## Work Allocation Algorithms

### 1. Greedy First-Available (Simple)

The simplest approach - each instance claims the first available todo it finds.

```typescript
async function allocateWork(sessionId: string, projectId: string): Promise<TodoItem | null> {
  const availableTodos = await findAvailableTodos(projectId);
  
  for (const todo of availableTodos) {
    try {
      await claimTodo(todo.id, sessionId);
      return todo;
    } catch (AlreadyClaimedError) {
      // Another instance got it first, try next
      continue;
    }
  }
  
  return null; // No work available
}
```

**Pros**: Simple, no coordination needed
**Cons**: May lead to suboptimal parallelization

### 2. Critical Path Optimization

Prioritize todos on the critical path to minimize total project completion time.

```typescript
interface TodoWithMetrics extends TodoItem {
  criticalPathLength: number;  // Longest path from this todo to end
  totalDescendants: number;     // Total number of dependent todos
  immediateBlockers: number;    // Number of todos directly blocked by this
}

async function allocateWorkCriticalPath(sessionId: string, projectId: string): Promise<TodoItem | null> {
  const availableTodos = await findAvailableTodosWithMetrics(projectId);
  
  // Sort by critical path length (longest first)
  availableTodos.sort((a, b) => b.criticalPathLength - a.criticalPathLength);
  
  for (const todo of availableTodos) {
    try {
      await claimTodo(todo.id, sessionId);
      return todo;
    } catch (AlreadyClaimedError) {
      continue;
    }
  }
  
  return null;
}
```

**Pros**: Minimizes total project time
**Cons**: Requires graph analysis, more complex

### 3. Load Balancing Strategy

Distribute work evenly across instances to maximize parallelization.

```typescript
interface WorkloadInfo {
  instanceId: string;
  activeTodos: number;
  estimatedWorkload: number; // Based on todo complexity
}

async function allocateWorkBalanced(sessionId: string, projectId: string): Promise<TodoItem | null> {
  const workloads = await getInstanceWorkloads(projectId);
  const myWorkload = workloads.find(w => w.instanceId === sessionId);
  const avgWorkload = workloads.reduce((sum, w) => sum + w.activeTodos, 0) / workloads.length;
  
  // If I'm above average workload, don't take more work
  if (myWorkload && myWorkload.activeTodos > avgWorkload + 1) {
    return null;
  }
  
  // Otherwise, use critical path strategy
  return allocateWorkCriticalPath(sessionId, projectId);
}
```

**Pros**: Better resource utilization
**Cons**: Requires instance coordination

### 4. Branch Affinity Strategy

Instances stick to related work branches to maintain context.

```typescript
interface BranchInfo {
  branchId: string;
  todos: string[];
  assignedInstance?: string;
}

async function allocateWorkWithAffinity(sessionId: string, projectId: string): Promise<TodoItem | null> {
  // First, try to find work in branches I'm already working on
  const myBranches = await getBranchesForInstance(sessionId, projectId);
  
  for (const branch of myBranches) {
    const availableInBranch = await findAvailableTodosInBranch(branch.branchId);
    if (availableInBranch.length > 0) {
      return claimTodo(availableInBranch[0].id, sessionId);
    }
  }
  
  // If no work in my branches, find an unclaimed branch
  const unclaimedBranches = await findUnclaimedBranches(projectId);
  if (unclaimedBranches.length > 0) {
    await claimBranch(unclaimedBranches[0].branchId, sessionId);
    return allocateWorkWithAffinity(sessionId, projectId); // Recurse
  }
  
  // Otherwise, fall back to any available work
  return allocateWorkCriticalPath(sessionId, projectId);
}
```

**Pros**: Better context preservation, fewer context switches
**Cons**: May lead to idle instances if branches are uneven

## Coordination Mechanisms

### 1. Optimistic Locking (Recommended)

No central coordinator - instances try to claim work and handle conflicts.

```typescript
async function claimTodo(todoId: string, sessionId: string): Promise<void> {
  const todo = await getTodo(todoId);
  
  if (todo.lockedBy && todo.lockedBy !== sessionId) {
    throw new AlreadyClaimedError();
  }
  
  if (todo.status !== 'ready') {
    throw new NotReadyError();
  }
  
  // Atomic update with condition
  const updated = await storage.updateTodoIfUnchanged(todoId, {
    lockedBy: sessionId,
    lockedAt: new Date(),
    status: 'in-progress'
  }, todo.version);
  
  if (!updated) {
    throw new AlreadyClaimedError();
  }
}
```

### 2. Work Queue Pattern

Central queue of available work that instances pull from.

```typescript
class WorkQueue {
  private queue: PriorityQueue<TodoItem>;
  
  async getNextWork(sessionId: string): Promise<TodoItem | null> {
    while (!this.queue.isEmpty()) {
      const todo = this.queue.pop();
      
      try {
        await claimTodo(todo.id, sessionId);
        return todo;
      } catch (AlreadyClaimedError) {
        // Someone else got it, try next
        continue;
      }
    }
    
    return null;
  }
  
  async refreshQueue(projectId: string): Promise<void> {
    const availableTodos = await findAvailableTodos(projectId);
    this.queue = new PriorityQueue(availableTodos, this.priorityFunction);
  }
}
```

### 3. Leader Election Pattern

One instance acts as coordinator, assigning work to others.

```typescript
interface WorkAssignment {
  instanceId: string;
  todoId: string;
  assignedAt: Date;
}

class WorkCoordinator {
  private isLeader: boolean = false;
  private assignments: Map<string, WorkAssignment> = new Map();
  
  async coordinateWork(projectId: string): Promise<void> {
    if (!this.isLeader) {
      return;
    }
    
    const instances = await getActiveInstances(projectId);
    const availableTodos = await findAvailableTodos(projectId);
    
    // Assign work to instances
    for (const instance of instances) {
      if (!this.hasActiveWork(instance.id)) {
        const todo = this.selectBestTodoFor(instance, availableTodos);
        if (todo) {
          await this.assignWork(instance.id, todo.id);
        }
      }
    }
  }
}
```

## Instance Lifecycle Management

### 1. Instance Registration

```typescript
interface InstanceRegistration {
  async register(projectId: string): Promise<string> {
    const instanceId = generateInstanceId();
    const session: WorkSession = {
      instanceId,
      projectId,
      activeTodos: [],
      createdAt: new Date(),
      lastHeartbeat: new Date()
    };
    
    await storage.createWorkSession(session);
    return instanceId;
  }
  
  async unregister(instanceId: string): Promise<void> {
    // Release all locks held by this instance
    await releaseAllLocks(instanceId);
    await storage.deleteWorkSession(instanceId);
  }
}
```

### 2. Heartbeat and Failure Detection

```typescript
class HeartbeatManager {
  private readonly HEARTBEAT_INTERVAL = 60000; // 1 minute
  private readonly TIMEOUT_THRESHOLD = 300000; // 5 minutes
  
  async sendHeartbeat(sessionId: string): Promise<void> {
    await storage.updateHeartbeat(sessionId, new Date());
  }
  
  async detectFailedInstances(): Promise<string[]> {
    const sessions = await storage.getAllSessions();
    const now = new Date();
    const failed: string[] = [];
    
    for (const session of sessions) {
      const timeSinceHeartbeat = now.getTime() - session.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > this.TIMEOUT_THRESHOLD) {
        failed.push(session.instanceId);
      }
    }
    
    return failed;
  }
  
  async handleFailedInstance(instanceId: string): Promise<void> {
    // Release all locks
    const todos = await storage.getTodosByLock(instanceId);
    for (const todo of todos) {
      await storage.updateTodo(todo.id, {
        lockedBy: null,
        lockedAt: null,
        status: todo.status === 'in-progress' ? 'ready' : todo.status
      });
    }
    
    // Remove session
    await storage.deleteWorkSession(instanceId);
  }
}
```

## Performance Optimization

### 1. Batch Operations

```typescript
async function allocateMultipleWork(sessionId: string, projectId: string, count: number): Promise<TodoItem[]> {
  const availableTodos = await findAvailableTodos(projectId);
  const claimed: TodoItem[] = [];
  
  // Try to claim multiple todos in one operation
  const toClaim = availableTodos.slice(0, count);
  const results = await storage.batchClaimTodos(toClaim.map(t => t.id), sessionId);
  
  return results.filter(r => r.success).map(r => r.todo);
}
```

### 2. Caching and Memoization

```typescript
class DependencyGraphCache {
  private cache: Map<string, CachedGraph> = new Map();
  private readonly TTL = 60000; // 1 minute
  
  async getCriticalPath(projectId: string): Promise<CriticalPathInfo> {
    const cached = this.cache.get(projectId);
    
    if (cached && cached.timestamp > Date.now() - this.TTL) {
      return cached.criticalPath;
    }
    
    const graph = await buildDependencyGraph(projectId);
    const criticalPath = calculateCriticalPath(graph);
    
    this.cache.set(projectId, {
      graph,
      criticalPath,
      timestamp: Date.now()
    });
    
    return criticalPath;
  }
}
```

### 3. Work Prediction

```typescript
class WorkPredictor {
  async predictNextWork(sessionId: string, projectId: string): Promise<TodoItem[]> {
    const currentWork = await getCurrentWork(sessionId);
    const predictions: TodoItem[] = [];
    
    // Predict what will become available when current work completes
    for (const todo of currentWork) {
      const dependents = await getDependents(todo.id);
      
      for (const dependent of dependents) {
        const otherDeps = await getDependencies(dependent.id);
        const allOthersComplete = otherDeps
          .filter(d => d.id !== todo.id)
          .every(d => d.status === 'completed');
        
        if (allOthersComplete) {
          predictions.push(dependent);
        }
      }
    }
    
    return predictions;
  }
}
```

## Monitoring and Metrics

### Key Metrics to Track

1. **Parallelization Efficiency**
   ```
   efficiency = (active_todos / total_instances) / max_possible_parallel_todos
   ```

2. **Lock Contention Rate**
   ```
   contention_rate = failed_claims / total_claim_attempts
   ```

3. **Instance Utilization**
   ```
   utilization = time_working / total_time_active
   ```

4. **Critical Path Progress**
   ```
   progress = completed_critical_path_todos / total_critical_path_todos
   ```

### Monitoring Implementation

```typescript
interface WorkMetrics {
  instanceId: string;
  projectId: string;
  todosCompleted: number;
  todosFailed: number;
  claimAttempts: number;
  claimFailures: number;
  activeTime: number;
  idleTime: number;
}

class MetricsCollector {
  async collectMetrics(sessionId: string): Promise<WorkMetrics> {
    // Implementation details...
  }
  
  async reportMetrics(metrics: WorkMetrics): Promise<void> {
    // Send to monitoring system
  }
}
```

## Recommended Implementation Path

1. **Phase 1**: Implement optimistic locking with greedy allocation
2. **Phase 2**: Add critical path optimization
3. **Phase 3**: Implement heartbeat and failure detection
4. **Phase 4**: Add branch affinity for better context preservation
5. **Phase 5**: Implement monitoring and auto-tuning

This approach starts simple and adds sophistication based on actual usage patterns and needs.