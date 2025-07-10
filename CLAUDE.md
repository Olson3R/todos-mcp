# Claude Development Instructions

This file contains project-specific instructions for Claude when working on the todos-mcp project.

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server for managing todo lists with projects, workspaces, and real-time collaboration features.

## Key Architecture

- **Main Entry Point**: `src/index-scoped.ts` - The primary MCP server
- **Web Server**: `src/web/server-scoped.ts` - Express server running on port 3003
- **Storage**: `src/scoped-storage.ts` - Scoped data storage with workspace isolation
- **Types**: `src/types.ts` and `src/tracking-types.ts` - Core type definitions
- **Frontend**: `src/web/frontend/` - React/TypeScript web interface

## Development Commands

```bash
# Build the project
npm run build

# Run MCP server in development
npm run dev

# Run web server (port 3003)
npm run web

# Run both web server and frontend dev server
npm run web:dev

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Important Notes

1. **Port Configuration**: Web server runs on port 3003 (not 3000)
2. **Main File**: Use `index-scoped.ts` as the main entry point, not `index.ts`
3. **Documentation**: All design docs are in the `docs/` directory
4. **Storage**: Uses scoped storage system with workspace isolation
5. **Real-time**: Web interface supports WebSocket connections for live updates

## Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Prefer functional programming patterns
- Use proper error handling with try/catch blocks
- Include proper type annotations

## Testing Strategy

- Test MCP tools through Claude Desktop integration
- Test web interface at http://localhost:3003
- Verify real-time features with multiple browser tabs
- Test workspace isolation with different directory contexts

## File Structure

```
src/
├── index-scoped.ts          # Main MCP server
├── scoped-storage.ts        # Storage layer
├── types.ts                 # Core types
├── tracking-types.ts        # Change tracking types
├── web/
│   ├── server-scoped.ts     # Web server
│   ├── frontend/            # React frontend
│   └── shared/              # Shared types
└── prototype/               # Experimental features
```

## Common Tasks

### Adding New MCP Tools
1. Add tool definition to `index-scoped.ts`
2. Implement handler function
3. Update types in `types.ts` if needed
4. Test through Claude Desktop

### Adding Web API Endpoints
1. Add route to `server-scoped.ts`
2. Implement handler with proper error handling
3. Update frontend if needed
4. Test at http://localhost:3003

### Modifying Storage
1. Update `scoped-storage.ts`
2. Ensure workspace isolation is maintained
3. Update types if schema changes
4. Test data persistence