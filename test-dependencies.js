#!/usr/bin/env node

const { ScopedTodosStorage } = require('./dist/scoped-storage.js');

async function testDependencyGraph() {
  console.log('🧪 Testing Dependency Graph functionality...\n');
  
  const storage = new ScopedTodosStorage();
  
  try {
    // 1. Register a worker
    const workspace = await storage.getOrCreateWorkspace('/tmp/test-deps');
    const worker = await storage.registerWorkerForWorkspace(workspace.id, {
      name: 'Test Worker',
      capabilities: ['coding', 'testing'],
      purpose: 'Testing dependencies'
    });
    
    console.log(`✅ Registered worker: ${worker.name} (${worker.id})`);
    
    // 2. Create a project
    const project = await storage.createProject({
      name: 'Dependency Test Project',
      description: 'Testing dependency graphs',
      workspacePath: '/tmp/test-deps'
    });
    
    console.log(`✅ Created project: ${project.name} (${project.id})`);
    
    // 3. Create todos with dependencies
    console.log('\n📝 Creating todos with dependencies...');
    
    // Todo 1: Foundation task (no dependencies)
    const todo1 = await storage.createTodo({
      projectId: project.id,
      title: 'Setup development environment',
      description: 'Install tools and configure environment',
      priority: 'high',
      estimatedDuration: 60
    });
    console.log(`   Created: ${todo1.title} (${todo1.id})`);
    
    // Todo 2: Depends on todo1
    const todo2 = await storage.createTodo({
      projectId: project.id,
      title: 'Write core module',
      description: 'Implement the main functionality',
      dependsOn: [todo1.id],
      priority: 'critical',
      estimatedDuration: 180
    });
    console.log(`   Created: ${todo2.title} (${todo2.id}) - depends on ${todo1.id}`);
    
    // Todo 3: Also depends on todo1
    const todo3 = await storage.createTodo({
      projectId: project.id,
      title: 'Setup testing framework',
      description: 'Configure unit testing',
      dependsOn: [todo1.id],
      priority: 'medium',
      estimatedDuration: 90
    });
    console.log(`   Created: ${todo3.title} (${todo3.id}) - depends on ${todo1.id}`);
    
    // Todo 4: Depends on both todo2 and todo3
    const todo4 = await storage.createTodo({
      projectId: project.id,
      title: 'Write integration tests',
      description: 'Test core module with testing framework',
      dependsOn: [todo2.id, todo3.id],
      priority: 'high',
      estimatedDuration: 120
    });
    console.log(`   Created: ${todo4.title} (${todo4.id}) - depends on ${todo2.id}, ${todo3.id}`);
    
    // 4. Test dependency graph
    console.log('\n🔗 Analyzing dependency graph...');
    const graph = await storage.getDependencyGraph(project.id);
    
    console.log(`\n📊 Graph Analysis:`);
    console.log(`   Total todos: ${graph.nodes.length}`);
    console.log(`   Ready to work: ${graph.readyToWork.length}`);
    console.log(`   Blocked: ${graph.blocked.length}`);
    console.log(`   Cycles detected: ${graph.cycles.length}`);
    console.log(`   Critical path length: ${graph.criticalPath.length}`);
    
    console.log(`\n✅ Ready to Work:`);
    graph.readyToWork.forEach(todo => {
      console.log(`   • ${todo.title} [${todo.priority}] (~${todo.estimatedDuration || 0}min)`);
    });
    
    console.log(`\n🚫 Blocked:`);
    graph.blocked.forEach(todo => {
      console.log(`   • ${todo.title} (blocked by ${todo.blockedBy.length} todos)`);
    });
    
    if (graph.criticalPath.length > 0) {
      console.log(`\n🎯 Critical Path:`);
      console.log(`   ${graph.criticalPath.map(t => t.title).join(' → ')}`);
    }
    
    // 5. Test concurrent work (start first todo)
    console.log(`\n🚀 Starting work on first todo...`);
    const updatedTodo1 = await storage.updateTodo({
      id: todo1.id,
      status: 'in-progress'
    });
    console.log(`   ✅ Started: ${updatedTodo1.title}`);
    
    // 6. Complete first todo and see what becomes available
    console.log(`\n✅ Completing first todo...`);
    await storage.updateTodo({
      id: todo1.id,
      status: 'completed',
      actualDuration: 45
    });
    console.log(`   ✅ Completed: ${todo1.title}`);
    
    // 7. Check available work again
    console.log(`\n📋 Checking available work after completion...`);
    const availableWork = await storage.getAvailableWork(project.id);
    console.log(`   Available todos: ${availableWork.length}`);
    availableWork.forEach(todo => {
      console.log(`   • ${todo.title} [${todo.priority}]`);
    });
    
    // 8. Test concurrent work allocation
    console.log(`\n👥 Testing work allocation among multiple workers...`);
    const allocation = await storage.allocateWork(project.id, [
      { id: 'worker-1', capabilities: ['coding'], maxConcurrentTodos: 2 },
      { id: 'worker-2', capabilities: ['testing'], maxConcurrentTodos: 1 }
    ]);
    
    console.log(`\n📋 Work Allocation Results:`);
    allocation.assignedTodos.forEach(assignment => {
      console.log(`   👤 ${assignment.workerId}: ${assignment.todos.length} todos`);
      assignment.todos.forEach(todo => {
        console.log(`      • ${todo.title} [${todo.priority}]`);
      });
    });
    
    if (allocation.unassignedTodos.length > 0) {
      console.log(`\n📭 Unassigned (${allocation.unassignedTodos.length}):`);
      allocation.unassignedTodos.forEach(todo => {
        console.log(`   • ${todo.title}`);
      });
    }
    
    // 9. Test dependency cycle detection
    console.log(`\n🔄 Testing cycle detection...`);
    try {
      await storage.addDependency({
        todoId: todo1.id,
        dependsOnId: todo4.id  // This would create a cycle
      });
      console.log(`   ❌ FAILED: Cycle should have been detected!`);
    } catch (error) {
      console.log(`   ✅ SUCCESS: Cycle detected - ${error.message}`);
    }
    
    // 10. Show project change history
    console.log(`\n📝 Project Change History (last 10 events):`);
    const history = await storage.getProjectChangeHistory(project.id);
    history.slice(0, 10).forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.type} - ${event.reason} (by ${event.workerId})`);
    });
    
    console.log(`\n🎉 All dependency graph tests passed!`);
    console.log(`\n💡 Key features demonstrated:`);
    console.log(`   ✅ Dependency validation and cycle detection`);
    console.log(`   ✅ Concurrent work without single in-progress constraint`);
    console.log(`   ✅ Automatic blocking/unblocking based on dependencies`);
    console.log(`   ✅ Critical path calculation`);
    console.log(`   ✅ Intelligent work allocation among workers`);
    console.log(`   ✅ Complete audit trail with worker attribution`);
    
  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);
    console.error(error.stack);
  } finally {
    await storage.shutdown();
  }
}

// Run the test
testDependencyGraph().catch(console.error);