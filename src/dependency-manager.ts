import { TodoItem, DependencyGraphNode, DependencyGraphResult, WorkAllocationResult } from './types.js';
import { ValidationError } from './validation.js';

export class DependencyManager {
  /**
   * Validates that adding a dependency won't create a cycle
   */
  validateDependency(todos: TodoItem[], todoId: string, dependsOnId: string): void {
    if (todoId === dependsOnId) {
      throw new ValidationError('A todo cannot depend on itself');
    }

    const todo = todos.find(t => t.id === todoId);
    const dependsOnTodo = todos.find(t => t.id === dependsOnId);

    if (!todo) {
      throw new ValidationError(`Todo with ID ${todoId} not found`);
    }

    if (!dependsOnTodo) {
      throw new ValidationError(`Dependency todo with ID ${dependsOnId} not found`);
    }

    // Check if dependency already exists
    if (todo.dependsOn.includes(dependsOnId)) {
      throw new ValidationError('Dependency already exists');
    }

    // Check for cycles by temporarily adding the dependency and testing
    const testTodos = todos.map(t => 
      t.id === todoId 
        ? { ...t, dependsOn: [...t.dependsOn, dependsOnId] }
        : t
    );

    const cycles = this.detectCycles(testTodos);
    if (cycles.length > 0) {
      throw new ValidationError(`Adding this dependency would create a cycle: ${cycles[0].join(' -> ')}`);
    }
  }

  /**
   * Detects cycles in the dependency graph using DFS
   */
  detectCycles(todos: TodoItem[]): string[][] {
    const todoMap = new Map(todos.map(t => [t.id, t]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (todoId: string, path: string[]): void => {
      if (recursionStack.has(todoId)) {
        // Found a cycle
        const cycleStart = path.indexOf(todoId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), todoId]);
        }
        return;
      }

      if (visited.has(todoId)) {
        return;
      }

      visited.add(todoId);
      recursionStack.add(todoId);
      path.push(todoId);

      const todo = todoMap.get(todoId);
      if (todo) {
        for (const depId of todo.dependsOn) {
          dfs(depId, [...path]);
        }
      }

      recursionStack.delete(todoId);
    };

    for (const todo of todos) {
      if (!visited.has(todo.id)) {
        dfs(todo.id, []);
      }
    }

