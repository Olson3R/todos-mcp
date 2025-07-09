# Adding todos-mcp to Claude Desktop

This guide explains how to add the todos-mcp server to Claude Desktop using the `claude mcp add-json` command.

## Installation

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
         "args": ["${PWD}/dist/index.js"]
       }
     }
   }
   EOF
   ```

## Verifying the Installation

1. Restart Claude Desktop after adding the configuration
2. In a new conversation, you should have access to the following MCP tools:
   - `create_project`
   - `list_projects`
   - `get_project`
   - `update_project`
   - `delete_project`
   - `create_phase`
   - `create_todo`
   - `update_todo`
   - `delete_todo`
   - `reorder_todos`
   - `attach_document`
   - `remove_document`
   - `list_workspaces`

## Usage Example

Once installed, you can ask Claude to:
- "Create a new project called 'My Project'"
- "List all my projects"
- "Create a todo item in my project"
- "Show me all workspaces"

## Troubleshooting

- If the MCP server doesn't appear in Claude, ensure the path in the configuration is absolute
- Check that the project has been built (`npm run build`)
- Verify Node.js is installed and accessible from your PATH
- The server stores data in `todos-data.json` in the current working directory

## Optional: Web Interface

You can also run the web interface alongside Claude:

```bash
npm run web
```

This will start a web server at http://localhost:3000 for a visual interface to your todos.