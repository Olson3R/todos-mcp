# Todo MCP Server

A TypeScript MCP (Model Context Protocol) server for managing todo lists with projects and document attachments.

## Features

- **Projects**: Create and manage projects with unique names within workspaces
- **Workspaces**: Associate projects with Claude Code directories
- **Todo Items**: Add, update, delete, and reorder todo items with status tracking
- **Phases**: Organize todos into optional phases within projects
- **Documents**: Attach links, files, or Confluence pages to projects
- **Status Management**: Only one todo can be in-progress at a time
- **Web Interface**: Human-friendly web UI for CRUD operations

## Installation

```bash
npm install
```

## MCP Setup for Claude Desktop

### Option 1: Global Installation (Recommended)

1. Build and install globally:
   ```bash
   npm install
   npm run build
   npm i -g .
   ```

2. Add to Claude Desktop:
   ```bash
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

### Option 2: Local Installation

1. Build the project:
   ```bash
   npm install
   npm run build
   ```

2. Add to Claude Desktop with full path:
   ```bash
   claude mcp add-json <<EOF
   {
     "mcpServers": {
       "todos-mcp": {
         "command": "node",
         "args": ["${PWD}/dist/index-scoped.js"]
       }
     }
   }
   EOF
   ```

### Verifying MCP Installation

1. Restart Claude Desktop after adding the configuration
2. In a new conversation, you should have access to all MCP tools listed below
3. Test with: "Create a new project called 'My Project'" or "List all my projects"

### Troubleshooting MCP Setup

- If the MCP server doesn't appear in Claude, ensure the path in the configuration is absolute
- Check that the project has been built (`npm run build`)
- Verify Node.js is installed and accessible from your PATH
- The server stores data in `todos-data.json` in the current working directory

## Usage

### MCP Server

Build and run the MCP server:

```bash
npm run build
npm start
```

Or run in development mode:

```bash
npm run dev
```

### Web Interface

Start the web server:

```bash
npm run web
```

Then visit `http://localhost:3003` to use the web interface.

### Usage Examples

Once the MCP server is installed in Claude Desktop, you can ask Claude to:
- "Create a new project called 'My Project'"
- "List all my projects"
- "Create a todo item in my project"
- "Show me all workspaces"
- "Update a todo's status to completed"

## MCP Tools

The server provides the following MCP tools:

- `create_project` - Create a new project
- `list_projects` - List all projects
- `get_project` - Get project details
- `update_project` - Update project details
- `delete_project` - Delete a project
- `create_phase` - Create a phase in a project
- `create_todo` - Create a todo item
- `update_todo` - Update a todo item
- `delete_todo` - Delete a todo item
- `reorder_todos` - Reorder todos in a project
- `attach_document` - Attach a document to a project
- `remove_document` - Remove a document from a project
- `list_workspaces` - List all workspaces

## Data Structure

Projects are organized as follows:

```
Workspace (Claude Code directory)
├── Project 1
│   ├── Phase A
│   │   ├── Todo 1 (pending)
│   │   └── Todo 2 (in-progress)
│   ├── Phase B
│   │   └── Todo 3 (completed)
│   └── Documents
│       ├── Link: Design Doc
│       ├── File: requirements.md
│       └── Confluence: Architecture
└── Project 2
    └── ...
```

## Todo Status

- `pending` - Not started
- `in-progress` - Currently being worked on (only one allowed)
- `completed` - Finished

## Document Types

- `link` - Web URL
- `file` - Relative file path
- `confluence` - Confluence page (space + page name or link)

## Configuration

The server stores data in `todos-data.json` in the current working directory by default.

## Documentation

Additional documentation can be found in the `docs/` directory:

- `CONCURRENT_WORK_STRATEGY.md` - Multi-worker coordination strategies
- `DEPENDENCY_GRAPH_DESIGN.md` - Todo dependency management
- `DEPENDENCY_IMPLEMENTATION_SUMMARY.md` - Implementation details
- `MULTI_CLAUDE_WORKFLOW.md` - Multi-Claude workflow patterns
- `NEW_FILE_STRUCTURE.md` - Project file organization
- `SCOPED_DATA_DESIGN.md` - Scoped data architecture
- `STATE_CHANGE_TRACKING_DESIGN.md` - Change tracking system
- `WEBSITE_UPGRADE_PLAN.md` - Web interface upgrade plan

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
```