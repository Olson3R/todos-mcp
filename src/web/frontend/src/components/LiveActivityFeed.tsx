import React from 'react';
import { Activity, Clock } from 'lucide-react';

// Define types directly in this file to avoid import issues
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

interface LiveActivityFeedProps {
  events: LiveUpdateEvent[];
  maxEvents?: number;
}

export function LiveActivityFeed({ events, maxEvents = 20 }: LiveActivityFeedProps) {
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'worker:joined':
        return '👤';
      case 'worker:disconnected':
        return '👋';
      case 'project:created':
        return '📋';
      case 'todo:created':
        return '➕';
      case 'todo:updated':
        return '📝';
      case 'dependency:added':
        return '🔗';
      case 'dependency:removed':
        return '✂️';
      default:
        return '📌';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'worker:joined':
        return 'text-green-600';
      case 'worker:disconnected':
        return 'text-red-600';
      case 'project:created':
        return 'text-blue-600';
      case 'todo:created':
        return 'text-purple-600';
      case 'todo:updated':
        return 'text-orange-600';
      case 'dependency:added':
      case 'dependency:removed':
        return 'text-indigo-600';
      default:
        return 'text-gray-600';
    }
  };

  const displayEvents = events.slice(0, maxEvents);

  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Live Activity</h3>
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">Real-time</span>
          </div>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {displayEvents.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <div className="text-sm">No recent activity</div>
            <div className="text-xs text-gray-400 mt-1">
              Activity will appear here as workers make changes
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayEvents.map((event) => (
              <div key={event.id} className="px-6 py-3 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${getEventColor(event.type)}`}>
                      {event.message}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span>
                        by {event.workerName || event.workerId.split('-')[0]}
                      </span>
                      <span>•</span>
                      <span>{formatTimeAgo(event.timestamp)}</span>
                      {event.projectId && (
                        <>
                          <span>•</span>
                          <span className="text-blue-600">Project</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-400">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {events.length > maxEvents && (
        <div className="px-6 py-3 border-t border-gray-200 text-center">
          <span className="text-xs text-gray-500">
            Showing {maxEvents} of {events.length} events
          </span>
        </div>
      )}
    </div>
  );
}