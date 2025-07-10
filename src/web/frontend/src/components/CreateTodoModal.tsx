import React, { useState } from 'react';
import { X, Link } from 'lucide-react';

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
  }) => void;
}

export function CreateTodoModal({ projectId, projects, onClose, onCreate }: CreateTodoModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState<number | ''>('');
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentProject = projects.find(p => p.id === projectId);
  const availableTodos = currentProject?.todos.filter(todo => 
    todo.status !== 'completed' && todo.id !== 'temp-id'
  ) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const options: any = {
        description: description.trim() || undefined,
        priority,
        dependsOn: selectedDependencies.length > 0 ? selectedDependencies : undefined
      };

      if (estimatedDuration && typeof estimatedDuration === 'number') {
        options.estimatedDuration = estimatedDuration;
      }

      onCreate(projectId, title.trim(), options);
    } finally {
      setIsSubmitting(false);
    }
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
              disabled={!title.trim() || isSubmitting}
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