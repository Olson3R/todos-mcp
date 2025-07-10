#!/usr/bin/env node

import { TodoItem, Project } from '../types.js';

// The TodoItem interface now includes dependency fields by default
export type DependencyTodo = TodoItem;

export type DependencyStatus = 
  | 'pending'       // Not started, no dependencies or all dependencies complete
  | 'blocked'       // Cannot start, has incomplete dependencies
  | 'ready'         // All dependencies complete, available to work on
  | 'in-progress'   // Currently being worked on
  | 'completed'     // Finished
  | 'failed';       // Failed, may block dependents

export interface WorkSession {
  instanceId: string;
  projectId: string;
  activeTodos: string[];
  createdAt: Date;
  lastHeartbeat: Date;
}

// Dependency graph analysis
export class DependencyGraph {
  private todos: Map<string, DependencyTodo>;
  
  constructor(todos: DependencyTodo[]) {
    this.todos = new Map(todos.map(t => [t.id, t]));
  }
  
  // Check if adding a dependency would create a cycle
  wouldCreateCycle(todoId: string, newDependencyId: string): boolean {
    const visited = new Set<string>();
    
    const hasCycle = (currentId: string): boolean => {
      if (currentId === todoId) return true;
      if (visited.has(currentId)) return false;
      
      visited.add(currentId);
      const todo = this.todos.get(currentId);
      if (!todo) return false;
      
      return todo.dependencies.some(depId => hasCycle(depId));
    };
    
    return hasCycle(newDependencyId);
  }
  
  // Get all todos that would be affected if this todo's status changes
  getAffectedTodos(todoId: string): Set<string> {
    const affected = new Set<string>();
    const todo = this.todos.get(todoId);
    if (!todo) return affected;
    
    // BFS to find all dependents
    const queue = [...todo.dependents];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (affected.has(currentId)) continue;
      
      affected.add(currentId);
      const current = this.todos.get(currentId);
      if (current) {
        queue.push(...current.dependents);
      }
    }
    
    return affected;
  }
  
  // Calculate the status of a todo based on its dependencies
  calculateStatus(todoId: string): DependencyStatus {
    const todo = this.todos.get(todoId);
    if (!todo) throw new Error(`Todo ${todoId} not found`);
    
    // Already completed or failed
    if ((todo.status as string) === 'completed' || (todo.status as string) === 'failed') {
      return todo.status as DependencyStatus;
    }
    
    // Currently being worked on
    if (todo.lockedBy && todo.status === 'in-progress') {
      return 'in-progress';
    }
    
    // Check dependencies
    if (todo.dependencies.length === 0) {
      return 'ready';
    }
    
    const deps = todo.dependencies.map(id => this.todos.get(id));
    const hasBlockedDep = deps.some(dep => !dep || dep.status !== 'completed');
    
    return hasBlockedDep ? 'blocked' : 'ready';
  }
  
  // Find the critical path (longest path) from this todo
  getCriticalPathLength(todoId: string): number {
    const memo = new Map<string, number>();
    
    const getLength = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      
      const todo = this.todos.get(id);
      if (!todo || todo.dependents.length === 0) {
        memo.set(id, 1);
        return 1;
      }
      
      const maxDepLength = Math.max(
        ...todo.dependents.map(depId => getLength(depId))
      );
      
      const length = 1 + maxDepLength;
      memo.set(id, length);
      return length;
    };
    
    return getLength(todoId);
  }
  
  // Get all todos that are ready to work on
  getReadyTodos(): DependencyTodo[] {
    return Array.from(this.todos.values())
      .filter(todo => this.calculateStatus(todo.id) === 'ready');
  }
  
  // Topological sort of todos
  topologicalSort(): DependencyTodo[] {
    const sorted: DependencyTodo[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error('Circular dependency detected');
      }
      
      visiting.add(id);
      const todo = this.todos.get(id);
      if (todo) {
        todo.dependencies.forEach(depId => visit(depId));
        sorted.push(todo);
      }
      visiting.delete(id);
      visited.add(id);
    };
    
    this.todos.forEach((_, id) => visit(id));
    return sorted;
  }
  
  // Generate visualization in DOT format
  toDot(): string {
    const lines = ['digraph TodoDependencies {'];
    lines.push('  rankdir=TB;');
    lines.push('  node [shape=box];');
    
    // Add nodes with status-based styling
    this.todos.forEach(todo => {
      const status = this.calculateStatus(todo.id);
      let style = '';
      
      switch (status) {
        case 'completed':
          style = 'style=filled,fillcolor=green';
          break;
        case 'in-progress':
          style = 'style=filled,fillcolor=yellow';
          break;
        case 'ready':
          style = 'style=filled,fillcolor=lightblue';
          break;
        case 'blocked':
          style = 'style=filled,fillcolor=lightgray';
          break;
        case 'failed':
          style = 'style=filled,fillcolor=red';
          break;
      }
      
      lines.push(`  "${todo.id}" [label="${todo.title}\\n(${status})",${style}];`);
    });
    
    // Add edges
    this.todos.forEach(todo => {
      todo.dependencies.forEach(depId => {
        lines.push(`  "${depId}" -> "${todo.id}";`);
      });
    });
    
    lines.push('}');
    return lines.join('\n');
  }
}

