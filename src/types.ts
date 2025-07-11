// Application areas that todos can affect
export type ApplicationArea = 
  | 'frontend' 
  | 'backend' 
  | 'database' 
  | 'api'
  | 'auth' 
  | 'infrastructure' 
  | 'testing' 
  | 'documentation'
  | 'ui/ux' 
  | 'security' 
  | 'performance' 
  | 'deployment';

// Area configuration with visual properties
export interface AreaConfig {
  id: ApplicationArea;
  name: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
  examples: string[];
}

export const APPLICATION_AREAS: Record<ApplicationArea, AreaConfig> = {
  frontend: {
    id: 'frontend',
    name: 'Frontend',
    description: 'User interface, components, styling, and client-side logic',
    color: '#3B82F6',
    bgColor: 'bg-blue-50',
    icon: '🎨',
    examples: ['React components', 'CSS styling', 'User interactions', 'Client routing']
  },
  backend: {
    id: 'backend',
    name: 'Backend',
    description: 'Server-side logic, business rules, and application services',
    color: '#10B981',
    bgColor: 'bg-green-50',
    icon: '⚙️',
    examples: ['Business logic', 'Service layer', 'Data processing', 'Server configuration']
  },
  database: {
    id: 'database',
    name: 'Database',
    description: 'Data models, migrations, queries, and database optimization',
    color: '#8B5CF6',
    bgColor: 'bg-purple-50',
    icon: '🗄️',
    examples: ['Schema design', 'Migrations', 'Query optimization', 'Data modeling']
  },
  api: {
    id: 'api',
    name: 'API',
    description: 'REST endpoints, GraphQL resolvers, and API contracts',
    color: '#F59E0B',
    bgColor: 'bg-amber-50',
    icon: '🔌',
    examples: ['REST endpoints', 'GraphQL schemas', 'API documentation', 'Request/response handling']
  },
  auth: {
    id: 'auth',
    name: 'Authentication',
    description: 'User authentication, authorization, and security policies',
    color: '#EF4444',
    bgColor: 'bg-red-50',
    icon: '🔐',
    examples: ['Login/logout', 'JWT tokens', 'Role-based access', 'Session management']
  },
  infrastructure: {
    id: 'infrastructure',
    name: 'Infrastructure',
    description: 'Deployment, hosting, monitoring, and system architecture',
    color: '#6B7280',
    bgColor: 'bg-gray-50',
    icon: '🏗️',
    examples: ['Docker configuration', 'CI/CD pipelines', 'Cloud services', 'Monitoring setup']
  },
  testing: {
    id: 'testing',
    name: 'Testing',
    description: 'Unit tests, integration tests, and quality assurance',
    color: '#06B6D4',
    bgColor: 'bg-cyan-50',
    icon: '🧪',
    examples: ['Unit tests', 'Integration tests', 'E2E tests', 'Test automation']
  },
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    description: 'Technical docs, API docs, user guides, and code comments',
    color: '#84CC16',
    bgColor: 'bg-lime-50',
    icon: '📚',
    examples: ['README files', 'API documentation', 'User guides', 'Code comments']
  },
  'ui/ux': {
    id: 'ui/ux',
    name: 'UI/UX',
    description: 'User experience design, wireframes, and interface design',
    color: '#EC4899',
    bgColor: 'bg-pink-50',
    icon: '🎯',
    examples: ['User flows', 'Wireframes', 'Design systems', 'Accessibility improvements']
  },
  security: {
    id: 'security',
    name: 'Security',
    description: 'Security audits, vulnerability fixes, and security policies',
    color: '#DC2626',
    bgColor: 'bg-red-50',
    icon: '🛡️',
    examples: ['Security audits', 'Vulnerability patches', 'HTTPS setup', 'Data encryption']
  },
  performance: {
    id: 'performance',
    name: 'Performance',
    description: 'Optimization, caching, monitoring, and performance tuning',
    color: '#7C3AED',
    bgColor: 'bg-violet-50',
    icon: '⚡',
    examples: ['Performance optimization', 'Caching strategies', 'Bundle size reduction', 'Database optimization']
  },
  deployment: {
    id: 'deployment',
    name: 'Deployment',
    description: 'Release management, deployment automation, and environment setup',
    color: '#059669',
    bgColor: 'bg-emerald-50',
    icon: '🚀',
    examples: ['Release automation', 'Environment configuration', 'Deployment scripts', 'Rollback procedures']
  }
};

