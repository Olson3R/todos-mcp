import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { Settings, Users, Activity, FolderOpen, Plus } from 'lucide-react';
import { WorkerStatusDashboard } from './WorkerStatusDashboard';
import { LiveActivityFeed } from './LiveActivityFeed';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { CreateTodoModal } from './CreateTodoModal';
import { WorkspaceSelector } from './WorkspaceSelector';

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
  areas: string[];
  primaryArea: string;
  notes?: string;
  completionSummary?: string;
  completedAt?: Date;
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

interface ScopedWorkerIdentity {
  id: string;
  sessionId: string;
  workspaceId: string;
  name?: string;
  capabilities: string[];
  registeredAt: Date;
  lastSeen: Date;
  currentProjectId?: string;
  isConnected?: boolean;
  metadata: {
    model?: string;
    user?: string;
    purpose?: string;
    environment?: string;
  };
}

interface Workspace {
  id: string;
  name: string;
  path: string;
  projects: Project[];
  createdAt: Date;
  updatedAt: Date;
}

interface LiveUpdateEvent {
  id: string;
  type: string;
  workerId: string;
  workerName?: string;
  timestamp: Date;
  message: string;
  projectId?: string;
  todoId?: string;
}

export function WorkspaceView() {
  const { workspacePath } = useParams<{ workspacePath: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'projects' | 'workers' | 'activity'>('projects');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTodo, setShowCreateTodo] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const decodedPath = workspacePath ? decodeURIComponent(workspacePath) : '/workspace';
  
  const {
    isConnected,
    currentWorker,
    currentWorkspace,
    workspaces,
    projects,
    workers,
    liveUpdates,
    error,
    switchWorkspace,
    createWorkspace,
    createProject,
    createTodo,
    updateTodo
  } = useWebSocket({
    workspacePath: decodedPath,
    workerName: 'Web User',
    capabilities: ['ui', 'coordination', 'management'],
    purpose: 'Managing todos via web interface'
  });

  // Trigger workspace switch when URL changes (if workspace doesn't match)
  useEffect(() => {
    if (decodedPath && currentWorkspace && decodedPath !== currentWorkspace.path) {
      console.log('🔄 URL changed, switching workspace from', currentWorkspace.path, 'to', decodedPath);
      switchWorkspace(decodedPath);
    }
  }, [decodedPath, currentWorkspace, switchWorkspace]);

  const handleCreateProject = (name: string, description?: string) => {
    createProject(name, description);
    setShowCreateProject(false);
  };

  const handleCreateTodo = (projectId: string, title: string, options: any) => {
    createTodo(projectId, title, options);
    setShowCreateTodo(false);
    setSelectedProjectId(null);
  };

  const handleWorkspaceChange = (path: string) => {
    console.log('🔄 User selected workspace:', path);
    // First switch the workspace data
    switchWorkspace(path);
    // Then navigate to update the URL
    navigate(`/workspace/${encodeURIComponent(path)}`);
  };

  const connectionStatus = () => {
    if (error) return { text: 'Error', color: 'text-red-600', bg: 'bg-red-100' };
    if (!isConnected) return { text: 'Connecting...', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    if (!currentWorker) return { text: 'Registering...', color: 'text-blue-600', bg: 'bg-blue-100' };
    return { text: 'Connected', color: 'text-green-600', bg: 'bg-green-100' };
  };

  const status = connectionStatus();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🎯 Todo Workspace
              </h1>
              
              {/* Connection Status */}
              <div className={`status-badge ${status.bg} ${status.color} animate-fade-in`}>
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-400' : 'bg-yellow-400'} ${isConnected ? 'animate-pulse' : ''}`}></div>
                {status.text}
              </div>
              
              {/* Workspace Selector */}
              <WorkspaceSelector
                workspaces={workspaces}
                currentWorkspace={currentWorkspace}
                onWorkspaceChange={handleWorkspaceChange}
                onCreateWorkspace={createWorkspace}
              />
            </div>

            {/* Worker Info */}
            <div className="flex items-center gap-4">
              {currentWorkspace && (
                <div className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                  {currentWorkspace.path}
                </div>
              )}
              {currentWorker && (
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">
                    {currentWorker.name} • {workers.length} worker{workers.length !== 1 ? 's' : ''}
                  </div>
                  <button className="p-2 text-gray-400 hover:text-gray-600">
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-800">
              <strong>Connection Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('projects')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'projects'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Projects ({projects.length})
            </button>
            
            <button
              onClick={() => setActiveTab('workers')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'workers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              Workers ({workers.length})
            </button>
            
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'activity'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="w-4 h-4" />
              Activity ({liveUpdates.length})
              {liveUpdates.length > 0 && (
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              )}
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'projects' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
                <button
                  onClick={() => setShowCreateProject(true)}
                  className="btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  Create Project
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="card text-center py-16 animate-fade-in">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center">
                    <FolderOpen className="w-12 h-12 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {currentWorkspace ? `No projects in ${currentWorkspace.name}` : 'No projects yet'}
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    {currentWorkspace 
                      ? `Create your first project in the "${currentWorkspace.name}" workspace to get started!`
                      : 'Select a workspace and create your first project to organize your todos!'
                    }
                  </p>
                  <button
                    onClick={() => setShowCreateProject(true)}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    Create Your First Project
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8">
                  {projects.map((project, index) => (
                    <div key={project.id} className="animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
                      <ProjectCard
                        project={project}
                        onCreateTodo={(projectId) => {
                          setSelectedProjectId(projectId);
                          setShowCreateTodo(true);
                        }}
                        onUpdateTodo={updateTodo}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'workers' && (
            <WorkerStatusDashboard workers={workers} currentUser={currentWorker} />
          )}

          {activeTab === 'activity' && (
            <LiveActivityFeed events={liveUpdates} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreate={handleCreateProject}
        />
      )}

      {showCreateTodo && selectedProjectId && (
        <CreateTodoModal
          projectId={selectedProjectId}
          projects={projects}
          onClose={() => {
            setShowCreateTodo(false);
            setSelectedProjectId(null);
          }}
          onCreate={handleCreateTodo}
        />
      )}
    </div>
  );
}