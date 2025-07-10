#!/usr/bin/env node

const { ScopedTodosStorage } = require('./dist/scoped-storage.js');

/**
 * Demo script showing how multiple Claude instances would work together
 * This simulates the MCP tool calls that each Claude instance would make
 */

async function demoMultiClaudeWorkflow() {
  console.log('🎭 Demo: Multiple Claude Instances Working Together\n');
  
  const storage = new ScopedTodosStorage();
  const workspacePath = '/tmp/demo-project';
  
  try {
    // Simulate Claude Instance 1 (Project Lead) starting up
    console.log('👑 Claude Instance 1 - Project Lead');
    console.log('   🔧 Registering as project lead...');
    
    const workspace = await storage.getOrCreateWorkspace(workspacePath);
    const claude1 = await storage.registerWorkerForWorkspace(workspace.id, {
      name: 'Claude-Lead',
      capabilities: ['planning', 'architecture', 'review'],
      purpose: 'Project coordination and high-level tasks'
    });
    
    console.log(`   ✅ Registered: ${claude1.name} (${claude1.id})`);
    
    // Create project and initial todos with dependencies
    const project = await storage.createProject({
      name: 'Website Redesign',
      description: 'Complete redesign of company website',
      workspacePath
    });
    
    console.log(`   📋 Created project: ${project.name}`);
    
    // Create foundation todo
    const designTodo = await storage.createTodo({
      projectId: project.id,
      title: 'Design system architecture',
      description: 'Define overall system architecture and tech stack',
      priority: 'critical',
      estimatedDuration: 120
    });
    
    // Create dependent todos
    const devEnvTodo = await storage.createTodo({
      projectId: project.id,
      title: 'Setup development environment',
      description: 'Configure build tools, linting, testing',
      dependsOn: [designTodo.id],
      priority: 'high',
      estimatedDuration: 90
    });
    
    const authTodo = await storage.createTodo({
      projectId: project.id,
      title: 'Implement user authentication',
      description: 'Build login/signup flow',
      dependsOn: [devEnvTodo.id],
      priority: 'high',
      estimatedDuration: 180
    });
    
    const homepageTodo = await storage.createTodo({
      projectId: project.id,
      title: 'Build homepage components',
      description: 'Create reusable UI components for homepage',
      dependsOn: [devEnvTodo.id],
      priority: 'medium',
      estimatedDuration: 150
    });
    
    const integrationTodo = await storage.createTodo({
      projectId: project.id,
      title: 'Integration testing',
      description: 'Test auth + homepage integration',
      dependsOn: [authTodo.id, homepageTodo.id],
      priority: 'high',
      estimatedDuration: 90
    });
    
    console.log(`   📝 Created 5 todos with dependency chain`);
    
    // Simulate Claude Instance 2 (Frontend Developer) joining
    console.log('\n🎨 Claude Instance 2 - Frontend Developer');
    console.log('   🔧 Registering as frontend developer...');
    
    const claude2 = await storage.registerWorkerForWorkspace(workspace.id, {
      name: 'Claude-Frontend', 
      capabilities: ['react', 'css', 'ui-design'],
      purpose: 'Frontend development and UI implementation'
    });
    
    console.log(`   ✅ Registered: ${claude2.name} (${claude2.id})`);
    
    // Check available work
    const availableWork1 = await storage.getAvailableWork(project.id, claude2.id);
    console.log(`   📋 Available work: ${availableWork1.length} todos`);
    availableWork1.forEach(todo => {
      console.log(`      • ${todo.title} [${todo.priority}]`);
    });
    
    // Start working on the design task
    await storage.updateTodo({
      id: designTodo.id,
      status: 'in-progress'
    });
    console.log(`   🚀 Started: ${designTodo.title}`);
    
    // Simulate Claude Instance 3 (Backend Developer) joining
    console.log('\n⚙️  Claude Instance 3 - Backend Developer');
    console.log('   🔧 Registering as backend developer...');
    
    const claude3 = await storage.registerWorkerForWorkspace(workspace.id, {
      name: 'Claude-Backend',
      capabilities: ['nodejs', 'databases', 'apis'],
      purpose: 'Backend development and API implementation'
    });
    
    console.log(`   ✅ Registered: ${claude3.name} (${claude3.id})`);
    
    // Check available work - should be none since design is in progress
    const availableWork2 = await storage.getAvailableWork(project.id, claude3.id);
    console.log(`   📋 Available work: ${availableWork2.length} todos (blocked by dependencies)`);
    
    // Show current dependency graph
    console.log('\n🔗 Current Dependency Graph:');
    const graph1 = await storage.getDependencyGraph(project.id);
    console.log(`   📊 Ready: ${graph1.readyToWork.length}, Blocked: ${graph1.blocked.length}, In-progress: ${graph1.nodes.filter(n => n.todo.status === 'in-progress').length}`);
    
    // Claude 1 completes the design task
    console.log('\n👑 Claude Instance 1 - Completing design task');
    await storage.updateTodo({
      id: designTodo.id,
      status: 'completed',
      actualDuration: 110
    });
    console.log(`   ✅ Completed: ${designTodo.title}`);
    
    // Now check what work becomes available
    console.log('\n📋 Work availability after design completion:');
    const availableWork3 = await storage.getAvailableWork(project.id);
    console.log(`   Available todos: ${availableWork3.length}`);
    availableWork3.forEach(todo => {
      console.log(`      • ${todo.title} [${todo.priority}]`);
    });
    
    // Claude 2 and Claude 3 can now work in parallel
    console.log('\n🎨 Claude Instance 2 - Taking dev environment setup');
    await storage.updateTodo({
      id: devEnvTodo.id,
      status: 'in-progress'
    });
    console.log(`   🚀 Started: ${devEnvTodo.title}`);
    
    // Show intelligent work allocation
    console.log('\n🧠 Intelligent Work Allocation:');
    const allocation = await storage.allocateWork(project.id, [
      { id: claude2.id, capabilities: ['react', 'css'], maxConcurrentTodos: 2 },
      { id: claude3.id, capabilities: ['nodejs', 'apis'], maxConcurrentTodos: 1 }
    ]);
    
    console.log('   📋 Recommended assignments:');
    allocation.assignedTodos.forEach(assignment => {
      console.log(`      👤 ${assignment.workerId.substring(0, 20)}...: ${assignment.todos.length} todos`);
      assignment.todos.forEach(todo => {
        console.log(`         • ${todo.title} [${todo.priority}]`);
      });
    });
    
    if (allocation.unassignedTodos.length > 0) {
      console.log(`      📭 Unassigned: ${allocation.unassignedTodos.length} todos (blocked by dependencies)`);
    }
    
    // Show all active workers
    console.log('\n👥 Active Workers in Workspace:');
    const workers = await storage.getWorkspaceWorkers(workspace.id);
    workers.forEach(worker => {
      console.log(`   🤖 ${worker.name} - ${worker.capabilities.join(', ')}`);
      console.log(`      Current project: ${worker.currentProjectId ? 'Working on project' : 'Available'}`);
    });
    
    // Complete dev environment to unlock more work
    console.log('\n🎨 Claude Instance 2 - Completing dev environment');
    await storage.updateTodo({
      id: devEnvTodo.id,
      status: 'completed',
      actualDuration: 85
    });
    console.log(`   ✅ Completed: ${devEnvTodo.title}`);
    
    // Now auth and homepage can be worked on in parallel
    console.log('\n🚀 Parallel Work Phase:');
    const newAvailableWork = await storage.getAvailableWork(project.id);
    console.log(`   📋 Now available: ${newAvailableWork.length} todos`);
    newAvailableWork.forEach(todo => {
      console.log(`      • ${todo.title} [${todo.priority}] (~${todo.estimatedDuration}min)`);
    });
    
    // Show final dependency graph
    console.log('\n🔗 Final Dependency Graph State:');
    const finalGraph = await storage.getDependencyGraph(project.id);
    console.log(`   📊 Completed: ${finalGraph.nodes.filter(n => n.todo.status === 'completed').length}`);
    console.log(`   📊 Ready to work: ${finalGraph.readyToWork.length}`);
    console.log(`   📊 Blocked: ${finalGraph.blocked.length}`);
    console.log(`   🎯 Critical path: ${finalGraph.criticalPath.map(t => t.title).join(' → ')}`);
    
    // Show project change history
    console.log('\n📜 Project Change History (last 8 events):');
    const history = await storage.getProjectChangeHistory(project.id);
    history.slice(0, 8).forEach((event, i) => {
      const workerName = event.workerId.includes('Lead') ? 'Claude-Lead' : 
                        event.workerId.includes('Frontend') ? 'Claude-Frontend' : 'Claude-Backend';
      console.log(`   ${i + 1}. ${event.type} - ${event.reason}`);
      console.log(`      👤 by ${workerName} at ${event.timestamp.toISOString().substring(11, 19)}`);
    });
    
    console.log('\n🎉 Multi-Claude Demo Complete!');
    console.log('\n💡 Key Points Demonstrated:');
    console.log('   ✅ Multiple Claude instances can register as workers');
    console.log('   ✅ Work is automatically coordinated through dependencies');
    console.log('   ✅ No single in-progress constraint - true parallel work');
    console.log('   ✅ Intelligent work allocation based on capabilities');
    console.log('   ✅ Complete audit trail shows who did what when');
    console.log('   ✅ Real-time availability updates as dependencies complete');
    
    console.log('\n🚀 Ready for Production Use!');
    console.log('   Each Claude instance would use MCP tools to:');
    console.log('   • register_worker (on startup)');
    console.log('   • get_available_work (to find tasks)');
    console.log('   • update_todo (to start/complete work)');
    console.log('   • get_dependency_graph (to understand project state)');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error.stack);
  } finally {
    await storage.shutdown();
  }
}

// Run the demo
demoMultiClaudeWorkflow().catch(console.error);