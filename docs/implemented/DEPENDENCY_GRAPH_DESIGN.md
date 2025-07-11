# Todo Dependency Graph Design

## Overview

This design document outlines the implementation of dependency graphs for todos, enabling multiple Claude instances to work on different branches of todos concurrently while respecting dependencies.

## Goals

1. **Enable parallel work**: Multiple Claude instances can work on independent todo branches
2. **Respect dependencies**: Ensure todos are only workable when their dependencies are complete
3. **Prevent conflicts**: Implement locking to prevent concurrent modification of the same todo
4. **Maintain simplicity**: Keep the API intuitive while adding powerful dependency features

## Data Model Changes

### Updated TodoItem Interface

```typescript
interface TodoItem {
  // Existing fields
  id: string;
  title: string;
  description?: string;
  status: TodoStatus; // Extended enum (see below)
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  
  // New dependency fields
  dependencies: string[];      // Array of todo IDs this todo depends on
  dependents: string[];        // Array of todo IDs that depend on this todo
  lockedBy?: string;          // Instance ID of Claude instance working on this
  lockedAt?: Date;            // When the todo was locked
  completedBy?: string;       // Instance ID that completed this todo
}
```

### Extended TodoStatus Enum

```typescript
type TodoStatus = 
  | 'pending'       // Not started, no dependencies or all dependencies complete
  | 'blocked'       // Cannot start, has incomplete dependencies
  | 'ready'         // All dependencies complete, available to work on
  | 'in-progress'   // Currently being worked on
  | 'completed'     // Finished
  | 'failed';       // Failed, may block dependents
```

### New WorkSession Interface

```typescript
interface WorkSession {
  instanceId: string;      // Unique ID for each Claude instance
  projectId: string;       // Project being worked on
  activeTodos: string[];   // Todo IDs currently being worked on
  createdAt: Date;
  lastHeartbeat: Date;     // For detecting stale locks
}
```

## Dependency Rules

### 1. Dependency Validation Rules

- **No circular dependencies**: A → B → C → A is invalid
- **Dependencies must exist**: All todo IDs in dependencies array must exist
- **Same project only**: Dependencies must be within the same project
- **Cannot depend on self**: A todo cannot list itself as a dependency

### 2. Status Transition Rules

```
pending/blocked → ready: When all dependencies are completed
ready → in-progress: When a Claude instance claims the todo
in-progress → completed/failed: When work finishes
completed/failed → (no further transitions)
blocked ↔ pending: As dependencies change
```

### 3. Concurrent Work Rules

- Multiple todos can be `in-progress` if they have no shared dependencies
- A todo can only be claimed if status is `ready`
- Locks expire after 30 minutes of inactivity (no heartbeat)
- Only the instance that locked a todo can update it

## New MCP Tools

### Dependency Management Tools

```typescript
// 1. Add dependencies to a todo
add_todo_dependencies: {
  todoId: string;
  dependencyIds: string[];
}

// 2. Remove dependencies from a todo
remove_todo_dependencies: {
  todoId: string;
  dependencyIds: string[];
}

// 3. Get dependency graph for a project
get_dependency_graph: {
  projectId: string;
  format?: 'tree' | 'flat' | 'graphviz';
}

// 4. Find available todos (ready status)
find_available_todos: {
  projectId: string;
  maxResults?: number;
}
```

### Work Session Tools

```typescript
// 5. Start a work session
start_work_session: {
  projectId: string;
  instanceId?: string; // Auto-generated if not provided
}

// 6. Claim a todo for work
claim_todo: {
  todoId: string;
  sessionId: string;
}

// 7. Release a todo (unlock without completing)
release_todo: {
  todoId: string;
  sessionId: string;
}

// 8. Heartbeat to maintain locks
heartbeat: {
  sessionId: string;
}

// 9. End work session (releases all locks)
end_work_session: {
  sessionId: string;
}
```

## Implementation Strategy

