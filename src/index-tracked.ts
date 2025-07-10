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
import { TrackedTodosStorage } from './tracked-storage.js';
import { ValidationError } from './validation.js';

const storage = new TrackedTodosStorage();

const server = new Server(
  {
    name: 'todos-mcp-tracked',
    version: '2.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
  // Existing project/todo tools...
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
    description: 'Create a new todo item',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Todo title' },
        description: { type: 'string', description: 'Todo description' },
        phaseId: { type: 'string', description: 'Phase ID (optional)' }
      },
      required: ['projectId', 'title']
    }
  },
  {
    name: 'update_todo',
    description: 'Update a todo item',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Todo ID' },
        title: { type: 'string', description: 'New todo title' },
        description: { type: 'string', description: 'New todo description' },
        status: { type: 'string', enum: ['pending', 'in-progress', 'completed'], description: 'Todo status' },
        phaseId: { type: 'string', description: 'Phase ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_projects',
    description: 'List all projects',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path to filter by' }
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
  
  // New tracking tools...
  {
    name: 'register_worker',
    description: 'Register this worker instance for tracking',
    inputSchema: {
      type: 'object',
      properties: {
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
    name: 'list_workers',
    description: 'List all active workers',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Filter by workspace ID' },
        activeOnly: { type: 'boolean', description: 'Show only active workers (default: true)' }
      }
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
  {
    name: 'get_change_history',
    description: 'Get change history for a specific entity',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: { 
          type: 'string', 
          enum: ['project', 'todo', 'phase', 'document'],
          description: 'Type of entity to get history for' 
        },
        entityId: { type: 'string', description: 'ID of the entity' },
        limit: { type: 'number', description: 'Maximum number of changes to return (default: 20)' },
        since: { type: 'string', description: 'ISO date string to filter changes since' }
      },
      required: ['entityType', 'entityId']
    }
  },
  {
    name: 'get_recent_changes',
    description: 'Get recent changes in workspace or project',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Filter by workspace ID' },
        projectId: { type: 'string', description: 'Filter by project ID' },
        workerId: { type: 'string', description: 'Filter by worker ID' },
        limit: { type: 'number', description: 'Maximum number of changes to return (default: 20)' },
        since: { type: 'string', description: 'ISO date string to filter changes since' }
      }
    }
  },
  {
    name: 'get_worker_activity',
    description: 'Get activity summary for a worker',
    inputSchema: {
      type: 'object',
      properties: {
        workerId: { type: 'string', description: 'Worker ID (defaults to current worker)' },
        timeRange: { 
          type: 'string', 
          enum: ['hour', 'day', 'week', 'month'],
          description: 'Time range for activity summary (default: day)' 
        }
      }
    }
  },
  {
    name: 'get_collaboration_summary',
    description: 'Get collaboration summary for a project or workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to analyze' },
        workspaceId: { type: 'string', description: 'Workspace ID to analyze' },
        timeRange: { 
          type: 'string', 
          enum: ['hour', 'day', 'week', 'month'],
          description: 'Time range for analysis (default: day)' 
        }
      }
    }
  },
  {
    name: 'get_audit_stats',
    description: 'Get audit statistics for a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' }
      },
      required: ['workspaceId']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: 'text',
          text: 'Missing arguments'
        }
      ]
    };
  }

  try {
    switch (name) {
      // Worker management
      case 'register_worker': {
        const worker = await storage.registerWorker({
          name: args.name as string,
          capabilities: args.capabilities as string[],
          purpose: args.purpose as string
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Worker registered: ${worker.name || worker.id}\nSession: ${worker.sessionId}\nCapabilities: ${worker.capabilities.join(', ')}`
            }
          ]
        };
      }

      case 'list_workers': {
        const workers = await storage.listActiveWorkers();
        
        if (workers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No active workers found'
              }
            ]
          };
        }
        
        const workerList = workers.map(w => 
          `🤖 ${w.name || w.id}\n` +
          `   Session: ${w.sessionId}\n` +
          `   Started: ${w.startedAt.toISOString()}\n` +
          `   Last seen: ${w.lastSeen.toISOString()}\n` +
          `   Capabilities: ${w.capabilities.join(', ')}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Active Workers (${workers.length}):\n\n${workerList}`
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

      // Audit trail queries
      case 'get_change_history': {
        const history = await storage.getChangeHistory(
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
                text: `No change history found for ${args.entityType} ${args.entityId}`
              }
            ]
          };
        }
        
        const historyText = limitedHistory.map(change => 
          `📝 ${change.timestamp.toISOString()}\n` +
          `   Worker: ${change.workerId}\n` +
          `   Action: ${change.type}\n` +
          `   ${change.reason || 'No reason provided'}\n` +
          `   Duration: ${change.duration || 0}ms`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Change History for ${args.entityType} ${args.entityId} (${limitedHistory.length} changes):\n\n${historyText}`
            }
          ]
        };
      }

      case 'get_recent_changes': {
        const changes = await storage.getRecentChanges(
          args.workspaceId as string,
          args.projectId as string,
          args.workerId as string,
          args.limit as number
        );
        
        if (changes.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No recent changes found'
              }
            ]
          };
        }
        
        const changesText = changes.map(change => 
          `📝 ${change.timestamp.toISOString()}\n` +
          `   Worker: ${change.workerId}\n` +
          `   ${change.type} on ${change.entityType} ${change.entityId}\n` +
          `   ${change.reason || 'No reason provided'}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Recent Changes (${changes.length}):\n\n${changesText}`
            }
          ]
        };
      }

      case 'get_worker_activity': {
        const activity = await storage.getWorkerActivity(args.workerId as string);
        
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
                   `   • Status: ${activity.isActive ? '🟢 Active' : '🔴 Inactive'}`
            }
          ]
        };
      }

      case 'get_audit_stats': {
        const stats = await storage.getAuditStats(args.workspaceId as string);
        
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
              text: `Audit Statistics for workspace ${args.workspaceId}:\n\n` +
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

      // Standard project/todo operations
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
          phaseId: args.phaseId as string
        });
        
        if (!todo) {
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
              text: `✅ Created todo: ${todo.title} (ID: ${todo.id})`
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
          phaseId: args.phaseId as string
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
              text: `✅ Updated todo: ${todo.title} (Status: ${todo.status})`
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
  // Auto-register worker if not already registered
  const currentWorker = await storage.getCurrentWorker();
  if (!currentWorker) {
    console.log('🤖 Auto-registering worker...');
    await storage.registerWorker({
      name: 'Claude-Assistant',
      capabilities: ['todos', 'projects', 'collaboration'],
      purpose: 'General task management and collaboration'
    });
  }
  
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