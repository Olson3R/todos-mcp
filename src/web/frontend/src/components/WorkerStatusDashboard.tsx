import React from 'react';
import { Users, User, Bot, Activity } from 'lucide-react';
import { WorkerStatusRow, WorkerStatusBadge, ConnectionStatusDot } from './WorkerStatusComponents';

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

interface WorkerStatusDashboardProps {
  workers: ScopedWorkerIdentity[];
  currentUser: ScopedWorkerIdentity | null;
}

export function WorkerStatusDashboard({ workers, currentUser }: WorkerStatusDashboardProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header with total worker count */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            🤖 Live Workers ({workers.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-green-600">Real-time</span>
          </div>
        </div>
      </div>

      {/* Current user status */}
      {currentUser && (
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-blue-900">You ({currentUser.name})</div>
              <div className="text-sm text-blue-700">
                {currentUser.currentProjectId ? '🚀 Working' : '💤 Idle'} • 
                {currentUser.capabilities.join(', ')}
              </div>
            </div>
            <WorkerStatusBadge worker={currentUser} isCurrentUser={true} />
          </div>
        </div>
      )}

      {/* Other workers */}
      <div className="divide-y divide-gray-100">
        {workers.filter(w => w.id !== currentUser?.id).map(worker => (
          <WorkerStatusRow key={worker.id} worker={worker} />
        ))}
      </div>

      {/* No other workers message */}
      {workers.length === 1 && currentUser && (
        <div className="px-6 py-8 text-center text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <div className="text-sm">You're the only active worker</div>
          <div className="text-xs text-gray-400 mt-1">
            Other Claude instances will appear here when they join
          </div>
        </div>
      )}

      {/* No workers at all */}
      {workers.length === 0 && (
        <div className="px-6 py-8 text-center text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <div className="text-sm">No active workers</div>
          <div className="text-xs text-gray-400 mt-1">
            Workers will appear here when they join the workspace
          </div>
        </div>
      )}
    </div>
  );
}