# Todo Dependency Graph Implementation Summary

## Overview

This document summarizes the design for adding dependency graph support to todos-mcp, enabling multiple Claude instances to work concurrently on independent branches of work.

## Key Features

### 1. Dependency Management
- Todos can declare dependencies on other todos
- Automatic status calculation (blocked → ready → in-progress → completed)
- Cycle detection prevents circular dependencies
- Dependencies limited to same project scope

### 2. Concurrent Work Support
- Multiple todos can be in-progress simultaneously (removes single in-progress constraint)
- Instance-based locking prevents conflicts
- Heartbeat mechanism handles instance failures
- Work allocation based on critical path optimization

### 3. New MCP Tools
- `add_todo_dependencies` - Add dependencies between todos
- `remove_todo_dependencies` - Remove dependencies
- `get_dependency_graph` - Visualize project dependencies
- `find_available_todos` - Get todos ready to work on
- `claim_todo` - Lock a todo for work
- `release_todo` - Unlock without completing

## Implementation Phases

### Phase 1: Core Dependency Support (Week 1-2)
1. Extend TodoItem type with dependency fields
2. Update storage layer to persist dependencies
3. Implement status calculation logic
4. Add dependency validation (cycle detection)
5. Update existing create/update tools

### Phase 2: Basic Concurrent Work (Week 3-4)
1. Remove single in-progress constraint
2. Add instance-based locking
3. Implement claim/release mechanisms
4. Add session management
5. Create new MCP tools for dependencies

### Phase 3: Advanced Features (Week 5-6)
1. Critical path analysis
2. Work allocation optimization
3. Heartbeat and failure recovery
4. Dependency visualization
5. Performance optimizations

## Example Workflow

```typescript
// Setup project with dependencies
const design = await create_todo({ title: "Design feature", projectId: "p1" });
const implement = await create_todo({ title: "Implement feature", projectId: "p1" });
const test = await create_todo({ title: "Test feature", projectId: "p1" });

// Define dependencies: implement depends on design, test depends on implement
await add_todo_dependencies({ 
  todoId: implement.id, 
  dependencyIds: [design.id] 
});
await add_todo_dependencies({ 
  todoId: test.id, 
  dependencyIds: [implement.id] 
});

// Claude Instance 1 works on design
await claim_todo({ todoId: design.id, sessionId: "claude-1" });
// ... work happens ...
await update_todo({ id: design.id, status: "completed" });

// Now implement is ready, Claude Instance 2 can work on it
await claim_todo({ todoId: implement.id, sessionId: "claude-2" });

// Parallel work on independent branches is possible
```

## Benefits

1. **Increased Throughput**: 3-5x faster completion for parallelizable work
2. **Better Organization**: Dependencies make task relationships explicit
3. **Automatic Coordination**: System prevents work on blocked tasks
4. **Failure Resilience**: Stale locks automatically released
5. **Progress Visibility**: Clear view of what's blocking what

## Migration Strategy

1. **Backward Compatibility**: Existing todos work without dependencies
2. **Opt-in Adoption**: Projects can choose to use dependencies or not
3. **Gradual Rollout**: Start with simple dependencies, add advanced features later
4. **Data Migration**: Add empty dependency arrays to existing todos

## Technical Considerations

1. **Storage Format**: Extend existing JSON structure
2. **Atomic Operations**: Use file locking for concurrent access
3. **Performance**: Index by status for fast "ready" queries
4. **Monitoring**: Track metrics for optimization
5. **Error Handling**: Graceful degradation if lock conflicts occur

## Next Steps

1. Review and approve design documents
2. Create feature branch for development
3. Implement Phase 1 (core dependencies)
4. Test with single instance
5. Implement Phase 2 (concurrent work)
6. Test with multiple instances
7. Deploy and monitor

## Success Metrics

- **Adoption Rate**: % of projects using dependencies
- **Concurrency Factor**: Average parallel todos per project
- **Time Reduction**: % decrease in project completion time
- **Lock Contention**: < 5% failed claim attempts
- **User Satisfaction**: Positive feedback on workflow improvements

## Questions to Resolve

1. Should we support cross-project dependencies?
2. What's the maximum number of concurrent instances to support?
3. Should we add time estimates to todos for better scheduling?
4. How to handle partial failures in dependency chains?
5. Should we support "soft" dependencies (nice-to-have vs required)?

## Prototype

A working prototype is available at `src/prototype/dependency-graph.ts` demonstrating:
- Dependency graph data structure
- Cycle detection algorithm
- Status calculation logic
- Critical path analysis
- Basic work allocation
- DOT format visualization

Run the prototype:
```bash
npm run build
node dist/prototype/dependency-graph.js
```

This implementation would transform todos-mcp from a simple task tracker to a powerful work coordination system for AI agents.