import React, { useState } from 'react';
import { ChevronDown, Folder, Plus, Check, MapPin } from 'lucide-react';

// Define types directly in this file to avoid import issues
interface Workspace {
  id: string;
  name: string;
  path: string;
  projects: any[];
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  onWorkspaceChange: (workspacePath: string) => void;
  onCreateWorkspace: (name: string, path: string) => void;
}

export function WorkspaceSelector({
  workspaces,
  currentWorkspace,
  onWorkspaceChange,
  onCreateWorkspace
}: WorkspaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspacePath, setNewWorkspacePath] = useState('');

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWorkspaceName.trim() && newWorkspacePath.trim()) {
      onCreateWorkspace(newWorkspaceName.trim(), newWorkspacePath.trim());
      setNewWorkspaceName('');
      setNewWorkspacePath('');
      setShowCreateForm(false);
      setIsOpen(false);
    }
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    onWorkspaceChange(workspace.path);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Current Workspace Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-w-64"
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Folder className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="font-medium text-gray-900 text-sm">
              {currentWorkspace?.name || 'Select Workspace'}
            </div>
            {currentWorkspace && (
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {currentWorkspace.path}
              </div>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-slide-up">
          <div className="max-h-80 overflow-y-auto">
            {/* Existing Workspaces */}
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide px-3 py-2">
                Available Workspaces
              </div>
              {workspaces.length === 0 ? (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">
                  No workspaces found
                </div>
              ) : (
                workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => handleWorkspaceSelect(workspace)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded flex items-center justify-center">
                      <Folder className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">{workspace.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {workspace.path}
                      </div>
                      <div className="text-xs text-gray-400">
                        {workspace.projects.length} project{workspace.projects.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {currentWorkspace?.id === workspace.id && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Create New Workspace */}
            <div className="border-t border-gray-100 p-2">
              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors text-blue-600"
                >
                  <Plus className="w-4 h-4" />
                  <span className="font-medium">Add New Workspace</span>
                </button>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="My Workspace"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Workspace Path
                    </label>
                    <input
                      type="text"
                      value={newWorkspacePath}
                      onChange={(e) => setNewWorkspacePath(e.target.value)}
                      placeholder="/path/to/workspace"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewWorkspaceName('');
                        setNewWorkspacePath('');
                      }}
                      className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newWorkspaceName.trim() || !newWorkspacePath.trim()}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsOpen(false);
            setShowCreateForm(false);
            setNewWorkspaceName('');
            setNewWorkspacePath('');
          }}
        />
      )}
    </div>
  );
}