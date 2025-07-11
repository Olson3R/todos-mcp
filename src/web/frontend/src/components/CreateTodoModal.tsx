import React, { useState, useMemo } from 'react';
import { X, Link, Check } from 'lucide-react';

// Application areas
type ApplicationArea = 
  | 'frontend' | 'backend' | 'database' | 'api'
  | 'auth' | 'infrastructure' | 'testing' | 'documentation'
  | 'ui/ux' | 'security' | 'performance' | 'deployment';

interface AreaConfig {
  id: ApplicationArea;
  name: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
  examples: string[];
}

const APPLICATION_AREAS: Record<ApplicationArea, AreaConfig> = {
  frontend: {
    id: 'frontend',
    name: 'Frontend',
    description: 'User interface, components, styling, and client-side logic',
    color: '#3B82F6',
    bgColor: 'bg-blue-50',
    icon: '🎨',
    examples: ['React components', 'CSS styling', 'User interactions']
  },
  backend: {
    id: 'backend',
    name: 'Backend',
    description: 'Server-side logic, business rules, and application services',
    color: '#10B981',
    bgColor: 'bg-green-50',
    icon: '⚙️',
    examples: ['Business logic', 'Service layer', 'Data processing']
  },
  database: {
    id: 'database',
    name: 'Database',
    description: 'Data models, migrations, queries, and database optimization',
    color: '#8B5CF6',
    bgColor: 'bg-purple-50',
    icon: '🗄️',
    examples: ['Schema design', 'Migrations', 'Query optimization']
  },
  api: {
    id: 'api',
    name: 'API',
    description: 'REST endpoints, GraphQL resolvers, and API contracts',
    color: '#F59E0B',
    bgColor: 'bg-amber-50',
    icon: '🔌',
    examples: ['REST endpoints', 'GraphQL schemas', 'API documentation']
  },
  auth: {
    id: 'auth',
    name: 'Authentication',
    description: 'User authentication, authorization, and security policies',
    color: '#EF4444',
    bgColor: 'bg-red-50',
    icon: '🔐',
    examples: ['Login/logout', 'JWT tokens', 'Role-based access']
  },
  infrastructure: {
    id: 'infrastructure',
    name: 'Infrastructure',
    description: 'Deployment, hosting, monitoring, and system architecture',
    color: '#6B7280',
    bgColor: 'bg-gray-50',
    icon: '🏗️',
    examples: ['Docker config', 'CI/CD pipelines', 'Cloud services']
  },
  testing: {
    id: 'testing',
    name: 'Testing',
    description: 'Unit tests, integration tests, and quality assurance',
    color: '#06B6D4',
    bgColor: 'bg-cyan-50',
    icon: '🧪',
    examples: ['Unit tests', 'Integration tests', 'E2E tests']
  },
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    description: 'Technical docs, API docs, user guides, and code comments',
    color: '#84CC16',
    bgColor: 'bg-lime-50',
    icon: '📚',
    examples: ['README files', 'API docs', 'User guides']
  },
  'ui/ux': {
    id: 'ui/ux',
    name: 'UI/UX',
    description: 'User experience design, wireframes, and interface design',
    color: '#EC4899',
    bgColor: 'bg-pink-50',
    icon: '🎯',
    examples: ['User flows', 'Wireframes', 'Design systems']
  },
  security: {
    id: 'security',
    name: 'Security',
    description: 'Security audits, vulnerability fixes, and security policies',
    color: '#DC2626',
    bgColor: 'bg-red-50',
    icon: '🛡️',
    examples: ['Security audits', 'Vulnerability patches', 'HTTPS setup']
  },
  performance: {
    id: 'performance',
    name: 'Performance',
    description: 'Optimization, caching, monitoring, and performance tuning',
    color: '#7C3AED',
    bgColor: 'bg-violet-50',
    icon: '⚡',
    examples: ['Performance optimization', 'Caching', 'Bundle size reduction']
  },
  deployment: {
    id: 'deployment',
    name: 'Deployment',
    description: 'Release management, deployment automation, and environment setup',
    color: '#059669',
    bgColor: 'bg-emerald-50',
    icon: '🚀',
    examples: ['Release automation', 'Environment config', 'Deployment scripts']
  }
};