    return cycles;
  }

  /**
   * Builds the complete dependency graph for a project
   */
  buildDependencyGraph(todos: TodoItem[]): DependencyGraphResult {
    const todoMap = new Map(todos.map(t => [t.id, t]));
    
    // First, compute dependents for each todo
    const dependentsMap = new Map<string, string[]>();
    for (const todo of todos) {
      dependentsMap.set(todo.id, []);
    }

    for (const todo of todos) {
      for (const depId of todo.dependsOn) {
        const dependents = dependentsMap.get(depId) || [];
        dependents.push(todo.id);
        dependentsMap.set(depId, dependents);
      }
    }

    // Update todos with computed fields
    const updatedTodos = todos.map(todo => {
      const dependents = dependentsMap.get(todo.id) || [];
      const blockedBy = todo.dependsOn.filter(depId => {
        const dep = todoMap.get(depId);
        return dep && dep.status !== 'completed';
      });

      return {
        ...todo,
        dependents,
        blockedBy
      };
    });

    // Calculate depth (longest path to a leaf node)
    const depthMap = new Map<string, number>();
    
    const calculateDepth = (todoId: string, visited = new Set<string>()): number => {
      if (visited.has(todoId)) return 0; // Cycle protection
      if (depthMap.has(todoId)) return depthMap.get(todoId)!;

      visited.add(todoId);
      const todo = todoMap.get(todoId);
      if (!todo) return 0;

      let maxDepth = 0;
      for (const depId of todo.dependsOn) {
        maxDepth = Math.max(maxDepth, calculateDepth(depId, new Set(visited)));
      }

      const depth = maxDepth + 1;
      depthMap.set(todoId, depth);
      return depth;
    };

    // Build graph nodes
    const nodes: DependencyGraphNode[] = updatedTodos.map(todo => {
      const dependencies = todo.dependsOn
        .map(id => todoMap.get(id))
        .filter((t): t is TodoItem => t !== undefined);
      
      const dependentTodos = (dependentsMap.get(todo.id) || [])
        .map(id => todoMap.get(id))
        .filter((t): t is TodoItem => t !== undefined);

      const isBlocked = todo.blockedBy.length > 0;
      const canStart = !isBlocked && todo.status === 'pending';
      const depth = calculateDepth(todo.id);

      return {
        todo: { ...todo, dependents: dependentsMap.get(todo.id) || [], blockedBy: todo.blockedBy },
        dependencies,
        dependents: dependentTodos,
        isBlocked,
        canStart,
        depth
      };
    });

    // Categorize todos
    const readyToWork = nodes
      .filter(node => node.canStart)
      .map(node => node.todo);

    const blocked = nodes
      .filter(node => node.isBlocked)
      .map(node => node.todo);

    // Detect cycles
    const cycles = this.detectCycles(updatedTodos);

    // Calculate critical path (longest path through the graph)
    const criticalPath = this.calculateCriticalPath(nodes);

    return {
      nodes,
      readyToWork,
      blocked,
      cycles,
      criticalPath
    };
  }

  /**
   * Calculates the critical path (longest path) through the dependency graph
   */
  private calculateCriticalPath(nodes: DependencyGraphNode[]): TodoItem[] {
    // Find the path with maximum total estimated duration
    const nodeMap = new Map(nodes.map(n => [n.todo.id, n]));
    let longestPath: TodoItem[] = [];
    let maxDuration = 0;

    const findLongestPath = (nodeId: string, currentPath: TodoItem[], currentDuration: number, visited = new Set<string>()): void => {
      if (visited.has(nodeId)) return; // Cycle protection

      const node = nodeMap.get(nodeId);
      if (!node) return;

      visited.add(nodeId);
      const newPath = [...currentPath, node.todo];
      const newDuration = currentDuration + (node.todo.estimatedDuration || 0);

      // If this node has no dependents, it's a potential end of critical path
      if (node.todo.dependents.length === 0) {
        if (newDuration > maxDuration) {
          maxDuration = newDuration;
          longestPath = [...newPath];
        }
      } else {
        // Continue exploring dependents
        for (const depId of node.todo.dependents) {
          findLongestPath(depId, newPath, newDuration, new Set(visited));
        }
      }
    };

    // Start from todos with no dependencies
    const rootNodes = nodes.filter(n => n.todo.dependsOn.length === 0);
    for (const root of rootNodes) {
      findLongestPath(root.todo.id, [], 0);
    }

    return longestPath;
  }

  /**
   * Allocates work among multiple workers based on dependencies and worker capabilities
   */
  allocateWork(
    todos: TodoItem[], 
    workers: Array<{ id: string; capabilities: string[]; maxConcurrentTodos?: number }>
  ): WorkAllocationResult {
    const graph = this.buildDependencyGraph(todos);
    const assignments: { workerId: string; todos: TodoItem[] }[] = workers.map(w => ({
      workerId: w.id,
      todos: []
    }));
    
    const conflicts: { todoId: string; reason: string }[] = [];
    const unassignedTodos: TodoItem[] = [];

    // Sort ready todos by priority and depth (critical path first)
    const readyTodos = [...graph.readyToWork].sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      // For same priority, prefer todos on critical path
      const aOnCriticalPath = graph.criticalPath.some(t => t.id === a.id);
      const bOnCriticalPath = graph.criticalPath.some(t => t.id === b.id);
      
      if (aOnCriticalPath && !bOnCriticalPath) return -1;
      if (!aOnCriticalPath && bOnCriticalPath) return 1;

      // Finally sort by depth (deeper first to maintain dependency order)
      const aNode = graph.nodes.find(n => n.todo.id === a.id);
      const bNode = graph.nodes.find(n => n.todo.id === b.id);
      return (bNode?.depth || 0) - (aNode?.depth || 0);
    });

    // Simple round-robin assignment for now
    let workerIndex = 0;
    for (const todo of readyTodos) {
      const worker = workers[workerIndex];
      const assignment = assignments[workerIndex];
      
      const maxConcurrent = worker.maxConcurrentTodos || 3;
      if (assignment.todos.length >= maxConcurrent) {
        conflicts.push({
          todoId: todo.id,
          reason: `Worker ${worker.id} at capacity (${maxConcurrent} todos)`
        });
        unassignedTodos.push(todo);
      } else {
        assignment.todos.push(todo);
      }

      workerIndex = (workerIndex + 1) % workers.length;
    }

    // Add blocked todos to unassigned
    unassignedTodos.push(...graph.blocked);

    return {
      assignedTodos: assignments.filter(a => a.todos.length > 0),
      unassignedTodos,
      conflicts
    };
  }

  /**
   * Updates dependency relationships when adding a new dependency
   */
  addDependency(todos: TodoItem[], todoId: string, dependsOnId: string): TodoItem[] {
    this.validateDependency(todos, todoId, dependsOnId);

    return todos.map(todo => {
      if (todo.id === todoId) {
        return {
          ...todo,
          dependsOn: [...todo.dependsOn, dependsOnId],
          updatedAt: new Date()
        };
      }
      return todo;
    });
  }

  /**
   * Updates dependency relationships when removing a dependency
   */
  removeDependency(todos: TodoItem[], todoId: string, dependsOnId: string): TodoItem[] {
    return todos.map(todo => {
      if (todo.id === todoId) {
        return {
          ...todo,
          dependsOn: todo.dependsOn.filter(id => id !== dependsOnId),
          updatedAt: new Date()
        };
      }
      return todo;
    });
  }

  /**
   * Gets todos that can be started by a specific worker
   */
  getAvailableWorkForWorker(
    todos: TodoItem[], 
    workerId: string, 
    workerCapabilities: string[] = []
  ): TodoItem[] {
    const graph = this.buildDependencyGraph(todos);
    
    // For now, return all ready todos (capability matching can be added later)
    return graph.readyToWork.filter(todo => {
      // Add capability-based filtering here if needed
      return true;
    });
  }

  /**
   * Validates that a todo can be moved to in-progress status
   */
  canStartTodo(todos: TodoItem[], todoId: string): { canStart: boolean; reason?: string } {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) {
      return { canStart: false, reason: 'Todo not found' };
    }

    if (todo.status !== 'pending') {
      return { canStart: false, reason: `Todo is already ${todo.status}` };
    }

    // Check if dependencies are completed
    const uncompletedDeps = todo.dependsOn.filter(depId => {
      const dep = todos.find(t => t.id === depId);
      return dep && dep.status !== 'completed';
    });

    if (uncompletedDeps.length > 0) {
      return { 
        canStart: false, 
        reason: `Blocked by ${uncompletedDeps.length} uncompleted dependencies` 
      };
    }

    return { canStart: true };
  }
}