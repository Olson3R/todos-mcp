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
import { TodosStorageV2 } from './storage-v2.js';
import { ValidationError } from './validation.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Check if migration is needed
async function checkMigration(): Promise<void> {
  const oldDataPath = path.join(process.cwd(), 'todos-data.json');
  
  try {
    await fs.access(oldDataPath);
    console.error('⚠️  Old data format detected!');
    console.error('Please run migration first: npm run migrate');
    console.error('Then update your MCP configuration to use todos-mcp-v2');
    process.exit(1);
  } catch {
    // No old data file, good to go
  }
}

const storage = new TodosStorageV2();

const server = new Server(
  {
    name: 'todos-mcp',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
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
    name: 'list_projects',
    description: 'List all projects in the current workspace or all workspaces',
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
    name: 'update_project',
    description: 'Update project details',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New project description' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'delete_project',
    description: 'Delete a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'create_phase',
    description: 'Create a new phase in a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Phase name' },
        description: { type: 'string', description: 'Phase description' }
      },
      required: ['projectId', 'name']
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
    name: 'reorder_todos',
    description: 'Reorder todo items in a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        todoIds: { type: 'array', items: { type: 'string' }, description: 'Array of todo IDs in new order' }
      },
      required: ['projectId', 'todoIds']
    }
  },
  {
    name: 'attach_document',
    description: 'Attach a document to a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        type: { type: 'string', enum: ['link', 'file', 'confluence'], description: 'Document type' },
        title: { type: 'string', description: 'Document title' },
        url: { type: 'string', description: 'URL (for link type)' },
        filePath: { type: 'string', description: 'File path (for file type)' },
        confluenceSpace: { type: 'string', description: 'Confluence space' },
        confluencePage: { type: 'string', description: 'Confluence page name' }
      },
      required: ['projectId', 'type', 'title']
    }
  },
  {
    name: 'remove_document',
    description: 'Remove a document from a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        documentId: { type: 'string', description: 'Document ID' }
      },
      required: ['projectId', 'documentId']
    }
  },
  {
    name: 'list_workspaces',
    description: 'List all workspaces',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'migrate_from_v1',
    description: 'Migrate data from old format to new format',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: { type: 'string', description: 'Path to old todos-data.json file (optional)' }
      }
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
              text: `Created project: ${project.name} (ID: ${project.id})`
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
                text: 'Project not found'
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

      case 'update_project': {
        const updates: any = {};
        if (args.name) updates.name = args.name as string;
        if (args.description) updates.description = args.description as string;
        
        const project = await storage.updateProject(args.projectId as string, updates);
        if (!project) {
          return {
            content: [
              {
                type: 'text',
                text: 'Project not found'
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Updated project: ${project.name}`
            }
          ]
        };
      }

      case 'delete_project': {
        const success = await storage.deleteProject(args.projectId as string);
        return {
          content: [
            {
              type: 'text',
              text: success ? 'Project deleted' : 'Project not found'
            }
          ]
        };
      }

      case 'create_phase': {
        const phase = await storage.createPhase({
          projectId: args.projectId as string,
          name: args.name as string,
          description: args.description as string
        });
        if (!phase) {
          return {
            content: [
              {
                type: 'text',
                text: 'Project not found'
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Created phase: ${phase.name} (ID: ${phase.id})`
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
          areas: ['backend'], // Default area for backwards compatibility
          primaryArea: 'backend',
          notes: args.notes as string
        });
        if (!todo) {
          return {
            content: [
              {
                type: 'text',
                text: 'Project not found'
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Created todo: ${todo.title} (ID: ${todo.id})`
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
                text: 'Todo not found'
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Updated todo: ${todo.title}`
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
              text: success ? 'Todo deleted' : 'Todo not found'
            }
          ]
        };
      }

      case 'reorder_todos': {
        const success = await storage.reorderTodos({
          projectId: args.projectId as string,
          todoIds: args.todoIds as string[]
        });
        return {
          content: [
            {
              type: 'text',
              text: success ? 'Todos reordered' : 'Project not found'
            }
          ]
        };
      }

      case 'attach_document': {
        const document = await storage.attachDocument({
          projectId: args.projectId as string,
          type: args.type as 'link' | 'file' | 'confluence',
          title: args.title as string,
          url: args.url as string,
          filePath: args.filePath as string,
          confluenceSpace: args.confluenceSpace as string,
          confluencePage: args.confluencePage as string
        });
        if (!document) {
          return {
            content: [
              {
                type: 'text',
                text: 'Project not found'
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Attached document: ${document.title} (ID: ${document.id})`
            }
          ]
        };
      }

      case 'remove_document': {
        const success = await storage.removeDocument(args.projectId as string, args.documentId as string);
        return {
          content: [
            {
              type: 'text',
              text: success ? 'Document removed' : 'Document not found'
            }
          ]
        };
      }

      case 'list_workspaces': {
        const workspaces = await storage.listWorkspaces();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workspaces, null, 2)
            }
          ]
        };
      }

      case 'migrate_from_v1': {
        await storage.migrateFromV1(args.sourcePath as string);
        return {
          content: [
            {
              type: 'text',
              text: 'Migration completed successfully! Data is now stored in ~/.claude-todos-mcp/data/'
            }
          ]
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`
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
          text: errorMessage
        }
      ]
    };
  }
});

async function main() {
  await checkMigration();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);