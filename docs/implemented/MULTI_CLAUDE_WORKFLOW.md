# Multi-Claude Concurrent Workflow Guide

This guide explains how to run multiple Claude instances working concurrently on the same project using dependency graphs.

## 🚀 Quick Start

### 1. **Setup MCP Server**

First, install and configure the todos-mcp server:

```bash
# Install globally
npm install
npm run build
npm i -g .

# Add to Claude Desktop configuration
claude mcp add-json <<EOF
{
  "mcpServers": {
    "todos-mcp": {
      "command": "todos-mcp"
    }
  }
}
EOF
```

### 2. **Start Multiple Claude Sessions**

Open multiple Claude Desktop/Web sessions. Each Claude instance will automatically get a unique worker ID when it registers.

## 📋 Step-by-Step Workflow

### **Claude Instance 1 (Project Lead)**

```
🤖 Use MCP tool: register_worker
{
  "workspacePath": "/your/project/path",
  "name": "Claude-Lead",
  "capabilities": ["planning", "architecture", "review"],
  "purpose": "Project coordination and high-level tasks"
}

🤖 Use MCP tool: create_project
{
  "name": "Website Redesign",
  "description": "Complete redesign of company website",
  "workspacePath": "/your/project/path"
}

🤖 Use MCP tool: create_todo
{
  "projectId": "<project-id>",
  "title": "Design system architecture",
  "description": "Define overall system architecture and tech stack",
  "priority": "critical",
  "estimatedDuration": 120
}

🤖 Use MCP tool: create_todo
{
  "projectId": "<project-id>",
  "title": "Setup development environment", 
  "description": "Configure build tools, linting, testing",
  "dependsOn": ["<architecture-todo-id>"],
  "priority": "high",
  "estimatedDuration": 90
}

🤖 Use MCP tool: create_todo
{
  "projectId": "<project-id>",
  "title": "Implement user authentication",
  "description": "Build login/signup flow",
  "dependsOn": ["<dev-env-todo-id>"],
  "priority": "high", 
  "estimatedDuration": 180
}

🤖 Use MCP tool: create_todo
{
  "projectId": "<project-id>",
  "title": "Build homepage components",
  "description": "Create reusable UI components for homepage",
  "dependsOn": ["<dev-env-todo-id>"],
  "priority": "medium",
  "estimatedDuration": 150
}

🤖 Use MCP tool: create_todo
{
  "projectId": "<project-id>",
  "title": "Integration testing",
  "description": "Test auth + homepage integration", 
  "dependsOn": ["<auth-todo-id>", "<homepage-todo-id>"],
  "priority": "high",
  "estimatedDuration": 90
}
```

### **Claude Instance 2 (Frontend Developer)**

```
🤖 Use MCP tool: register_worker
{
  "workspacePath": "/your/project/path",
  "name": "Claude-Frontend", 
  "capabilities": ["react", "css", "ui-design"],
  "purpose": "Frontend development and UI implementation"
}

🤖 Use MCP tool: get_available_work
{
  "projectId": "<project-id>"
}
# Will show: "Design system architecture" is ready to work

🤖 Use MCP tool: update_todo
{
  "id": "<architecture-todo-id>",
  "status": "in-progress"
}
# Claude-Frontend starts working on architecture
```

### **Claude Instance 3 (Backend Developer)**

```
🤖 Use MCP tool: register_worker
{
  "workspacePath": "/your/project/path", 
  "name": "Claude-Backend",
  "capabilities": ["nodejs", "databases", "apis"],
  "purpose": "Backend development and API implementation"
}

🤖 Use MCP tool: get_available_work
{
  "projectId": "<project-id>"
}
# Will show: No work available (architecture must be completed first)

# Wait for architecture to complete, then:
🤖 Use MCP tool: get_available_work
{
  "projectId": "<project-id>"
}
# Will show: "Setup development environment" is now available

🤖 Use MCP tool: update_todo
{
  "id": "<dev-env-todo-id>",
  "status": "in-progress"
}
```

### **Coordination Commands (Any Claude)**

```bash
# Check current project status
🤖 Use MCP tool: get_dependency_graph
{
  "projectId": "<project-id>"
}

# See who's working on what
🤖 Use MCP tool: list_workspace_workers
{
  "workspacePath": "/your/project/path"
}

# Get work allocation suggestions
🤖 Use MCP tool: allocate_work
{
  "projectId": "<project-id>",
  "workers": [
    {"id": "claude-frontend", "capabilities": ["react", "css"], "maxConcurrentTodos": 2},
    {"id": "claude-backend", "capabilities": ["nodejs", "apis"], "maxConcurrentTodos": 1}
  ]
}

# View project change history
🤖 Use MCP tool: get_project_change_history
{
  "projectId": "<project-id>",
  "limit": 10
}
```

## 🔄 Typical Flow Patterns

### **Sequential Dependencies**
```
Task A → Task B → Task C
```
- Only Claude working on Task A initially
- Task B becomes available when A completes  
- Task C becomes available when B completes

### **Parallel Work**
```
       → Task B1 →
Task A              → Task D
       → Task B2 →
```
- Task A must complete first
- Tasks B1 and B2 can be worked on simultaneously by different Claudes
- Task D waits for both B1 and B2 to complete

### **Mixed Dependencies**
```
Task A → Task B
      ↘       ↘  
        Task C → Task D
```
- A enables both B and C
- Multiple Claudes can work on B and C simultaneously
- D waits for both B and C

## 🎯 Best Practices

### **1. Clear Worker Roles**
- Give each Claude instance a clear role and capabilities
- Use descriptive names (Claude-Frontend, Claude-Backend, Claude-Testing)

### **2. Dependency Design**
- Break large tasks into smaller, parallelizable pieces
- Minimize blocking dependencies where possible
- Use priority levels to guide work allocation

### **3. Regular Coordination**
```bash
# Each Claude should periodically check:
🤖 Use MCP tool: get_available_work
🤖 Use MCP tool: worker_heartbeat  # Maintains registration
🤖 Use MCP tool: get_dependency_graph  # See overall progress
```

### **4. Conflict Resolution**
- The system prevents dependency cycles automatically
- Use `get_project_change_history` to track who changed what
- Communicate through todo descriptions and comments

## 🔧 Troubleshooting

### **"No work available"**
- Check dependency graph - work may be blocked
- Verify worker is registered: `register_worker`
- Complete blocking tasks first

### **"Worker not registered"**
- Re-run `register_worker` for the workspace
- Check workspace path is consistent across instances

### **Dependency conflicts**
- Use `get_dependency_graph` to visualize relationships
- System will prevent cycles automatically
- Remove conflicting dependencies if needed

## 📊 Monitoring Progress

```bash
# Real-time project dashboard
🤖 Use MCP tool: get_project_stats
🤖 Use MCP tool: get_workspace_stats
🤖 Use MCP tool: list_workspace_workers

# See what each worker accomplished
🤖 Use MCP tool: get_worker_activity
```

This workflow enables multiple Claude instances to work together efficiently while maintaining data integrity and preventing conflicts through the dependency graph system.