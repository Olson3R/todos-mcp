# New File Structure Design

## Overview

Moving from a single monolithic JSON file to a project-based file structure with proper organization in the user's home directory.

## Current Structure
```
todos-data.json (in current working directory)
└── All workspaces, projects, todos, etc.
```

## New Structure
```
~/.claude-todos-mcp/
├── config.json                    # Global configuration
├── data/
│   ├── workspace1/
│   │   ├── workspace.json         # Workspace metadata
│   │   ├── project-abc123.json    # Individual project file
│   │   ├── project-def456.json    # Individual project file
│   │   └── ...
│   ├── workspace2/
│   │   ├── workspace.json
│   │   ├── project-ghi789.json
│   │   └── ...
│   └── ...
└── backups/                       # Automatic backups
    └── 2024-01-10-120000/
        └── ... (backup files)
```

## File Formats

### workspace.json
```json
{
  "id": "workspace-uuid",
  "path": "/absolute/path/to/workspace",
  "name": "My Workspace",
  "createdAt": "2024-01-10T12:00:00Z",
  "updatedAt": "2024-01-10T12:00:00Z",
  "projectIds": ["project-abc123", "project-def456"]
}
```

### project-{id}.json
```json
{
  "id": "project-abc123",
  "workspaceId": "workspace-uuid",
  "name": "My Project",
  "description": "Project description",
  "createdAt": "2024-01-10T12:00:00Z",
  "updatedAt": "2024-01-10T12:00:00Z",
  "phases": [
    {
      "id": "phase-uuid",
      "name": "Phase 1",
      "description": "Phase description",
      "order": 1
    }
  ],
  "todos": [
    {
      "id": "todo-uuid",
      "title": "Todo item",
      "description": "Todo description",
      "status": "pending",
      "phaseId": "phase-uuid",
      "createdAt": "2024-01-10T12:00:00Z",
      "updatedAt": "2024-01-10T12:00:00Z",
      "order": 1
    }
  ],
  "documents": [
    {
      "id": "doc-uuid",
      "type": "link",
      "title": "Design Doc",
      "url": "https://example.com/doc"
    }
  ]
}
```

### config.json
```json
{
  "version": "2.0.0",
  "dataDirectory": "~/.claude-todos-mcp/data",
  "backupEnabled": true,
  "backupRetentionDays": 30,
  "features": {
    "dependencies": false,
    "concurrentWork": false
  }
}
```

## Benefits

1. **Better Performance**: Only load/save projects that are being modified
2. **Concurrent Access**: Multiple instances can work on different projects without conflicts
3. **Atomic Operations**: Project-level updates are atomic
4. **Easy Backup**: Can backup individual projects
5. **Workspace Isolation**: Clear separation between workspaces
6. **Scalability**: Can handle thousands of projects without loading all into memory

## Migration Strategy

### Automatic Migration
When the old `todos-data.json` is detected:
1. Read the old format
2. Create directory structure
3. Split data into separate files
4. Archive the old file
5. Use new structure going forward

### Manual Migration Command
```bash
todos-mcp migrate --source ./todos-data.json --backup
```

## Implementation Changes

### Storage Layer Updates
- Change from single file read/write to directory-based operations
- Implement file locking for concurrent access
- Add caching layer for frequently accessed projects
- Implement lazy loading of project data

### Path Resolution
```typescript
class StoragePaths {
  private homeDir = os.homedir();
  private baseDir = path.join(this.homeDir, '.claude-todos-mcp');
  
  get dataDir(): string {
    return path.join(this.baseDir, 'data');
  }
  
  getWorkspaceDir(workspaceId: string): string {
    return path.join(this.dataDir, workspaceId);
  }
  
  getProjectFile(workspaceId: string, projectId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), `project-${projectId}.json`);
  }
  
  getWorkspaceFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), 'workspace.json');
  }
}
```

### File Operations
```typescript
class FileOperations {
  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.paths.baseDir, { recursive: true });
    await fs.mkdir(this.paths.dataDir, { recursive: true });
  }
  
  async readProject(workspaceId: string, projectId: string): Promise<Project> {
    const filePath = this.paths.getProjectFile(workspaceId, projectId);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  }
  
  async writeProject(workspaceId: string, project: Project): Promise<void> {
    const filePath = this.paths.getProjectFile(workspaceId, project.id);
    const tempPath = `${filePath}.tmp`;
    
    // Write to temp file first
    await fs.writeFile(tempPath, JSON.stringify(project, null, 2));
    
    // Atomic rename
    await fs.rename(tempPath, filePath);
  }
  
  async deleteProject(workspaceId: string, projectId: string): Promise<void> {
    const filePath = this.paths.getProjectFile(workspaceId, projectId);
    await fs.unlink(filePath);
  }
}
```

## Backward Compatibility

1. Check for old `todos-data.json` on startup
2. If found, offer to migrate
3. Keep migration code for 6 months
4. Version field in config.json for future migrations

## Security Considerations

1. Files stored in user home directory (proper permissions)
2. No sensitive data in filenames
3. Validate all file paths to prevent directory traversal
4. Use atomic writes to prevent corruption

## Future Extensions

1. **Compression**: Gzip project files over certain size
2. **Encryption**: Optional encryption for sensitive projects
3. **Sync**: Cloud sync capability
4. **Export**: Easy export of single projects
5. **Import**: Import projects from other sources