// Helper functions for areas
export const getAreaConfig = (area: ApplicationArea): AreaConfig => APPLICATION_AREAS[area];
export const getAllAreas = (): ApplicationArea[] => Object.keys(APPLICATION_AREAS) as ApplicationArea[];

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  // Dependency graph fields
  dependsOn: string[];  // Array of todo IDs this todo depends on
  dependents: string[]; // Array of todo IDs that depend on this todo (computed field)
  blockedBy: string[];  // Array of todo IDs currently blocking this todo (computed field)
  estimatedDuration?: number; // Estimated time in minutes
  actualDuration?: number;    // Actual time spent in minutes
  priority: 'low' | 'medium' | 'high' | 'critical';
  // Application areas
  areas: ApplicationArea[];        // Multiple areas this todo affects
  primaryArea: ApplicationArea;    // Main area for categorization and coloring
  // Documentation fields
  notes?: string;                  // Additional notes/context for the todo
  completionSummary?: string;      // Summary of changes when completed
  completedAt?: Date;              // When the todo was completed
  startedAt?: Date;                // When the todo was moved to in-progress
}

export interface Phase {
  id: string;
  name: string;
  description?: string;
  order: number;
  projectId: string;
}

export interface Document {
  id: string;
  type: 'link' | 'file' | 'confluence';
  title: string;
  url?: string;
  filePath?: string;
  confluenceSpace?: string;
  confluencePage?: string;
  createdAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  phases: Phase[];
  todos: TodoItem[];
  documents: Document[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  projects: Project[];
  createdAt: Date;
}

export interface TodosData {
  workspaces: Workspace[];
  lastUpdated: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspacePath: string;
}

export interface CreateTodoRequest {
  title: string;
  description?: string;
  projectId: string;
  phaseId?: string;
  dependsOn?: string[];
  estimatedDuration?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  areas: ApplicationArea[];        // Required: areas this todo affects
  primaryArea?: ApplicationArea;   // Optional: will default to first area if not specified
  notes?: string;                  // Optional notes/context for the todo
}

export interface UpdateTodoRequest {
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  dependsOn?: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  notes?: string;
  completionSummary?: string;  // Required when status changes to 'completed'
}

export interface CreatePhaseRequest {
  name: string;
  description?: string;
  projectId: string;
}

export interface AttachDocumentRequest {
  projectId: string;
  type: 'link' | 'file' | 'confluence';
  title: string;
  url?: string;
  filePath?: string;
  confluenceSpace?: string;
  confluencePage?: string;
}

export interface ReorderTodosRequest {
  projectId: string;
  todoIds: string[];
}

// Dependency management interfaces
export interface AddDependencyRequest {
  todoId: string;
  dependsOnId: string;
}

export interface RemoveDependencyRequest {
  todoId: string;
  dependsOnId: string;
}

export interface DependencyGraphNode {
  todo: TodoItem;
  dependencies: TodoItem[];
  dependents: TodoItem[];
  isBlocked: boolean;
  canStart: boolean;
  depth: number;
}

export interface DependencyGraphResult {
  nodes: DependencyGraphNode[];
  readyToWork: TodoItem[];
  blocked: TodoItem[];
  cycles: string[][];
  criticalPath: TodoItem[];
}

export interface WorkAllocationResult {
  assignedTodos: { workerId: string; todos: TodoItem[] }[];
  unassignedTodos: TodoItem[];
  conflicts: { todoId: string; reason: string }[];
}