### Phase 1: Core Dependency Support
1. Update TodoItem type with dependency fields
2. Add dependency validation logic
3. Implement status transition logic based on dependencies
4. Update existing create/update tools to handle dependencies

### Phase 2: Concurrent Work Support
1. Implement WorkSession management
2. Add locking mechanism with heartbeat
3. Create work session tools
4. Update status constraints to allow multiple in-progress todos

### Phase 3: Visualization and Optimization
1. Implement dependency graph visualization
2. Add topological sorting for optimal work order
3. Create tools for finding available work
4. Add cycle detection and prevention

## Example Workflows

### Workflow 1: Setting up Dependencies

```javascript
// Create todos with dependencies
create_todo({ title: "Design API", projectId: "proj1" }) // Returns todo1
create_todo({ title: "Implement API", projectId: "proj1" }) // Returns todo2
create_todo({ title: "Write tests", projectId: "proj1" }) // Returns todo3
create_todo({ title: "Deploy", projectId: "proj1" }) // Returns todo4

// Set up dependencies: Deploy depends on tests, tests depend on implementation, implementation depends on design
add_todo_dependencies({ todoId: "todo2", dependencyIds: ["todo1"] })
add_todo_dependencies({ todoId: "todo3", dependencyIds: ["todo2"] })
add_todo_dependencies({ todoId: "todo4", dependencyIds: ["todo3"] })
```

### Workflow 2: Multiple Claude Instances Working

```javascript
// Claude Instance 1
start_work_session({ projectId: "proj1" }) // Returns session1
find_available_todos({ projectId: "proj1" }) // Returns [todo1] (only one ready)
claim_todo({ todoId: "todo1", sessionId: "session1" })
// Works on todo1...
update_todo({ id: "todo1", status: "completed" })

// Claude Instance 2 (concurrently)
start_work_session({ projectId: "proj1" }) // Returns session2
find_available_todos({ projectId: "proj1" }) // Returns [todo2] (now ready since todo1 complete)
claim_todo({ todoId: "todo2", sessionId: "session2" })
// Works on todo2...
```

### Workflow 3: Parallel Branches

```javascript
// Setup: Two independent branches that merge
// Branch A: todo1 → todo2 → todo4
// Branch B: todo3 → todo4
// Todo4 depends on both branches

create_todo({ title: "Frontend setup", projectId: "proj1" }) // todo1
create_todo({ title: "Frontend implementation", projectId: "proj1" }) // todo2
create_todo({ title: "Backend setup", projectId: "proj1" }) // todo3
create_todo({ title: "Integration", projectId: "proj1" }) // todo4

add_todo_dependencies({ todoId: "todo2", dependencyIds: ["todo1"] })
add_todo_dependencies({ todoId: "todo4", dependencyIds: ["todo2", "todo3"] })

// Now Claude instances can work on todo1 and todo3 in parallel
```

## Visualization Example

```
Project: Web Application
├─ [ready] Design API (todo1)
│  └─ [blocked] Implement API (todo2)
│     └─ [blocked] Write API tests (todo3)
│        └─ [blocked] Deploy API (todo4)
├─ [ready] Design UI (todo5)
│  └─ [blocked] Implement UI (todo6)
└─ [blocked] Integration (todo7) [depends on: todo4, todo6]
```

## Benefits

1. **Increased Throughput**: Multiple Claude instances can work in parallel
2. **Clear Work Structure**: Dependencies make task order explicit
3. **Automatic Coordination**: System prevents working on blocked tasks
4. **Flexibility**: Can model complex workflows with branching and merging
5. **Failure Handling**: Failed todos can block dependents, preventing cascade failures

## Considerations

1. **Complexity**: More complex than current linear approach
2. **Lock Management**: Need to handle stale locks and instance failures
3. **UI Updates**: Web interface needs dependency visualization
4. **Migration**: Existing todos need migration strategy
5. **Performance**: Large dependency graphs may need optimization