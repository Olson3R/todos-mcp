import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Link, AlertCircle, CheckCircle, Clock, ArrowRight, Eye } from 'lucide-react';

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

interface ProjectCardProps {
  project: Project;
  onCreateTodo: (projectId: string) => void;
  onUpdateTodo: (id: string, updates: { status?: string }) => void;
}

export function ProjectCard({ project, onCreateTodo, onUpdateTodo }: ProjectCardProps) {
  const navigate = useNavigate();
  const { workspacePath } = useParams<{ workspacePath: string }>();
  const getStatusColors = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-400 bg-green-50';
      case 'in-progress':
        return 'border-orange-400 bg-orange-50';
      default:
        return 'border-gray-300 bg-white';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'in-progress':
        return <Clock className="w-4 h-4 text-orange-600" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const toggleTodoStatus = (todo: TodoItem) => {
    const nextStatus = {
      'pending': 'in-progress',
      'in-progress': 'completed',
      'completed': 'pending'
    }[todo.status] || 'pending';

    onUpdateTodo(todo.id, { status: nextStatus });
  };

  const sortedTodos = [...project.todos].sort((a, b) => a.order - b.order);
  const completedTodos = sortedTodos.filter(t => t.status === 'completed').length;
  const inProgressTodos = sortedTodos.filter(t => t.status === 'in-progress').length;
  const pendingTodos = sortedTodos.filter(t => t.status === 'pending').length;
  const totalTodos = sortedTodos.length;
  const completedPercent = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;
  const inProgressPercent = totalTodos > 0 ? (inProgressTodos / totalTodos) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Project Header */}
      <div className="bg-blue-600 text-white p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">{project.name}</h3>
            {project.description && (
              <p className="text-blue-100 text-sm mb-4">{project.description}</p>
            )}
            
            {/* Multi-part Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-blue-500 rounded-full h-2 overflow-hidden">
                <div className="flex h-full">
                  {/* Completed segment */}
                  <div 
                    className="bg-green-400 transition-all duration-300"
                    style={{ width: `${completedPercent}%` }}
                  />
                  {/* In-progress segment */}
                  <div 
                    className="bg-orange-400 transition-all duration-300"
                    style={{ width: `${inProgressPercent}%` }}
                  />
                  {/* Pending remains as background (blue-500) */}
                </div>
              </div>
              <span className="text-xs text-blue-100">
                {completedTodos}✓ {inProgressTodos}⏳ {pendingTodos}⏸ 
              </span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/workspace/${encodeURIComponent(workspacePath!)}/project/${project.id}`)}
              className="p-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors"
              title="View Project"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => onCreateTodo(project.id)}
              className="p-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors"
              title="Add Todo"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Todos List */}
      <div className="p-6">
        {sortedTodos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-sm">No todos yet</div>
            <button
              onClick={() => onCreateTodo(project.id)}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Add your first todo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedTodos.slice(0, 5).map((todo) => (
              <div
                key={todo.id}
                className={`
                  p-3 rounded-lg border-l-4 cursor-pointer transition-all duration-200
                  ${getStatusColors(todo.status)}
                  hover:shadow-sm
                  ${todo.blockedBy.length > 0 ? 'opacity-60' : ''}
                `}
                onClick={() => !todo.blockedBy.length && toggleTodoStatus(todo)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(todo.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">
                      {todo.title}
                    </div>
                    
                    {todo.description && (
                      <div className="text-xs text-gray-600 mt-1">
                        {todo.description}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      {/* Priority Badge */}
                      <span className={`
                        inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${getPriorityColor(todo.priority)}
                      `}>
                        {todo.priority}
                      </span>
                      
                      {/* Dependencies */}
                      {todo.dependsOn.length > 0 && (
                        <div className="flex items-center text-xs text-gray-500">
                          <Link className="w-3 h-3 mr-1" />
                          {todo.dependsOn.length} dep{todo.dependsOn.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      
                      {/* Blocked indicator */}
                      {todo.blockedBy.length > 0 && (
                        <div className="flex items-center text-xs text-red-600">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Blocked
                        </div>
                      )}
                      
                      {/* Duration estimate */}
                      {todo.estimatedDuration && (
                        <div className="text-xs text-gray-500">
                          ~{todo.estimatedDuration}min
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {sortedTodos.length > 5 && (
              <div className="text-center pt-2 text-sm text-gray-500">
                +{sortedTodos.length - 5} more todo{sortedTodos.length - 5 !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phases */}
      {project.phases.length > 0 && (
        <div className="px-6 pb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Phases</h4>
          <div className="flex gap-2 flex-wrap">
            {project.phases.map((phase) => (
              <span
                key={phase.id}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
              >
                {phase.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {project.documents.length > 0 && (
        <div className="px-6 pb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Documents</h4>
          <div className="flex gap-2 flex-wrap">
            {project.documents.map((doc) => (
              <span
                key={doc.id}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
              >
                {doc.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}