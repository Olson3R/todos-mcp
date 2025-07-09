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

Then visit `http://localhost:3000` to use the web interface.

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