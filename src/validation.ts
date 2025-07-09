export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateProjectName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ValidationError('Project name cannot be empty');
  }
  if (name.length > 100) {
    throw new ValidationError('Project name cannot exceed 100 characters');
  }
}

export function validateWorkspacePath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new ValidationError('Workspace path cannot be empty');
  }
  if (!path.startsWith('/')) {
    throw new ValidationError('Workspace path must be absolute');
  }
}

export function validateTodoTitle(title: string): void {
  if (!title || title.trim().length === 0) {
    throw new ValidationError('Todo title cannot be empty');
  }
  if (title.length > 200) {
    throw new ValidationError('Todo title cannot exceed 200 characters');
  }
}

export function validateTodoStatus(status: string): void {
  const validStatuses = ['pending', 'in-progress', 'completed'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid todo status. Must be one of: ${validStatuses.join(', ')}`);
  }
}

export function validateDocumentType(type: string): void {
  const validTypes = ['link', 'file', 'confluence'];
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid document type. Must be one of: ${validTypes.join(', ')}`);
  }
}

export function validateDocumentData(type: string, data: any): void {
  validateDocumentType(type);
  
  switch (type) {
    case 'link':
      if (!data.url) {
        throw new ValidationError('URL is required for link documents');
      }
      try {
        new URL(data.url);
      } catch {
        throw new ValidationError('Invalid URL format');
      }
      break;
    case 'file':
      if (!data.filePath) {
        throw new ValidationError('File path is required for file documents');
      }
      break;
    case 'confluence':
      if (!data.confluenceSpace && !data.confluencePage) {
        throw new ValidationError('Confluence space or page is required for confluence documents');
      }
      break;
  }
}

export function validatePhaseName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ValidationError('Phase name cannot be empty');
  }
  if (name.length > 100) {
    throw new ValidationError('Phase name cannot exceed 100 characters');
  }
}

export function validateUUID(id: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError('Invalid UUID format');
  }
}