// Work allocation manager
export class WorkAllocator {
  private sessions: Map<string, WorkSession> = new Map();
  private readonly HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  async createSession(instanceId: string, projectId: string): Promise<WorkSession> {
    const session: WorkSession = {
      instanceId,
      projectId,
      activeTodos: [],
      createdAt: new Date(),
      lastHeartbeat: new Date()
    };
    
    this.sessions.set(instanceId, session);
    return session;
  }
  
  async heartbeat(instanceId: string): Promise<void> {
    const session = this.sessions.get(instanceId);
    if (session) {
      session.lastHeartbeat = new Date();
    }
  }
  
  async claimTodo(
    todoId: string, 
    instanceId: string, 
    graph: DependencyGraph
  ): Promise<boolean> {
    const session = this.sessions.get(instanceId);
    if (!session) return false;
    
    // Check if todo is ready
    const todos = Array.from(graph['todos'].values()) as DependencyTodo[];
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return false;
    
    const status = graph.calculateStatus(todoId);
    if (status !== 'ready') return false;
    
    // Check if already locked
    if (todo.lockedBy && todo.lockedBy !== instanceId) {
      const lockSession = this.sessions.get(todo.lockedBy);
      if (lockSession && this.isSessionActive(lockSession)) {
        return false; // Still locked by active session
      }
    }
    
    // Claim the todo
    todo.lockedBy = instanceId;
    todo.lockedAt = new Date();
    todo.status = 'in-progress';
    session.activeTodos.push(todoId);
    
    return true;
  }
  
  async releaseTodo(todoId: string, instanceId: string): Promise<void> {
    const session = this.sessions.get(instanceId);
    if (!session) return;
    
    session.activeTodos = session.activeTodos.filter(id => id !== todoId);
    // Note: actual todo unlocking would happen in the storage layer
  }
  
  private isSessionActive(session: WorkSession): boolean {
    const now = new Date().getTime();
    const lastBeat = session.lastHeartbeat.getTime();
    return (now - lastBeat) < this.HEARTBEAT_TIMEOUT;
  }
  
  async cleanupStaleSessions(graph: DependencyGraph): Promise<void> {
    const now = new Date().getTime();
    const todos = Array.from(graph['todos'].values()) as DependencyTodo[];
    
    for (const [instanceId, session] of this.sessions) {
      if (!this.isSessionActive(session)) {
        // Release all todos held by this session
        session.activeTodos.forEach(todoId => {
          const todo = todos.find(t => t.id === todoId);
          if (todo && todo.lockedBy === instanceId) {
            todo.lockedBy = undefined;
            todo.lockedAt = undefined;
            if (todo.status === 'in-progress') {
              todo.status = 'pending';
            }
          }
        });
        
        this.sessions.delete(instanceId);
      }
    }
  }
}

// Example usage
if (require.main === module) {
  // Create sample todos with dependencies
  const todos: DependencyTodo[] = [
    {
      id: '1',
      title: 'Design API',
      status: 'completed',
      dependsOn: [],
      dependents: ['2'],
      blockedBy: [],
      priority: 'high',
      createdAt: new Date(),
      updatedAt: new Date(),
      order: 1
    },
    {
      id: '2',
      title: 'Implement API',
      status: 'in-progress',
      dependsOn: ['1'],
      dependents: ['3', '4'],
      blockedBy: [],
      priority: 'high',
      createdAt: new Date(),
      updatedAt: new Date(),
      order: 2
    },
    {
      id: '3',
      title: 'Write API Tests',
      status: 'pending',
      dependsOn: ['2'],
      dependents: ['5'],
      blockedBy: ['2'],
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date(),
      order: 3
    },
    {
      id: '4',
      title: 'Write API Docs',
      status: 'pending',
      dependsOn: ['2'],
      dependents: ['5'],
      blockedBy: ['2'],
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date(),
      order: 4
    },
    {
      id: '5',
      title: 'Deploy',
      status: 'pending',
      dependsOn: ['3', '4'],
      dependents: [],
      blockedBy: ['3', '4'],
      priority: 'critical',
      createdAt: new Date(),
      updatedAt: new Date(),
      order: 5
    }
  ];
  
  const graph = new DependencyGraph(todos);
  
  console.log('Ready todos:', graph.getReadyTodos().map(t => t.title));
  console.log('\nDependency graph visualization:');
  console.log(graph.toDot());
  
  console.log('\nCritical path lengths:');
  todos.forEach(todo => {
    console.log(`${todo.title}: ${graph.getCriticalPathLength(todo.id)}`);
  });
}