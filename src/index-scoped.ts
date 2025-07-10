#!/usr/bin/env node

// Default NODE_ENV to production if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ScopedTodosStorage } from './scoped-storage.js';
import { ValidationError } from './validation.js';

const storage = new ScopedTodosStorage();

const server = new Server(
  {
    name: 'todos-mcp-scoped',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
  // Worker management - now workspace-scoped
  {
    name: 'register_worker',
    description: 'Register this worker instance for a specific workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' },
        name: { type: 'string', description: 'Human-readable worker name (e.g., "Claude-Frontend")' },
        capabilities: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'List of capabilities (e.g., ["coding", "testing", "documentation"])' 
        },
        purpose: { type: 'string', description: 'What this worker is working on' }
      }
    }
  },
  {
    name: 'list_workspace_workers',
    description: 'List all active workers in the current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' }
      }
    }
  },
  {
    name: 'list_project_workers',
    description: 'List workers currently active in a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'worker_heartbeat',
    description: 'Send heartbeat to maintain worker registration',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  
  // Project/todo operations
  {
    name: 'create_project',
    description: 'Create a new project in the current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string', description: 'Project description' },
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' }
      },
      required: ['name']
    }
  },
  {
    name: 'create_todo',
    description: 'Create a new todo item in a project with optional dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Todo title' },
        description: { type: 'string', description: 'Todo description' },
        phaseId: { type: 'string', description: 'Phase ID (optional)' },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'Array of todo IDs this todo depends on' },
        estimatedDuration: { type: 'number', description: 'Estimated duration in minutes' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Todo priority' }
      },
      required: ['projectId', 'title']
    }
  },
  {
    name: 'update_todo',
    description: 'Update a todo item including dependencies and priority',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Todo ID' },
        title: { type: 'string', description: 'New todo title' },
        description: { type: 'string', description: 'New todo description' },
        status: { type: 'string', enum: ['pending', 'in-progress', 'completed'], description: 'Todo status' },
        phaseId: { type: 'string', description: 'Phase ID' },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'Array of todo IDs this todo depends on' },
        estimatedDuration: { type: 'number', description: 'Estimated duration in minutes' },
        actualDuration: { type: 'number', description: 'Actual time spent in minutes' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Todo priority' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_todo',
    description: 'Delete a todo item',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'Todo ID' }
      },
      required: ['todoId']
    }
  },
  {
    name: 'claim_todo',
    description: 'Claim a todo and mark it as in-progress (preserves all todo data)',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'Todo ID to claim' }
      },
      required: ['todoId']
    }
  },
  {
    name: 'finish_todo',
    description: 'Mark a todo as completed (preserves all todo data)',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'Todo ID to finish' }
      },
      required: ['todoId']
    }
  },
  {
    name: 'unclaim_todo',
    description: 'Mark a todo as pending (return to available work)',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'Todo ID to unclaim' }
      },
      required: ['todoId']
    }
  },
  {
    name: 'list_projects',
    description: 'List all projects in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' }
      }
    }
  },
  {
    name: 'get_project',
    description: 'Get details of a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' }
      },
      required: ['projectId']
    }
  },
  
  // Dependency management tools
  {
    name: 'add_dependency',
    description: 'Add a dependency between two todos',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'Todo that will depend on another' },
        dependsOnId: { type: 'string', description: 'Todo that must be completed first' }
      },
      required: ['todoId', 'dependsOnId']
    }
  },
  {
    name: 'remove_dependency',
    description: 'Remove a dependency between two todos',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'Todo to remove dependency from' },
        dependsOnId: { type: 'string', description: 'Todo dependency to remove' }
      },
      required: ['todoId', 'dependsOnId']
    }
  },
  {
    name: 'get_dependency_graph',
    description: 'Get the dependency graph for a project showing relationships and work availability',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'get_available_work',
    description: 'Get todos that can be started right now (dependencies satisfied)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        workerId: { type: 'string', description: 'Worker ID (optional, defaults to current worker)' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'allocate_work',
    description: 'Intelligently allocate available work among multiple workers',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        workers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              capabilities: { type: 'array', items: { type: 'string' } },
              maxConcurrentTodos: { type: 'number' }
            },
            required: ['id']
          },
          description: 'Array of worker definitions'
        }
      },
      required: ['projectId', 'workers']
    }
  },
  
  // Scoped audit trail queries
  {
    name: 'get_project_change_history',
    description: 'Get change history for a specific project or entity within a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        entityType: { 
          type: 'string', 
          enum: ['todo', 'phase', 'document'],
          description: 'Type of entity (optional - if not provided, gets all project changes)' 
        },
        entityId: { type: 'string', description: 'ID of specific entity (required if entityType provided)' },
        limit: { type: 'number', description: 'Maximum number of changes to return (default: 20)' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'get_workspace_changes',
    description: 'Get workspace-level changes (project creation/deletion, worker activity)',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' },
        workerId: { type: 'string', description: 'Filter by specific worker ID' },
        limit: { type: 'number', description: 'Maximum number of changes to return (default: 20)' },
        since: { type: 'string', description: 'ISO date string to filter changes since' }
      }
    }
  },
  {
    name: 'get_worker_activity',
    description: 'Get activity summary for a worker in the current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workerId: { type: 'string', description: 'Worker ID (defaults to current worker)' },
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' }
      }
    }
  },
  {
    name: 'get_project_stats',
    description: 'Get statistics for a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'get_workspace_stats',
    description: 'Get statistics for the current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path (defaults to current directory)' }
      }
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Helper function to get workspace ID from path
async function getWorkspaceId(workspacePath?: string): Promise<string> {
  const path = workspacePath || process.cwd();
  const workspace = await storage.getOrCreateWorkspace(path);
  return workspace.id;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: 'text',
          text: '❌ Missing arguments'
        }
      ]
    };
  }

  try {
    switch (name) {
      // Worker management
      case 'register_worker': {
        const workspaceId = await getWorkspaceId(args.workspacePath as string);
        
        const worker = await storage.registerWorkerForWorkspace(workspaceId, {
          name: args.name as string,
          capabilities: args.capabilities as string[],
          purpose: args.purpose as string
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Worker registered in workspace: ${worker.name || worker.id}\n` +
                   `   Workspace: ${workspaceId}\n` +
                   `   Session: ${worker.sessionId}\n` +
                   `   Capabilities: ${worker.capabilities.join(', ')}`
            }
          ]
        };
      }

      case 'list_workspace_workers': {
        const workspaceId = await getWorkspaceId(args.workspacePath as string);
        const workers = await storage.getWorkspaceWorkers(workspaceId);
        
        if (workers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No active workers found in this workspace'
              }
            ]
          };
        }
        
        const workerList = workers.map(w => 
          `🤖 ${w.name || w.id}\n` +
          `   Session: ${w.sessionId}\n` +
          `   Registered: ${w.registeredAt.toISOString()}\n` +
          `   Last seen: ${w.lastSeen.toISOString()}\n` +
          `   Current project: ${w.currentProjectId || 'None'}\n` +
          `   Capabilities: ${w.capabilities.join(', ')}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Active Workers in Workspace (${workers.length}):\n\n${workerList}`
            }
          ]
        };
      }

      case 'list_project_workers': {
        const workers = await storage.getProjectWorkers(args.projectId as string);
        
        if (workers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No workers currently active in this project'
              }
            ]
          };
        }
        
        const workerList = workers.map(w => 
          `🤖 ${w.name || w.id} (${w.capabilities.join(', ')})`
        ).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Workers in Project (${workers.length}):\n${workerList}`
            }
          ]
        };
      }

      case 'worker_heartbeat': {
        await storage.heartbeat();
        return {
          content: [
            {
              type: 'text',
              text: '💓 Heartbeat sent'
            }
          ]
        };
      }

      // Project operations
      case 'create_project': {
        const workspacePath = (args.workspacePath as string) || process.cwd();
        const project = await storage.createProject({
          name: args.name as string,
          description: args.description as string,
          workspacePath
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Created project: ${project.name} (ID: ${project.id})`
            }
          ]
        };
      }

      case 'create_todo': {
        const todo = await storage.createTodo({
          projectId: args.projectId as string,
          title: args.title as string,
          description: args.description as string,
          phaseId: args.phaseId as string,
          dependsOn: args.dependsOn as string[],
          estimatedDuration: args.estimatedDuration as number,
          priority: args.priority as 'low' | 'medium' | 'high' | 'critical'
        });
        
        if (!todo) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Project not found or worker not registered'
              }
            ]
          };
        }
        
        const depInfo = todo.dependsOn.length > 0 ? ` (depends on ${todo.dependsOn.length} todos)` : '';
        const priorityInfo = todo.priority !== 'medium' ? ` [${todo.priority}]` : '';
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Created todo: ${todo.title} (ID: ${todo.id})${priorityInfo}${depInfo}`
            }
          ]
        };
      }

      case 'update_todo': {
        const todo = await storage.updateTodo({
          id: args.id as string,
          title: args.title as string,
          description: args.description as string,
          status: args.status as 'pending' | 'in-progress' | 'completed',
          phaseId: args.phaseId as string,
          dependsOn: args.dependsOn as string[],
          estimatedDuration: args.estimatedDuration as number,
          actualDuration: args.actualDuration as number,
          priority: args.priority as 'low' | 'medium' | 'high' | 'critical'
        });
        
        if (!todo) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Todo not found'
              }
            ]
          };
        }
        
        const depInfo = todo.dependsOn.length > 0 ? ` (${todo.dependsOn.length} deps)` : '';
        const priorityInfo = todo.priority !== 'medium' ? ` [${todo.priority}]` : '';
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Updated todo: ${todo.title} (Status: ${todo.status})${priorityInfo}${depInfo}`
            }
          ]
        };
      }

      case 'delete_todo': {
        const success = await storage.deleteTodo(args.todoId as string);
        return {
          content: [
            {
              type: 'text',
              text: success ? '✅ Todo deleted' : '❌ Todo not found'
            }
          ]
        };
      }

      case 'claim_todo': {
        const result = await storage.changeStatus(args.todoId as string, 'in-progress');
        return {
          content: [
            {
              type: 'text',
              text: result ? '✅ Todo claimed and marked in-progress' : '❌ Todo not found or cannot be claimed'
            }
          ]
        };
      }

      case 'finish_todo': {
        const result = await storage.changeStatus(args.todoId as string, 'completed');
        return {
          content: [
            {
              type: 'text',
              text: result ? '✅ Todo completed!' : '❌ Todo not found'
            }
          ]
        };
      }

      case 'unclaim_todo': {
        const result = await storage.changeStatus(args.todoId as string, 'pending');
        return {
          content: [
            {
              type: 'text',
              text: result ? '✅ Todo returned to pending status' : '❌ Todo not found'
            }
          ]
        };
      }

      case 'list_projects': {
        let projects;
        if (args.workspacePath) {
          const workspace = await storage.getWorkspaceByPath(args.workspacePath as string);
          projects = workspace ? workspace.projects : [];
        } else {
          projects = await storage.listProjects();
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2)
            }
          ]
        };
      }

      case 'get_project': {
        const project = await storage.getProject(args.projectId as string);
        if (!project) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Project not found'
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(project, null, 2)
            }
          ]
        };
      }

      // Dependency management handlers
      case 'add_dependency': {
        const todo = await storage.addDependency({
          todoId: args.todoId as string,
          dependsOnId: args.dependsOnId as string
        });
        
        if (!todo) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Todo not found'
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Added dependency: ${args.todoId} now depends on ${args.dependsOnId}`
            }
          ]
        };
      }
      
      case 'remove_dependency': {
        const todo = await storage.removeDependency({
          todoId: args.todoId as string,
          dependsOnId: args.dependsOnId as string
        });
        
        if (!todo) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Todo not found'
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Removed dependency: ${args.todoId} no longer depends on ${args.dependsOnId}`
            }
          ]
        };
      }
      
      case 'get_dependency_graph': {
        const graph = await storage.getDependencyGraph(args.projectId as string);
        if (!graph) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Project not found'
              }
            ]
          };
        }
        
        const readyWork = graph.readyToWork.map(t => `• ${t.title} [${t.priority}]`).join('\n');
        const blockedWork = graph.blocked.map(t => `• ${t.title} (blocked by ${t.blockedBy.length} todos)`).join('\n');
        const criticalPath = graph.criticalPath.map(t => t.title).join(' → ');
        
        return {
          content: [
            {
              type: 'text',
              text: `🔗 Dependency Graph Summary:\n\n` +
                   `📋 Ready to Work (${graph.readyToWork.length}):\n${readyWork || '   None'}\n\n` +
                   `🚫 Blocked (${graph.blocked.length}):\n${blockedWork || '   None'}\n\n` +
                   `⚠️ Cycles: ${graph.cycles.length}\n\n` +
                   `🎯 Critical Path: ${criticalPath || 'None'}\n\n` +
                   `📊 Full Details:\n${JSON.stringify(graph, null, 2)}`
            }
          ]
        };
      }
      
      case 'get_available_work': {
        const availableWork = await storage.getAvailableWork(args.projectId as string, args.workerId as string);
        
        if (availableWork.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📭 No work available right now (all todos are either completed, in-progress, or blocked by dependencies)'
              }
            ]
          };
        }
        
        const workList = availableWork.map(todo => 
          `• ${todo.title} [${todo.priority}]${todo.estimatedDuration ? ` (~${todo.estimatedDuration}min)` : ''}`
        ).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Available Work (${availableWork.length} todos):\n\n${workList}`
            }
          ]
        };
      }
      
      case 'allocate_work': {
        const allocation = await storage.allocateWork(args.projectId as string, args.workers as any[]);
        if (!allocation) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Project not found'
              }
            ]
          };
        }
        
        const assignments = allocation.assignedTodos.map(assignment => 
          `👤 ${assignment.workerId}: ${assignment.todos.length} todos\n` +
          assignment.todos.map(t => `   • ${t.title} [${t.priority}]`).join('\n')
        ).join('\n\n');
        
        const conflicts = allocation.conflicts.map(c => `⚠️ ${c.todoId}: ${c.reason}`).join('\n');
        const unassigned = allocation.unassignedTodos.map(t => `• ${t.title}`).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🎯 Work Allocation Results:\n\n` +
                   `${assignments}\n\n` +
                   `🚫 Unassigned (${allocation.unassignedTodos.length}):\n${unassigned || '   None'}\n\n` +
                   `⚠️ Conflicts (${allocation.conflicts.length}):\n${conflicts || '   None'}`
            }
          ]
        };
      }

      // Scoped audit queries
      case 'get_project_change_history': {
        const history = await storage.getProjectChangeHistory(
          args.projectId as string,
          args.entityType as string,
          args.entityId as string
        );
        
        const limit = args.limit as number || 20;
        const limitedHistory = history.slice(0, limit);
        
        if (limitedHistory.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No change history found for this project'
              }
            ]
          };
        }
        
        const historyText = limitedHistory.map(change => 
          `📝 ${change.timestamp.toISOString()}\n` +
          `   Worker: ${change.workerId}\n` +
          `   Action: ${change.type}\n` +
          `   Entity: ${change.entityType} ${change.entityId}\n` +
          `   ${change.reason || 'No reason provided'}\n` +
          `   Duration: ${change.duration || 0}ms`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Project Change History (${limitedHistory.length} changes):\n\n${historyText}`
            }
          ]
        };
      }

      case 'get_workspace_changes': {
        const workspaceId = await getWorkspaceId(args.workspacePath as string);
        const changes = await storage.getWorkspaceChanges(workspaceId, {
          workerId: args.workerId as string,
          limit: args.limit as number || 20,
          since: args.since ? new Date(args.since as string) : undefined
        });
        
        if (changes.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No workspace changes found'
              }
            ]
          };
        }
        
        const changesText = changes.map(change => 
          `📝 ${change.timestamp.toISOString()}\n` +
          `   Worker: ${change.workerId}\n` +
          `   ${change.type}\n` +
          `   ${change.reason || 'No reason provided'}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Workspace Changes (${changes.length}):\n\n${changesText}`
            }
          ]
        };
      }

      case 'get_worker_activity': {
        const workspaceId = await getWorkspaceId(args.workspacePath as string);
        const activity = await storage.getWorkerActivity(workspaceId, args.workerId as string);
        
        if (!activity) {
          return {
            content: [
              {
                type: 'text',
                text: 'Worker not found or no activity data available'
              }
            ]
          };
        }
        
        const uptime = Math.round(activity.metrics.uptime / 1000 / 60); // minutes
        
        return {
          content: [
            {
              type: 'text',
              text: `Worker Activity: ${activity.worker.name || activity.worker.id}\n\n` +
                   `📊 Metrics:\n` +
                   `   • Changes (24h): ${activity.metrics.changesLast24h}\n` +
                   `   • Todos completed: ${activity.metrics.todosCompleted}\n` +
                   `   • Todos in progress: ${activity.metrics.todosInProgress}\n` +
                   `   • Average time per todo: ${activity.metrics.averageTimePerTodo}ms\n` +
                   `   • Uptime: ${uptime} minutes\n` +
                   `   • Current project: ${activity.currentWork.projectId || 'None'}\n` +
                   `   • Status: ${activity.isActive ? '🟢 Active' : '🔴 Inactive'}`
            }
          ]
        };
      }

      case 'get_project_stats': {
        const stats = await storage.getProjectStats(args.projectId as string);
        
        if (!stats) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Project not found'
              }
            ]
          };
        }
        
        const topWorkers = Object.entries(stats.eventsByWorker)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([worker, count]) => `   • ${worker}: ${count} changes`)
          .join('\n');
        
        const topEventTypes = Object.entries(stats.eventsByType)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => `   • ${type}: ${count}`)
          .join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Project Statistics:\n\n` +
                   `📈 Overview:\n` +
                   `   • Total events: ${stats.totalEvents}\n` +
                   `   • Oldest event: ${stats.oldestEvent?.toISOString() || 'N/A'}\n` +
                   `   • Newest event: ${stats.newestEvent?.toISOString() || 'N/A'}\n\n` +
                   `👥 Top Workers:\n${topWorkers}\n\n` +
                   `🔄 Top Event Types:\n${topEventTypes}`
            }
          ]
        };
      }

      case 'get_workspace_stats': {
        const workspaceId = await getWorkspaceId(args.workspacePath as string);
        const stats = await storage.getWorkspaceStats(workspaceId);
        
        const projectDist = Object.entries(stats.projectDistribution)
          .map(([projectId, count]) => `   • ${projectId}: ${count} workers`)
          .join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Workspace Statistics:\n\n` +
                   `📊 Workers:\n` +
                   `   • Total: ${stats.totalWorkers}\n` +
                   `   • Active: ${stats.activeWorkers}\n` +
                   `   • Inactive: ${stats.inactiveWorkers}\n` +
                   `   • Average uptime: ${Math.round(stats.averageUptime / 1000 / 60)} minutes\n\n` +
                   `📋 Project Distribution:\n${projectDist || '   • No active projects'}`
            }
          ]
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `❌ Unknown tool: ${name}`
            }
          ]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof ValidationError
      ? `Validation Error: ${error.message}`
      : `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;

    return {
      content: [
        {
          type: 'text',
          text: `❌ ${errorMessage}`
        }
      ]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await storage.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await storage.shutdown();
  process.exit(0);
});

main().catch(async (error) => {
  console.error('Error starting server:', error);
  await storage.shutdown();
  process.exit(1);
});