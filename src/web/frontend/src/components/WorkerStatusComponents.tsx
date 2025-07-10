import React from 'react';
import { Bot, Activity } from 'lucide-react';

// Define types directly in this file to avoid import issues
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

interface WorkerStatusRowProps {
  worker: ScopedWorkerIdentity;
}

export function WorkerStatusRow({ worker }: WorkerStatusRowProps) {
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const lastActivity = worker.lastSeen ? formatTimeAgo(worker.lastSeen) : 'unknown';

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className="relative">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-gray-600" />
          </div>
          <ConnectionStatusDot isConnected={worker.isConnected || false} />
        </div>

        {/* Worker info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-gray-900 truncate">
              {worker.name || worker.id}
            </div>
            <WorkerStatusBadge worker={worker} />
          </div>
          
          <div className="text-sm text-gray-500 mt-1">
            {worker.capabilities.join(' • ')}
          </div>
          
          {/* Current activity */}
          {worker.currentProjectId ? (
            <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Working on project
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-1">
              💤 Idle
            </div>
          )}
        </div>

        {/* Last seen */}
        <div className="text-right">
          <div className="text-xs text-gray-500">
            {worker.isConnected ? (
              <span className="text-green-600 font-medium">Online</span>
            ) : (
              <span>Last seen {lastActivity}</span>
            )}
          </div>
          {worker.registeredAt && (
            <div className="text-xs text-gray-400 mt-1">
              ♥️ Registered {formatTimeAgo(worker.registeredAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface WorkerStatusBadgeProps {
  worker: ScopedWorkerIdentity;
  isCurrentUser?: boolean;
}

export function WorkerStatusBadge({ worker, isCurrentUser = false }: WorkerStatusBadgeProps) {
  if (isCurrentUser) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        You
      </span>
    );
  }

  if (!worker.isConnected) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        Offline
      </span>
    );
  }

  if (worker.currentProjectId) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        🚀 Working
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      💤 Idle
    </span>
  );
}

interface ConnectionStatusDotProps {
  isConnected: boolean;
}

export function ConnectionStatusDot({ isConnected }: ConnectionStatusDotProps) {
  return (
    <div 
      className={`
        absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white
        ${isConnected 
          ? 'bg-green-400 animate-pulse' 
          : 'bg-gray-400'
        }
      `} 
    />
  );
}