import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Link, AlertCircle, CheckCircle, Clock, ArrowRight, Eye } from 'lucide-react';

// Area configuration for visual consistency
const AREA_COLORS: Record<string, { color: string; bgColor: string; icon: string }> = {
  frontend: { color: '#3B82F6', bgColor: 'bg-blue-100', icon: '🎨' },
  backend: { color: '#10B981', bgColor: 'bg-green-100', icon: '⚙️' },
  database: { color: '#8B5CF6', bgColor: 'bg-purple-100', icon: '🗄️' },
  api: { color: '#F59E0B', bgColor: 'bg-amber-100', icon: '🔌' },
  auth: { color: '#EF4444', bgColor: 'bg-red-100', icon: '🔐' },
  infrastructure: { color: '#6B7280', bgColor: 'bg-gray-100', icon: '🏗️' },
  testing: { color: '#06B6D4', bgColor: 'bg-cyan-100', icon: '🧪' },
  documentation: { color: '#84CC16', bgColor: 'bg-lime-100', icon: '📚' },
  'ui/ux': { color: '#EC4899', bgColor: 'bg-pink-100', icon: '🎯' },
  security: { color: '#DC2626', bgColor: 'bg-red-100', icon: '🛡️' },
  performance: { color: '#7C3AED', bgColor: 'bg-violet-100', icon: '⚡' },
  deployment: { color: '#059669', bgColor: 'bg-emerald-100', icon: '🚀' }
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
  areas: string[];
  primaryArea: string;
  notes?: string;
  completionSummary?: string;
  completedAt?: Date;
  startedAt?: Date;
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

// Utility functions for time formatting
const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}min`;
  } else if (minutes < 1440) { // Less than 24 hours
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  } else {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
};

const calculateImplementationTime = (startedAt?: Date | string | null, completedAt?: Date | string | null): number | null => {
  if (!startedAt || !completedAt) return null;
  
  const startDate = typeof startedAt === 'string' ? new Date(startedAt) : startedAt;
  const endDate = typeof completedAt === 'string' ? new Date(completedAt) : completedAt;
  
  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)); // minutes
};

const formatTimeAgo = (date: Date | string | null): string => {
  if (!date) return 'unknown';
  
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(targetDate.getTime())) return 'unknown';
  
  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
};

// Project-level timing analytics functions
interface TimingStats {
  totalImplementationTime: number;
  averageImplementationTime: number;
  estimationAccuracy: number;
  completedTodos: number;
  overEstimatedTodos: number;
  underEstimatedTodos: number;
  onTimeCompletions: number;
  efficiencyRating: 'excellent' | 'good' | 'average' | 'poor';
  predictedCompletionTime: number | null;
}

const calculateProjectTimingStats = (todos: TodoItem[]): TimingStats => {
  const completedTodos = todos.filter(t => t.status === 'completed');
  const completedWithTiming = completedTodos.filter(t => t.startedAt && t.completedAt);
  
  if (completedWithTiming.length === 0) {
    return {
      totalImplementationTime: 0,
      averageImplementationTime: 0,
      estimationAccuracy: 0,
      completedTodos: completedTodos.length,
      overEstimatedTodos: 0,
      underEstimatedTodos: 0,
      onTimeCompletions: 0,
      efficiencyRating: 'average',
      predictedCompletionTime: null
    };
  }

  const implementationTimes = completedWithTiming.map(t => 
    calculateImplementationTime(t.startedAt, t.completedAt)!
  );
  
  const totalImplementationTime = implementationTimes.reduce((sum, time) => sum + time, 0);
  const averageImplementationTime = totalImplementationTime / implementationTimes.length;
  
  // Calculate estimation accuracy
  const todosWithEstimates = completedWithTiming.filter(t => t.estimatedDuration);
  let estimationAccuracy = 0;
  let overEstimatedTodos = 0;
  let underEstimatedTodos = 0;
  let onTimeCompletions = 0;
  
  if (todosWithEstimates.length > 0) {
    const accuracyScores = todosWithEstimates.map(t => {
      const actual = calculateImplementationTime(t.startedAt, t.completedAt)!;
      const estimated = t.estimatedDuration!;
      const accuracy = Math.min(estimated, actual) / Math.max(estimated, actual);
      
      if (actual > estimated * 1.2) {
        underEstimatedTodos++;
      } else if (actual < estimated * 0.8) {
        overEstimatedTodos++;
      } else {
        onTimeCompletions++;
      }
      
      return accuracy;
    });
    
    estimationAccuracy = accuracyScores.reduce((sum, score) => sum + score, 0) / accuracyScores.length;
  }
  
  // Calculate efficiency rating
  let efficiencyRating: 'excellent' | 'good' | 'average' | 'poor' = 'average';
  if (estimationAccuracy > 0.9) {
    efficiencyRating = 'excellent';
  } else if (estimationAccuracy > 0.75) {
    efficiencyRating = 'good';
  } else if (estimationAccuracy < 0.5) {
    efficiencyRating = 'poor';
  }
  
  // Predict completion time for remaining todos
  const pendingTodos = todos.filter(t => t.status === 'pending');
  const inProgressTodos = todos.filter(t => t.status === 'in-progress');
  const remainingTodos = [...pendingTodos, ...inProgressTodos];
  
  let predictedCompletionTime: number | null = null;
  if (remainingTodos.length > 0 && averageImplementationTime > 0) {
    const estimatedTime = remainingTodos.reduce((sum, todo) => {
      return sum + (todo.estimatedDuration || averageImplementationTime);
    }, 0);
    predictedCompletionTime = estimatedTime;
  }
  
  return {
    totalImplementationTime,
    averageImplementationTime,
    estimationAccuracy,
    completedTodos: completedTodos.length,
    overEstimatedTodos,
    underEstimatedTodos,
    onTimeCompletions,
    efficiencyRating,
    predictedCompletionTime
  };
};

// Worker productivity analysis
interface WorkerProductivityStats {
  dailyAverageCompletions: number;
  peakProductivityHours: string;
  averageTaskDuration: number;
  completionVelocity: number;
  currentWorkload: number;
  estimationTrend: 'improving' | 'stable' | 'declining';
}

const calculateWorkerProductivity = (todos: TodoItem[]): WorkerProductivityStats => {
  const completedTodos = todos.filter(t => t.status === 'completed' && t.completedAt);
  const inProgressTodos = todos.filter(t => t.status === 'in-progress');
  
  if (completedTodos.length === 0) {
    return {
      dailyAverageCompletions: 0,
      peakProductivityHours: 'N/A',
      averageTaskDuration: 0,
      completionVelocity: 0,
      currentWorkload: inProgressTodos.length,
      estimationTrend: 'stable'
    };
  }

  // Helper function to ensure date conversion
  const ensureDate = (date: Date | string | undefined | null): Date | null => {
    if (!date) return null;
    return typeof date === 'string' ? new Date(date) : date;
  };

  // Calculate daily average completions
  const firstCompletion = completedTodos.reduce((earliest, todo) => {
    const earliestDate = ensureDate(earliest.completedAt);
    const todoDate = ensureDate(todo.completedAt);
    if (!earliestDate || !todoDate) return earliest;
    return todoDate < earliestDate ? todo : earliest;
  });
  const lastCompletion = completedTodos.reduce((latest, todo) => {
    const latestDate = ensureDate(latest.completedAt);
    const todoDate = ensureDate(todo.completedAt);
    if (!latestDate || !todoDate) return latest;
    return todoDate > latestDate ? todo : latest;
  });
  
  const firstDate = ensureDate(firstCompletion.completedAt);
  const lastDate = ensureDate(lastCompletion.completedAt);
  
  let daysDiff = 1;
  if (firstDate && lastDate) {
    daysDiff = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
  }
  const dailyAverageCompletions = completedTodos.length / daysDiff;
  
  // Find peak productivity hours
  const completionHours = completedTodos.map(t => {
    const date = ensureDate(t.completedAt);
    return date ? date.getHours() : 12; // Default to noon if date is invalid
  });
  const hourCounts = completionHours.reduce((acc, hour) => {
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  const peakHour = Object.entries(hourCounts).reduce((max, [hour, count]) => 
    count > max[1] ? [hour, count] : max
  , ['0', 0]);
  
  const peakProductivityHours = `${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00`;
  
  // Calculate completion velocity (todos per week)
  const completionVelocity = dailyAverageCompletions * 7;
  
  // Calculate average task duration
  const durationsWithTiming = completedTodos.filter(t => t.startedAt && t.completedAt);
  const averageTaskDuration = durationsWithTiming.length > 0 ? 
    durationsWithTiming.reduce((sum, t) => sum + calculateImplementationTime(t.startedAt, t.completedAt)!, 0) / durationsWithTiming.length : 0;
  
  // Calculate estimation trend
  const recentTodos = completedTodos.slice(-5);
  const olderTodos = completedTodos.slice(0, -5);
  
  let estimationTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentTodos.length >= 3 && olderTodos.length >= 3) {
    const recentAccuracy = recentTodos.filter(t => t.estimatedDuration).reduce((sum, t) => {
      const actual = calculateImplementationTime(t.startedAt, t.completedAt);
      return sum + (actual && t.estimatedDuration ? Math.min(t.estimatedDuration, actual) / Math.max(t.estimatedDuration, actual) : 0);
    }, 0) / recentTodos.filter(t => t.estimatedDuration).length;
    
    const olderAccuracy = olderTodos.filter(t => t.estimatedDuration).reduce((sum, t) => {
      const actual = calculateImplementationTime(t.startedAt, t.completedAt);
      return sum + (actual && t.estimatedDuration ? Math.min(t.estimatedDuration, actual) / Math.max(t.estimatedDuration, actual) : 0);
    }, 0) / olderTodos.filter(t => t.estimatedDuration).length;
    
    if (recentAccuracy > olderAccuracy + 0.1) {
      estimationTrend = 'improving';
    } else if (recentAccuracy < olderAccuracy - 0.1) {
      estimationTrend = 'declining';
    }
  }
  
  return {
    dailyAverageCompletions,
    peakProductivityHours,
    averageTaskDuration,
    completionVelocity,
    currentWorkload: inProgressTodos.length,
    estimationTrend
  };
};

// Smart estimation suggestions
interface EstimationSuggestion {
  suggestedDuration: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  similarTasks: number;
  adjustmentFactor: number;
}

const generateEstimationSuggestions = (
  todos: TodoItem[],
  currentTodo: { title: string; description?: string; areas: string[]; priority: string }
): EstimationSuggestion | null => {
  const completedTodos = todos.filter(t => 
    t.status === 'completed' && 
    t.startedAt && 
    t.completedAt && 
    t.estimatedDuration
  );

  if (completedTodos.length < 3) {
    return null;
  }

  // Find similar tasks based on various criteria
  const similarTasks = completedTodos.filter(t => {
    let similarity = 0;
    
    // Area similarity (highest weight)
    const areaOverlap = t.areas.filter(area => currentTodo.areas.includes(area)).length;
    if (areaOverlap > 0) similarity += 0.4 * (areaOverlap / Math.max(t.areas.length, currentTodo.areas.length));
    
    // Priority similarity
    if (t.priority === currentTodo.priority) similarity += 0.2;
    
    // Title keyword similarity
    const titleWords = currentTodo.title.toLowerCase().split(/\s+/);
    const todoTitleWords = t.title.toLowerCase().split(/\s+/);
    const titleOverlap = titleWords.filter(word => todoTitleWords.includes(word)).length;
    if (titleOverlap > 0) similarity += 0.3 * (titleOverlap / Math.max(titleWords.length, todoTitleWords.length));
    
    // Description keyword similarity (if available)
    if (currentTodo.description && t.description) {
      const descWords = currentTodo.description.toLowerCase().split(/\s+/);
      const todoDescWords = t.description.toLowerCase().split(/\s+/);
      const descOverlap = descWords.filter(word => todoDescWords.includes(word)).length;
      if (descOverlap > 0) similarity += 0.1 * (descOverlap / Math.max(descWords.length, todoDescWords.length));
    }
    
    return similarity > 0.3; // Minimum similarity threshold
  });

  if (similarTasks.length === 0) {
    // Fall back to area-based average if no similar tasks found
    const areaBasedTasks = completedTodos.filter(t => 
      t.areas.some(area => currentTodo.areas.includes(area))
    );
    
    if (areaBasedTasks.length > 0) {
      const avgDuration = areaBasedTasks.reduce((sum, t) => 
        sum + calculateImplementationTime(t.startedAt, t.completedAt)!, 0
      ) / areaBasedTasks.length;
      
      return {
        suggestedDuration: Math.round(avgDuration),
        confidence: 'low',
        reasoning: `Based on ${areaBasedTasks.length} similar tasks in ${currentTodo.areas.join(', ')} areas`,
        similarTasks: areaBasedTasks.length,
        adjustmentFactor: 1.0
      };
    }
    
    return null;
  }

  // Calculate weighted average duration
  const totalSimilarity = similarTasks.reduce((sum, t) => {
    let similarity = 0;
    const areaOverlap = t.areas.filter(area => currentTodo.areas.includes(area)).length;
    if (areaOverlap > 0) similarity += 0.4 * (areaOverlap / Math.max(t.areas.length, currentTodo.areas.length));
    if (t.priority === currentTodo.priority) similarity += 0.2;
    
    const titleWords = currentTodo.title.toLowerCase().split(/\s+/);
    const todoTitleWords = t.title.toLowerCase().split(/\s+/);
    const titleOverlap = titleWords.filter(word => todoTitleWords.includes(word)).length;
    if (titleOverlap > 0) similarity += 0.3 * (titleOverlap / Math.max(titleWords.length, todoTitleWords.length));
    
    return sum + similarity;
  }, 0);

  const weightedDuration = similarTasks.reduce((sum, t) => {
    let similarity = 0;
    const areaOverlap = t.areas.filter(area => currentTodo.areas.includes(area)).length;
    if (areaOverlap > 0) similarity += 0.4 * (areaOverlap / Math.max(t.areas.length, currentTodo.areas.length));
    if (t.priority === currentTodo.priority) similarity += 0.2;
    
    const titleWords = currentTodo.title.toLowerCase().split(/\s+/);
    const todoTitleWords = t.title.toLowerCase().split(/\s+/);
    const titleOverlap = titleWords.filter(word => todoTitleWords.includes(word)).length;
    if (titleOverlap > 0) similarity += 0.3 * (titleOverlap / Math.max(titleWords.length, todoTitleWords.length));
    
    const duration = calculateImplementationTime(t.startedAt, t.completedAt)!;
    return sum + (duration * similarity);
  }, 0);

  const avgDuration = weightedDuration / totalSimilarity;

  // Apply adjustment factors based on priority and complexity indicators
  let adjustmentFactor = 1.0;
  
  // Priority adjustments
  switch (currentTodo.priority) {
    case 'critical':
      adjustmentFactor *= 1.3; // Critical tasks often take longer
      break;
    case 'high':
      adjustmentFactor *= 1.1;
      break;
    case 'low':
      adjustmentFactor *= 0.9;
      break;
  }

  // Complexity indicators in title/description
  const complexityWords = ['refactor', 'redesign', 'optimize', 'migrate', 'integrate', 'complex', 'major'];
  const simpleWords = ['fix', 'update', 'minor', 'simple', 'quick', 'small'];
  
  const text = `${currentTodo.title} ${currentTodo.description || ''}`.toLowerCase();
  const hasComplexity = complexityWords.some(word => text.includes(word));
  const hasSimplicity = simpleWords.some(word => text.includes(word));
  
  if (hasComplexity && !hasSimplicity) {
    adjustmentFactor *= 1.2;
  } else if (hasSimplicity && !hasComplexity) {
    adjustmentFactor *= 0.8;
  }

  const suggestedDuration = Math.round(avgDuration * adjustmentFactor);

  // Determine confidence based on number of similar tasks and similarity strength
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (similarTasks.length >= 5 && totalSimilarity / similarTasks.length > 0.6) {
    confidence = 'high';
  } else if (similarTasks.length < 3 || totalSimilarity / similarTasks.length < 0.4) {
    confidence = 'low';
  }

  const primaryAreas = currentTodo.areas.slice(0, 2).join(', ');
  const reasoning = `Based on ${similarTasks.length} similar tasks in ${primaryAreas}${adjustmentFactor !== 1.0 ? ` (adjusted for ${currentTodo.priority} priority)` : ''}`;

  return {
    suggestedDuration,
    confidence,
    reasoning,
    similarTasks: similarTasks.length,
    adjustmentFactor
  };
};

export function ProjectCard({ project, onCreateTodo, onUpdateTodo }: ProjectCardProps) {
  const navigate = useNavigate();
  const { workspacePath } = useParams<{ workspacePath: string }>();
  const getStatusColors = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-400 bg-green-50 text-green-800';
      case 'in-progress':
        return 'border-orange-400 bg-orange-50 text-orange-800';
      default:
        return 'border-gray-300 bg-white text-gray-900';
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
  
  // Calculate timing statistics
  const timingStats = calculateProjectTimingStats(sortedTodos);
  const workerStats = calculateWorkerProductivity(sortedTodos);
  
  const getEfficiencyColor = (rating: string) => {
    switch (rating) {
      case 'excellent':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'good':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'average':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'poor':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'text-green-600';
      case 'declining':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return '📈';
      case 'declining':
        return '📉';
      default:
        return '➖';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      {/* Project Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        {/* Header Top Section */}
        <div className="px-8 pt-8 pb-6">
          <div className="flex justify-between items-start">
            <div className="flex-1 max-w-2xl">
              <h3 className="text-2xl font-bold mb-4 text-white leading-tight">{project.name}</h3>
              {project.description && (
                <div className="bg-blue-500/20 rounded-xl p-4 backdrop-blur-sm">
                  <p className="text-blue-50 leading-relaxed">{project.description}</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 ml-6">
              <button
                onClick={() => navigate(`/workspace/${encodeURIComponent(workspacePath!)}/project/${project.id}`)}
                className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all duration-200 backdrop-blur-sm hover:scale-105"
                title="View Project"
              >
                <Eye className="w-4 h-4" />
                <span className="font-medium">View</span>
              </button>
              <button
                onClick={() => onCreateTodo(project.id)}
                className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all duration-200 backdrop-blur-sm hover:scale-105"
                title="Add Todo"
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">Add Todo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Metrics and Progress Section */}
        <div className="px-8 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Progress Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-blue-100 font-semibold">Progress Overview</h4>
                <div className="text-blue-100 text-sm">
                  {completedTodos} of {totalTodos} completed ({Math.round(completedPercent)}%)
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="bg-blue-500 rounded-full h-4 overflow-hidden shadow-inner">
                <div className="flex h-full">
                  <div 
                    className="bg-green-400 transition-all duration-500 ease-out"
                    style={{ width: `${completedPercent}%` }}
                  />
                  <div 
                    className="bg-orange-400 transition-all duration-500 ease-out"
                    style={{ width: `${inProgressPercent}%` }}
                  />
                </div>
              </div>
              
              {/* Status Legend */}
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span className="text-blue-100">{completedTodos} Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
                  <span className="text-blue-100">{inProgressTodos} In Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-300 rounded-full"></div>
                  <span className="text-blue-100">{pendingTodos} Pending</span>
                </div>
              </div>
            </div>

            {/* Analytics Column */}
            <div className="space-y-4">
              {timingStats.completedTodos > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="text-blue-100 font-semibold">Analytics</h4>
                    <span className={`
                      px-3 py-1 rounded-full text-xs font-medium border
                      ${getEfficiencyColor(timingStats.efficiencyRating)}
                    `}>
                      {timingStats.efficiencyRating}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="bg-blue-500/20 rounded-lg p-3 backdrop-blur-sm">
                      <div className="text-blue-100 text-xs mb-1">Avg. Implementation</div>
                      <div className="text-white font-semibold">
                        {formatDuration(timingStats.averageImplementationTime)}
                      </div>
                    </div>
                    
                    <div className="bg-blue-500/20 rounded-lg p-3 backdrop-blur-sm">
                      <div className="text-blue-100 text-xs mb-1">Estimation Accuracy</div>
                      <div className="text-white font-semibold">
                        {Math.round(timingStats.estimationAccuracy * 100)}%
                      </div>
                    </div>
                    
                    {timingStats.predictedCompletionTime && (
                      <div className="bg-blue-500/20 rounded-lg p-3 backdrop-blur-sm">
                        <div className="text-blue-100 text-xs mb-1">Time Remaining</div>
                        <div className="text-white font-semibold">
                          {formatDuration(timingStats.predictedCompletionTime)}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Todos List */}
      <div className="p-8">
        {sortedTodos.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h4 className="text-gray-900 font-medium mb-2">No todos yet</h4>
            <p className="text-gray-500 text-sm mb-4">Get started by adding your first todo item</p>
            <button
              onClick={() => onCreateTodo(project.id)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Add your first todo
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-gray-900 font-semibold">Recent Todos</h4>
              <button
                onClick={() => navigate(`/workspace/${encodeURIComponent(workspacePath!)}/project/${project.id}`)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            
            <div className="space-y-4">
              {sortedTodos.slice(0, 4).map((todo) => (
                <div
                  key={todo.id}
                  className={`
                    group p-4 rounded-xl border-l-4 cursor-pointer transition-all duration-200
                    ${getStatusColors(todo.status)}
                    hover:shadow-md hover:-translate-y-0.5
                    ${todo.blockedBy.length > 0 ? 'opacity-60' : ''}
                  `}
                  onClick={() => !todo.blockedBy.length && toggleTodoStatus(todo)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(todo.status)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 mb-1">
                        {todo.title}
                      </div>
                      
                      {todo.description && (
                        <div className="text-gray-600 text-sm mb-3 leading-relaxed">
                          {todo.description.length > 80 ? `${todo.description.slice(0, 80)}...` : todo.description}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Primary Area Badge */}
                          {todo.primaryArea && AREA_COLORS[todo.primaryArea] && (
                            <span className={`
                              inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                              ${AREA_COLORS[todo.primaryArea].bgColor} text-gray-800 border border-gray-200
                            `}>
                              <span>{AREA_COLORS[todo.primaryArea].icon}</span>
                              {todo.primaryArea}
                              {todo.areas && todo.areas.length > 1 && (
                                <span className="text-xs opacity-60 ml-1">+{todo.areas.length - 1}</span>
                              )}
                            </span>
                          )}
                          
                          {/* Priority Badge */}
                          <span className={`
                            inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border
                            ${getPriorityColor(todo.priority)}
                          `}>
                            {todo.priority}
                          </span>
                          
                          {/* Implementation Time Badge - for completed todos */}
                          {todo.status === 'completed' && (() => {
                            const implTime = calculateImplementationTime(todo.startedAt, todo.completedAt);
                            if (implTime !== null) {
                              const isUnderEstimate = todo.estimatedDuration && implTime <= todo.estimatedDuration;
                              const accuracyRatio = todo.estimatedDuration ? 
                                Math.min(todo.estimatedDuration, implTime) / Math.max(todo.estimatedDuration, implTime) : 0;
                              
                              // Determine accuracy color
                              let accuracyColor = 'bg-gray-50 text-gray-700 border-gray-200';
                              if (todo.estimatedDuration) {
                                if (accuracyRatio > 0.9) {
                                  accuracyColor = 'bg-green-50 text-green-700 border-green-200';
                                } else if (accuracyRatio > 0.7) {
                                  accuracyColor = 'bg-blue-50 text-blue-700 border-blue-200';
                                } else if (accuracyRatio > 0.5) {
                                  accuracyColor = 'bg-yellow-50 text-yellow-700 border-yellow-200';
                                } else {
                                  accuracyColor = 'bg-red-50 text-red-700 border-red-200';
                                }
                              }
                              
                              return (
                                <span className={`
                                  inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border
                                  ${accuracyColor}
                                `}>
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(implTime)}
                                  {todo.estimatedDuration && (
                                    <span className="opacity-70">
                                      vs {formatDuration(todo.estimatedDuration)} est
                                      {accuracyRatio > 0 && (
                                        <span className="ml-1 font-bold">
                                          ({Math.round(accuracyRatio * 100)}%)
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          
                          {/* Live Timer - for in-progress todos */}
                          {todo.status === 'in-progress' && todo.startedAt && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                              <Clock className="w-3 h-3" />
                              In progress for {formatTimeAgo(todo.startedAt)}
                            </span>
                          )}
                          
                          {/* Blocked indicator */}
                          {todo.blockedBy.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                              <AlertCircle className="w-3 h-3" />
                              Blocked
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {/* Dependencies */}
                          {todo.dependsOn.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Link className="w-3 h-3" />
                              <span>{todo.dependsOn.length}</span>
                            </div>
                          )}
                          
                          {/* Duration estimate */}
                          {todo.estimatedDuration && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{todo.estimatedDuration}min</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {sortedTodos.length > 4 && (
                <div className="text-center pt-4">
                  <button
                    onClick={() => navigate(`/workspace/${encodeURIComponent(workspacePath!)}/project/${project.id}`)}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View {sortedTodos.length - 4} more todo{sortedTodos.length - 4 !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer with Phases, Documents, and Productivity Metrics */}
        {(project.phases.length > 0 || project.documents.length > 0 || timingStats.completedTodos > 0) && (
          <div className="border-t border-gray-100 bg-gray-50 px-8 py-6">
            <div className="space-y-4">
              {/* Productivity Metrics */}
              {timingStats.completedTodos > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    📊 Productivity Insights
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Total Work Time</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {formatDuration(timingStats.totalImplementationTime)}
                          </div>
                        </div>
                        <div className="text-blue-500">⏱️</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">On-Time Completions</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {timingStats.onTimeCompletions} / {timingStats.completedTodos}
                          </div>
                        </div>
                        <div className="text-green-500">✅</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Under-Estimated</div>
                          <div className="text-sm font-semibold text-red-600">
                            {timingStats.underEstimatedTodos}
                          </div>
                        </div>
                        <div className="text-red-500">⚠️</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Over-Estimated</div>
                          <div className="text-sm font-semibold text-orange-600">
                            {timingStats.overEstimatedTodos}
                          </div>
                        </div>
                        <div className="text-orange-500">📈</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Worker Productivity Dashboard */}
              {workerStats.dailyAverageCompletions > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    👤 Worker Performance
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Daily Average</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {workerStats.dailyAverageCompletions.toFixed(1)} todos
                          </div>
                        </div>
                        <div className="text-blue-500">📅</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Weekly Velocity</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {workerStats.completionVelocity.toFixed(1)} todos
                          </div>
                        </div>
                        <div className="text-green-500">🚀</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Peak Hours</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {workerStats.peakProductivityHours}
                          </div>
                        </div>
                        <div className="text-purple-500">🌟</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Current Load</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {workerStats.currentWorkload} active
                          </div>
                        </div>
                        <div className="text-orange-500">⚡</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Avg Task Duration</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {formatDuration(workerStats.averageTaskDuration)}
                          </div>
                        </div>
                        <div className="text-cyan-500">⏳</div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Estimation Trend</div>
                          <div className={`text-sm font-semibold ${getTrendColor(workerStats.estimationTrend)}`}>
                            {workerStats.estimationTrend}
                          </div>
                        </div>
                        <div>{getTrendIcon(workerStats.estimationTrend)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Phases */}
              {project.phases.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    📋 Phases
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {project.phases.map((phase) => (
                      <span
                        key={phase.id}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-200 shadow-sm"
                      >
                        {phase.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              {project.documents.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    📎 Documents
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {project.documents.map((doc) => (
                      <span
                        key={doc.id}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {doc.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}