// Define types directly in this file to avoid import issues  
interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  phaseId?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  dependsOn: string[];
  dependents: string[];
  blockedBy: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  areas: ApplicationArea[];
  primaryArea: ApplicationArea;
}

interface Phase {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
}

interface Document {
  id: string;
  type: 'link' | 'file' | 'confluence';
  title: string;
  url?: string;
  filePath?: string;
  confluenceSpace?: string;
  confluencePage?: string;
  projectId: string;
  createdAt: Date;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  todos: TodoItem[];
  phases: Phase[];
  documents: Document[];
  createdAt: Date;
  updatedAt: Date;
}

interface CreateTodoModalProps {
  projectId: string;
  projects: Project[];
  onClose: () => void;
  onCreate: (projectId: string, title: string, options: {
    description?: string;
    dependsOn?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
    estimatedDuration?: number;
    areas: ApplicationArea[];
    primaryArea?: ApplicationArea;
  }) => void;
}

export function CreateTodoModal({ projectId, projects, onClose, onCreate }: CreateTodoModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState<number | ''>('');
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<ApplicationArea[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Smart area suggestions based on content
  const suggestedAreas = useMemo(() => {
    const content = `${title} ${description}`.toLowerCase();
    const suggestions: ApplicationArea[] = [];
    
    // Keywords for each area
    const areaKeywords = {
      frontend: ['ui', 'component', 'react', 'css', 'styling', 'user interface', 'frontend', 'client'],
      backend: ['server', 'api endpoint', 'business logic', 'service', 'backend', 'server-side'],
      database: ['schema', 'migration', 'query', 'table', 'data model', 'database', 'sql'],
      api: ['endpoint', 'rest', 'graphql', 'request', 'response', 'api'],
      auth: ['login', 'authentication', 'authorization', 'security', 'token', 'auth'],
      infrastructure: ['docker', 'deployment', 'ci/cd', 'cloud', 'hosting', 'infrastructure'],
      testing: ['test', 'unit test', 'integration', 'e2e', 'testing', 'spec'],
      documentation: ['docs', 'documentation', 'readme', 'guide', 'manual'],
      'ui/ux': ['design', 'user experience', 'wireframe', 'mockup', 'ui/ux', 'user flow'],
      security: ['security', 'vulnerability', 'https', 'encryption', 'audit'],
      performance: ['performance', 'optimization', 'caching', 'speed', 'bundle'],
      deployment: ['deploy', 'release', 'environment', 'prod', 'staging']
    };

    // Check each area for keyword matches
    Object.entries(areaKeywords).forEach(([area, keywords]) => {
      if (keywords.some(keyword => content.includes(keyword))) {
        suggestions.push(area as ApplicationArea);
      }
    });

    return suggestions;
  }, [title, description]);

  const currentProject = projects.find(p => p.id === projectId);
  const availableTodos = currentProject?.todos.filter(todo => 
    todo.status !== 'completed' && todo.id !== 'temp-id'
  ) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedAreas.length === 0) return;

    setIsSubmitting(true);
    try {
      const options: any = {
        description: description.trim() || undefined,
        priority,
        dependsOn: selectedDependencies.length > 0 ? selectedDependencies : undefined,
        areas: selectedAreas,
        primaryArea: selectedAreas[0], // First selected area becomes primary
        notes: notes.trim() || undefined
      };

      if (estimatedDuration && typeof estimatedDuration === 'number') {
        options.estimatedDuration = estimatedDuration;
      }

      onCreate(projectId, title.trim(), options);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleArea = (area: ApplicationArea) => {
    setSelectedAreas(prev => 
      prev.includes(area) 
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  const applySuggestions = () => {
    setSelectedAreas(suggestedAreas);
  };

  const toggleDependency = (todoId: string) => {
    setSelectedDependencies(prev => 
      prev.includes(todoId) 
        ? prev.filter(id => id !== todoId)
        : [...prev, todoId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Create New Todo</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label htmlFor="todo-title" className="block text-sm font-medium text-gray-700 mb-2">
                Todo Title *
              </label>
              <input
                id="todo-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                placeholder="Enter todo title"
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="todo-description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="todo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-vertical"
                placeholder="Describe the todo (optional)"
              />
            </div>

            {/* Application Areas */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Application Areas *
                </label>
                {suggestedAreas.length > 0 && selectedAreas.length === 0 && (
                  <button
                    type="button"
                    onClick={applySuggestions}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Apply suggestions ({suggestedAreas.length})
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {Object.values(APPLICATION_AREAS).map((area) => {
                  const isSelected = selectedAreas.includes(area.id);
                  const isSuggested = suggestedAreas.includes(area.id);
                  
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => toggleArea(area.id)}
                      className={`
                        p-2 rounded-lg border-2 text-left transition-all duration-200 text-xs
                        ${isSelected 
                          ? 'border-blue-500 bg-blue-50 text-blue-900' 
                          : isSuggested
                          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }
                      `}
                      title={area.description}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-sm">{area.icon}</span>
                        <span className="font-medium">{area.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
                        {isSuggested && !isSelected && (
                          <span className="text-xs text-amber-600 ml-auto">✨</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 leading-tight">
                        {area.examples[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {selectedAreas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedAreas.map((areaId, index) => {
                    const area = APPLICATION_AREAS[areaId];
                    return (
                      <span
                        key={areaId}
                        className={`
                          inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                          ${index === 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}
                        `}
                      >
                        {area.icon} {area.name}
                        {index === 0 && <span className="text-xs">(primary)</span>}
                      </span>
                    );
                  })}
                </div>
              )}
              
              {selectedAreas.length === 0 && (
                <div className="text-xs text-red-600 mt-2">
                  Please select at least one application area.
                </div>
              )}
              
              {selectedAreas.length > 3 && (
                <div className="text-xs text-amber-600 mt-2">
                  ⚠️ This todo affects many areas. Consider splitting into focused tasks.
                </div>
              )}
            </div>

            {/* Priority and Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="todo-priority" className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  id="todo-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label htmlFor="todo-duration" className="block text-sm font-medium text-gray-700 mb-2">
                  Duration (min)
                </label>
                <input
                  id="todo-duration"
                  type="number"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                  placeholder="Est. minutes"
                  min="1"
                />
              </div>
            </div>

            {/* Dependencies */}
            {availableTodos.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Link className="w-4 h-4 inline mr-2" />
                  Dependencies (optional)
                </label>
                <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {availableTodos.map((todo) => (
                    <label key={todo.id} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDependencies.includes(todo.id)}
                        onChange={() => toggleDependency(todo.id)}
                        className="mt-1 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{todo.title}</div>
                        <div className="text-xs text-gray-500">
                          {todo.status} • {todo.priority}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedDependencies.length > 0 && (
                  <div className="text-xs text-gray-600 mt-2">
                    This todo will be blocked until {selectedDependencies.length} dependent todo{selectedDependencies.length !== 1 ? 's are' : ' is'} completed.
                  </div>
                )}
              </div>
            )}
            
            {/* Notes */}
            <div>
              <label htmlFor="todo-notes" className="block text-sm font-medium text-gray-700 mb-2">
                <span className="inline-block mr-2">📝</span>
                Notes (optional)
              </label>
              <textarea
                id="todo-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-vertical"
                placeholder="Add any additional notes or context for this todo"
              />
              <p className="text-xs text-gray-500 mt-1">
                Notes are visible to all team members and can help provide context
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || selectedAreas.length === 0 || isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Todo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}