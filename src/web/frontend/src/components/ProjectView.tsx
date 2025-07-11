import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Settings, Eye, List, Network, CheckCircle, Clock, AlertCircle, Link, Filter } from 'lucide-react';

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

interface GraphNode {
  id: string;
  todo: TodoItem;
  x: number;
  y: number;
  level: number;
  column: number;
}

interface GraphEdge {
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  levelDiff?: number;
}

interface ProjectViewProps {
  projects: Project[];
  onCreateTodo: (projectId: string, title: string, options: any) => void;
  onUpdateTodo: (id: string, updates: any) => void;
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

const calculateImplementationTime = (startedAt?: Date, completedAt?: Date): number | null => {
  if (!startedAt || !completedAt) return null;
  return Math.round((completedAt.getTime() - startedAt.getTime()) / (1000 * 60)); // minutes
};

const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
};

export function ProjectView({ projects, onCreateTodo, onUpdateTodo }: ProjectViewProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [graphMode, setGraphMode] = useState<'detailed'>('detailed');
  const [selectedTodo, setSelectedTodo] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [statusChangeNotification, setStatusChangeNotification] = useState<{
    message: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [showAreaFilter, setShowAreaFilter] = useState(false);
  const [completionModal, setCompletionModal] = useState<{
    todoId: string;
    todoTitle: string;
  } | null>(null);
  const [completionSummary, setCompletionSummary] = useState('');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [editingCompletion, setEditingCompletion] = useState<string | null>(null);
  const [editNotesValue, setEditNotesValue] = useState('');
  const [editCompletionValue, setEditCompletionValue] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const project = projects.find(p => p.id === projectId);

  // Calculate dependency graph layout with proper hierarchy and spacing
  const { nodes, edges, swimLanes } = useMemo(() => {
    if (!project) return { nodes: [], edges: [], swimLanes: [] };

    const todos = project.todos;
    if (todos.length === 0) return { nodes: [], edges: [], swimLanes: [] };
    
    
    // Build dependency graph
    const todoMap = new Map(todos.map(t => [t.id, t]));
    
    // Calculate dependency levels using proper topological sort
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    
    // Recursive function to calculate maximum depth from dependencies
    const calculateLevel = (todoId: string, path = new Set<string>()): number => {
      if (path.has(todoId)) {
        return 0; // Break circular dependencies
      }
      
      if (levels.has(todoId)) {
        return levels.get(todoId)!;
      }
      
      const todo = todoMap.get(todoId);
      if (!todo) return 0;
      
      path.add(todoId);
      
      let maxDepLevel = -1;
      for (const depId of todo.dependsOn) {
        const depLevel = calculateLevel(depId, path);
        maxDepLevel = Math.max(maxDepLevel, depLevel);
      }
      
      path.delete(todoId);
      
      const level = maxDepLevel + 1;
      levels.set(todoId, level);
      return level;
    };
    
    // Calculate levels for all todos
    todos.forEach(todo => calculateLevel(todo.id));
    
    
    // Group todos by level
    const levelGroups = new Map<number, TodoItem[]>();
    todos.forEach(todo => {
      const level = levels.get(todo.id) || 0;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(todo);
    });
    
    
    // Sort within each level by priority and connections
    levelGroups.forEach(levelTodos => {
      levelTodos.sort((a, b) => {
        const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
        const aPriority = priorityOrder[a.priority] || 3;
        const bPriority = priorityOrder[b.priority] || 3;
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // Then by number of dependents (more connected first)
        if (a.dependents.length !== b.dependents.length) {
          return b.dependents.length - a.dependents.length;
        }
        
        return a.title.localeCompare(b.title);
      });
    });

    // First, minimize edge crossings by reordering nodes within levels
    const reorderNodesInLevels = () => {
      // Calculate barycenter (average position) for each node based on connected nodes
      levelGroups.forEach((levelTodos, level) => {
        const nodeScores = new Map<string, number>();
        
        levelTodos.forEach(todo => {
          let score = 0;
          let count = 0;
          
          // Score based on dependencies (nodes in previous levels)
          todo.dependsOn.forEach(depId => {
            const depNode = graphNodes.find(n => n.id === depId);
            if (depNode && depNode.level < level) {
              score += depNode.column;
              count++;
            }
          });
          
          // Score based on dependents (nodes in next levels)
          todo.dependents.forEach(depId => {
            const depNode = graphNodes.find(n => n.id === depId);
            if (depNode && depNode.level > level) {
              score += depNode.column;
              count++;
            }
          });
          
          nodeScores.set(todo.id, count > 0 ? score / count : levelTodos.indexOf(todo));
        });
        
        // Sort by barycenter score
        levelTodos.sort((a, b) => {
          const scoreA = nodeScores.get(a.id) || 0;
          const scoreB = nodeScores.get(b.id) || 0;
          return scoreA - scoreB;
        });
      });
    };

    // More compact layout with minimal spacing
    const nodeWidth = 200;
    const nodeHeight = 70;
    const levelSpacing = 280;
    const nodeSpacing = 85;
    const laneHeight = 120; // Height for each area swim lane
    const offsetX = 40;
    const offsetY = 40;
    
    // Group todos by area for swim lanes
    const areaGroups = new Map<string, TodoItem[]>();
    todos.forEach(todo => {
      const area = todo.primaryArea || 'unassigned';
      if (!areaGroups.has(area)) {
        areaGroups.set(area, []);
      }
      areaGroups.get(area)!.push(todo);
    });
    
    // Create ordered list of areas based on workload
    const orderedAreas = Array.from(areaGroups.keys()).sort((a, b) => {
      const aCount = areaGroups.get(a)?.length || 0;
      const bCount = areaGroups.get(b)?.length || 0;
      return bCount - aCount; // Sort by count descending
    });

    // Initial positioning - horizontal by level, vertical by position within level
    const graphNodes: GraphNode[] = [];
    
    Array.from(levelGroups.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([level, levelTodos]) => {
        levelTodos.forEach((todo, index) => {
          const x = offsetX + level * levelSpacing;
          const y = offsetY + index * nodeSpacing;
          
          graphNodes.push({
            id: todo.id,
            todo,
            x,
            y,
            level,
            column: index
          });
        });
      });

    // Single pass optimization for better performance
    reorderNodesInLevels();
    
    // Update positions after reordering - keep horizontal level layout
    graphNodes.length = 0;
    
    Array.from(levelGroups.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([level, levelTodos]) => {
        levelTodos.forEach((todo, index) => {
          const x = offsetX + level * levelSpacing;
          const y = offsetY + index * nodeSpacing;
          
          graphNodes.push({
            id: todo.id,
            todo,
            x,
            y,
            level,
            column: index
          });
        });
      });

    // Create edges with simple direct routing
    const graphEdges: GraphEdge[] = [];
    
    todos.forEach(todo => {
      const toNode = graphNodes.find(n => n.id === todo.id);
      if (!toNode) return;
      
      todo.dependsOn.forEach(depId => {
        const fromNode = graphNodes.find(n => n.id === depId);
        if (!fromNode) return;
        
        // Edge connections with proper arrow targeting
        const fromX = fromNode.x + nodeWidth;
        const fromY = fromNode.y + nodeHeight / 2;
        // Line ends before the arrow marker (offset by refX value)
        const arrowOffset = 9; // Arrow marker refX="9" extends this far
        const toX = toNode.x - arrowOffset;
        const toY = toNode.y + nodeHeight / 2;
        
        graphEdges.push({
          from: depId,
          to: todo.id,
          fromX,
          fromY,
          toX,
          toY
        });
      });
    });

    // Remove all grouping logic - keep only simple node layout


    // Calculate swim lanes based on actual node positions
    const swimLanes = orderedAreas.map(area => {
      const areaNodes = graphNodes.filter(node => (node.todo.primaryArea || 'unassigned') === area);
      if (areaNodes.length === 0) return null;
      
      const minY = Math.min(...areaNodes.map(node => node.y));
      const maxY = Math.max(...areaNodes.map(node => node.y + nodeHeight));
      
      return {
        area,
        y: minY - 10,
        height: maxY - minY + 20,
        color: AREA_COLORS[area]?.color || '#6B7280',
        bgColor: AREA_COLORS[area]?.bgColor || 'bg-gray-100',
        icon: AREA_COLORS[area]?.icon || '📄',
        todoCount: areaGroups.get(area)?.length || 0
      };
    }).filter(Boolean);

    return { 
      nodes: graphNodes, 
      edges: graphEdges,
      swimLanes
    };
  }, [project]);

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project not found</h2>
          <button
            onClick={() => navigate(-1)}
            className="btn-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const getStatusColors = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-500 bg-green-50 text-green-900';
      case 'in-progress':
        return 'border-orange-500 bg-orange-50 text-orange-900';
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
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  const toggleTodoStatus = (todo: TodoItem) => {
    const nextStatus = {
      'pending': 'in-progress',
      'in-progress': 'completed',
      'completed': 'pending'
    }[todo.status] || 'pending';

    // If moving to completed, show completion modal
    if (nextStatus === 'completed') {
      setCompletionModal({
        todoId: todo.id,
        todoTitle: todo.title
      });
      return;
    }

    const statusMessages = {
      'in-progress': `Started working on "${todo.title}"`,
      'completed': `Completed "${todo.title}"`,
      'pending': `Moved "${todo.title}" back to pending`
    };

    // Show notification
    setStatusChangeNotification({
      message: statusMessages[nextStatus],
      type: nextStatus === 'completed' ? 'success' : 'info'
    });

    // Clear notification after 3 seconds
    setTimeout(() => {
      setStatusChangeNotification(null);
    }, 3000);

    onUpdateTodo(todo.id, { status: nextStatus });
  };
  
  const handleCompleteTodo = () => {
    if (!completionModal || !completionSummary.trim()) return;
    
    onUpdateTodo(completionModal.todoId, { 
      status: 'completed',
      completionSummary: completionSummary.trim()
    });
    
    setStatusChangeNotification({
      message: `Completed "${completionModal.todoTitle}"`,
      type: 'success'
    });
    
    setTimeout(() => {
      setStatusChangeNotification(null);
    }, 3000);
    
    setCompletionModal(null);
    setCompletionSummary('');
  };
  
  const startEditingNotes = (todoId: string, currentNotes: string) => {
    setEditingNotes(todoId);
    setEditNotesValue(currentNotes || '');
  };
  
  const saveNotes = (todoId: string) => {
    onUpdateTodo(todoId, { notes: editNotesValue.trim() || undefined });
    setEditingNotes(null);
    setEditNotesValue('');
  };
  
  const cancelEditingNotes = () => {
    setEditingNotes(null);
    setEditNotesValue('');
  };
  
  const startEditingCompletion = (todoId: string, currentSummary: string) => {
    setEditingCompletion(todoId);
    setEditCompletionValue(currentSummary || '');
  };
  
  const saveCompletion = (todoId: string) => {
    onUpdateTodo(todoId, { completionSummary: editCompletionValue.trim() || undefined });
    setEditingCompletion(null);
    setEditCompletionValue('');
  };
  
  const cancelEditingCompletion = () => {
    setEditingCompletion(null);
    setEditCompletionValue('');
  };
  
  const generateMarkdown = () => {
    if (!project) return '';
    
    const now = new Date().toLocaleDateString();
    
    let markdown = `# ${project.name}\n\n`;
    
    if (project.description) {
      markdown += `${project.description}\n\n`;
    }
    
    markdown += `*Generated on ${now}*\n\n`;
    
    // Project statistics
    markdown += `## Project Overview\n\n`;
    markdown += `- **Total Todos**: ${originalTotalTodos}\n`;
    markdown += `- **Completed**: ${originalCompletedTodos} (${Math.round(originalCompletedPercent)}%)\n`;
    markdown += `- **In Progress**: ${originalInProgressTodos}\n`;
    markdown += `- **Pending**: ${originalPendingTodos}\n\n`;
    
    // Group todos by status
    const todosByStatus = {
      'completed': filteredTodos.filter(t => t.status === 'completed'),
      'in-progress': filteredTodos.filter(t => t.status === 'in-progress'),
      'pending': filteredTodos.filter(t => t.status === 'pending')
    };
    
    Object.entries(todosByStatus).forEach(([status, todos]) => {
      if (todos.length === 0) return;
      
      const statusTitle = status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
      const statusIcon = status === 'completed' ? '✅' : status === 'in-progress' ? '🔄' : '⏳';
      
      markdown += `## ${statusIcon} ${statusTitle} (${todos.length})\n\n`;
      
      todos.forEach((todo, index) => {
        markdown += `### ${index + 1}. ${todo.title}\n\n`;
        
        if (todo.description) {
          markdown += `${todo.description}\n\n`;
        }
        
        // Metadata
        markdown += `**Details:**\n`;
        markdown += `- Priority: ${todo.priority}\n`;
        if (todo.primaryArea) {
          markdown += `- Primary Area: ${todo.primaryArea}\n`;
        }
        if (todo.areas && todo.areas.length > 1) {
          markdown += `- Areas: ${todo.areas.join(', ')}\n`;
        }
        if (todo.estimatedDuration) {
          markdown += `- Estimated Duration: ${todo.estimatedDuration} minutes\n`;
        }
        if (todo.dependsOn && todo.dependsOn.length > 0) {
          const dependencyTitles = todo.dependsOn.map(depId => {
            const depTodo = project.todos.find(t => t.id === depId);
            return depTodo ? depTodo.title : `[Unknown: ${depId}]`;
          });
          markdown += `- Dependencies: ${dependencyTitles.join(', ')}\n`;
        }
        if (todo.completedAt && status === 'completed') {
          markdown += `- Completed: ${new Date(todo.completedAt).toLocaleDateString()}\n`;
        }
        markdown += `\n`;
        
        // Notes
        if (todo.notes) {
          markdown += `**Notes:**\n${todo.notes}\n\n`;
        }
        
        // Completion Summary
        if (todo.completionSummary && status === 'completed') {
          markdown += `**Completion Summary:**\n${todo.completionSummary}\n\n`;
        }
        
        markdown += `---\n\n`;
      });
    });
    
    // Phases if any
    if (project.phases && project.phases.length > 0) {
      markdown += `## Phases\n\n`;
      project.phases.forEach((phase, index) => {
        markdown += `${index + 1}. **${phase.name}**`;
        if (phase.description) {
          markdown += `: ${phase.description}`;
        }
        markdown += `\n`;
      });
      markdown += `\n`;
    }
    
    // Documents if any
    if (project.documents && project.documents.length > 0) {
      markdown += `## Documents\n\n`;
      project.documents.forEach((doc, index) => {
        markdown += `${index + 1}. [${doc.title}]`;
        if (doc.url) {
          markdown += `(${doc.url})`;
        } else if (doc.filePath) {
          markdown += `(${doc.filePath})`;
        }
        markdown += `\n`;
      });
      markdown += `\n`;
    }
    
    return markdown;
  };
  
  const copyMarkdownToClipboard = async () => {
    const markdown = generateMarkdown();
    
    try {
      await navigator.clipboard.writeText(markdown);
      setStatusChangeNotification({
        message: 'Project markdown copied to clipboard!',
        type: 'success'
      });
      
      setTimeout(() => {
        setStatusChangeNotification(null);
      }, 3000);
    } catch (err) {
      setStatusChangeNotification({
        message: 'Failed to copy to clipboard',
        type: 'warning'
      });
      
      setTimeout(() => {
        setStatusChangeNotification(null);
      }, 3000);
    }
  };

  // Simple derived data without useMemo to avoid hook ordering issues
  const sortedTodos = project ? [...project.todos].sort((a, b) => a.order - b.order) : [];
  
  let filteredTodos = selectedAreas.length === 0 
    ? sortedTodos 
    : sortedTodos.filter(todo => 
        todo.areas?.some(area => selectedAreas.includes(area)) ||
        selectedAreas.includes(todo.primaryArea)
      );
  
  // Apply status filtering if any statuses are selected
  if (selectedStatuses.length > 0) {
    filteredTodos = filteredTodos.filter(todo => selectedStatuses.includes(todo.status));
  }

  const toggleStatusFilter = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };
  
  const availableAreas = project ? (() => {
    const areas = new Set<string>();
    project.todos.forEach(todo => {
      if (todo.areas) {
        todo.areas.forEach(area => areas.add(area));
      }
      if (todo.primaryArea) {
        areas.add(todo.primaryArea);
      }
    });
    return Array.from(areas).sort();
  })() : [];
  
  const areaWorkload = project ? (() => {
    const workload = new Map<string, { total: number; completed: number; inProgress: number; pending: number }>();
    
    project.todos.forEach(todo => {
      const area = todo.primaryArea || 'unassigned';
      const current = workload.get(area) || { total: 0, completed: 0, inProgress: 0, pending: 0 };
      
      current.total++;
      if (todo.status === 'completed') current.completed++;
      else if (todo.status === 'in-progress') current.inProgress++;
      else current.pending++;
      
      workload.set(area, current);
    });
    
    return Array.from(workload.entries())
      .map(([area, stats]) => ({ area, ...stats }))
      .sort((a, b) => b.total - a.total);
  })() : [];
  
  // Original project counts (for header and stats buttons)
  const originalCompletedTodos = sortedTodos.filter(t => t.status === 'completed').length;
  const originalInProgressTodos = sortedTodos.filter(t => t.status === 'in-progress').length;
  const originalPendingTodos = sortedTodos.filter(t => t.status === 'pending').length;
  const originalTotalTodos = sortedTodos.length;
  const originalCompletedPercent = originalTotalTodos > 0 ? (originalCompletedTodos / originalTotalTodos) * 100 : 0;
  const originalInProgressPercent = originalTotalTodos > 0 ? (originalInProgressTodos / originalTotalTodos) * 100 : 0;
  
  // Filtered counts (for display purposes in the main list)
  const completedTodos = filteredTodos.filter(t => t.status === 'completed').length;
  const inProgressTodos = filteredTodos.filter(t => t.status === 'in-progress').length;
  const pendingTodos = filteredTodos.filter(t => t.status === 'pending').length;
  const totalTodos = filteredTodos.length;
  const completedPercent = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;
  const inProgressPercent = totalTodos > 0 ? (inProgressTodos / totalTodos) * 100 : 0;

  return (
    <>
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Status Change Notification */}
      {statusChangeNotification && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className={`
            px-4 py-3 rounded-lg shadow-lg border
            ${statusChangeNotification.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : statusChangeNotification.type === 'warning'
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
            }
          `}>
            <div className="flex items-center gap-2">
              {statusChangeNotification.type === 'success' && <CheckCircle className="w-4 h-4" />}
              {statusChangeNotification.type === 'info' && <Clock className="w-4 h-4" />}
              <span className="text-sm font-medium">{statusChangeNotification.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Row - Title and Actions */}
          <div className="flex justify-between items-center py-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                title="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.description && (
                  <p className="text-gray-600 mt-1">{project.description}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                    viewMode === 'list'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="text-sm font-medium">List</span>
                </button>
                <button
                  onClick={() => setViewMode('graph')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                    viewMode === 'graph'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Network className="w-4 h-4" />
                  <span className="text-sm font-medium">Graph</span>
                </button>
              </div>

              {/* Area Filter */}
              <div className="relative">
                <button
                  onClick={() => setShowAreaFilter(!showAreaFilter)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 ${
                    selectedAreas.length > 0
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="text-sm font-medium">Areas</span>
                  {selectedAreas.length > 0 && (
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                      {selectedAreas.length}
                    </span>
                  )}
                </button>
                
                {/* Area Filter Dropdown */}
                {showAreaFilter && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">Filter by Areas</h4>
                      {selectedAreas.length > 0 && (
                        <button
                          onClick={() => setSelectedAreas([])}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    
                    {/* Quick Filter Buttons */}
                    <div className="mb-3">
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => setSelectedAreas(['frontend', 'ui/ux'])}
                          className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full transition-colors"
                        >
                          Frontend
                        </button>
                        <button
                          onClick={() => setSelectedAreas(['backend', 'api', 'database'])}
                          className="px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded-full transition-colors"
                        >
                          Backend
                        </button>
                        <button
                          onClick={() => setSelectedAreas(['testing', 'documentation'])}
                          className="px-2 py-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full transition-colors"
                        >
                          Quality
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {availableAreas.map(area => {
                        const areaStats = areaWorkload.find(a => a.area === area);
                        const todoCount = areaStats?.total || 0;
                        const completedCount = areaStats?.completed || 0;
                        const completionRate = todoCount > 0 ? (completedCount / todoCount) * 100 : 0;
                        
                        return (
                          <label key={area} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedAreas.includes(area)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAreas([...selectedAreas, area]);
                                } else {
                                  setSelectedAreas(selectedAreas.filter(a => a !== area));
                                }
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-sm font-medium text-gray-700">{area}</span>
                              {todoCount > 0 && (
                                <span className="text-xs text-gray-500">
                                  ({completedCount}/{todoCount})
                                </span>
                              )}
                            </div>
                            <div className="w-20 bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full transition-all duration-300"
                                style={{ width: `${completionRate}%` }}
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Button */}
              <button
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Export Button */}
              <button
                onClick={copyMarkdownToClipboard}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200"
                title="Copy to Clipboard"
              >
                <span className="text-sm font-medium">Copy</span>
              </button>

              {/* Add Todo Button */}
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add Todo</span>
              </button>
            </div>
          </div>

          {/* Bottom Row - Progress and Metrics */}
          <div className="py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Progress Section */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Progress Overview</h3>
                  <div className="text-sm text-gray-600">
                    {originalCompletedTodos} of {originalTotalTodos} completed ({Math.round(originalCompletedPercent)}%)
                  </div>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden mb-3">
                  <div className="flex h-full">
                    <div 
                      className="bg-green-500 transition-all duration-500"
                      style={{ width: `${originalCompletedPercent}%` }}
                    />
                    <div 
                      className="bg-orange-500 transition-all duration-500"
                      style={{ width: `${originalInProgressPercent}%` }}
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">{originalCompletedTodos} Completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-gray-600">{originalInProgressTodos} In Progress</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                    <span className="text-gray-600">{originalPendingTodos} Pending</span>
                  </div>
                </div>
              </div>

              {/* Area Workload Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Area Distribution</h3>
                <div className="flex flex-wrap gap-2">
                  {areaWorkload.slice(0, 6).map(({ area, total, completed }) => {
                    const completionRate = total > 0 ? (completed / total) * 100 : 0;
                    const areaColor = AREA_COLORS[area] || { color: '#6B7280', bgColor: 'bg-gray-100', icon: '📄' };
                    
                    return (
                      <div 
                        key={area}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border"
                        style={{ 
                          backgroundColor: `${areaColor.color}10`,
                          borderColor: `${areaColor.color}40`,
                          color: areaColor.color
                        }}
                        title={`${area}: ${completed}/${total} completed (${Math.round(completionRate)}%)`}
                      >
                        <span style={{ color: 'initial' }}>{areaColor.icon}</span>
                        <span>{area}</span>
                        <span className="text-xs opacity-70">{total}</span>
                      </div>
                    );
                  })}
                  {areaWorkload.length > 5 && (
                    <div className="text-xs text-gray-400">
                      +{areaWorkload.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === 'list' ? (
          // List View
          <div className="space-y-4">
            {/* Stats Overview */}
            {originalTotalTodos > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <button
                  onClick={() => setSelectedStatuses([])}
                  className={`bg-white rounded-lg p-4 border transition-all duration-200 text-left w-full ${
                    selectedStatuses.length === 0 
                      ? 'border-blue-300 bg-blue-50 shadow-md' 
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total</p>
                      <p className="text-2xl font-bold text-gray-900">{originalTotalTodos}</p>
                    </div>
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <List className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => toggleStatusFilter('pending')}
                  className={`bg-white rounded-lg p-4 border transition-all duration-200 text-left w-full ${
                    selectedStatuses.includes('pending')
                      ? 'border-gray-400 bg-gray-50 shadow-md' 
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pending</p>
                      <p className="text-2xl font-bold text-gray-900">{originalPendingTodos}</p>
                    </div>
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border-2 border-gray-400" />
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => toggleStatusFilter('in-progress')}
                  className={`bg-white rounded-lg p-4 border transition-all duration-200 text-left w-full ${
                    selectedStatuses.includes('in-progress')
                      ? 'border-orange-400 bg-orange-50 shadow-md' 
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-600">In Progress</p>
                      <p className="text-2xl font-bold text-orange-900">{originalInProgressTodos}</p>
                    </div>
                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                      <Clock className="w-4 h-4 text-orange-600" />
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => toggleStatusFilter('completed')}
                  className={`bg-white rounded-lg p-4 border transition-all duration-200 text-left w-full ${
                    selectedStatuses.includes('completed')
                      ? 'border-green-400 bg-green-50 shadow-md' 
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-600">Completed</p>
                      <p className="text-2xl font-bold text-green-900">{originalCompletedTodos}</p>
                    </div>
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                </button>
              </div>
            )}

            {filteredTodos.length === 0 ? (
              selectedAreas.length > 0 ? (
                <div className="card text-center py-16">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center">
                    <Filter className="w-12 h-12 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No todos match selected areas</h3>
                  <p className="text-gray-600 mb-6">Try adjusting your area filters or create a new todo!</p>
                  <button
                    onClick={() => setSelectedAreas([])}
                    className="btn-secondary mr-3"
                  >
                    Clear Filters
                  </button>
                  <button
                    onClick={() => onCreateTodo(project.id, '', {})}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    Create Todo
                  </button>
                </div>
              ) : (
                <div className="card text-center py-16">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center">
                    <List className="w-12 h-12 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No todos yet</h3>
                  <p className="text-gray-600 mb-6">Add your first todo to get started!</p>
                  <button
                    onClick={() => onCreateTodo(project.id, '', {})}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    Create First Todo
                  </button>
                </div>
              )
            ) : (
              filteredTodos.map((todo, index) => (
                <div
                  key={todo.id}
                  className={`
                    card p-6 cursor-pointer transition-all duration-300 border-l-4 group
                    ${getStatusColors(todo.status)}
                    hover:shadow-lg hover:-translate-y-1
                    ${todo.blockedBy.length > 0 ? 'opacity-60' : ''}
                    ${selectedTodo === todo.id ? 'ring-2 ring-blue-500 shadow-lg' : ''}
                  `}
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                    animation: 'fadeInUp 0.4s ease-out forwards'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedTodo(selectedTodo === todo.id ? null : todo.id);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!todo.blockedBy.length) {
                          toggleTodoStatus(todo);
                          // Add visual feedback
                          e.currentTarget.style.transform = 'scale(1.2)';
                          setTimeout(() => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }, 150);
                        }
                      }}
                      className="flex-shrink-0 mt-1 p-1 rounded-full hover:bg-gray-100 transition-all duration-200 hover:scale-110"
                      disabled={todo.blockedBy.length > 0}
                      title={todo.blockedBy.length > 0 ? "This todo is blocked" : "Click to change status"}
                    >
                      {getStatusIcon(todo.status)}
                    </button>
                    
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg mb-2 group-hover:text-blue-600 transition-colors duration-200">
                            {todo.title}
                          </h3>
                          {todo.description && (
                            <p className="text-gray-600 mb-3 leading-relaxed">{todo.description}</p>
                          )}
                          
                          {/* Notes section */}
                          {(todo.notes || editingNotes === todo.id) && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-blue-900">📝 Notes</h4>
                                {editingNotes !== todo.id ? (
                                  <button
                                    onClick={() => startEditingNotes(todo.id, todo.notes || '')}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    Edit
                                  </button>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => saveNotes(todo.id)}
                                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelEditingNotes}
                                      className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                              {editingNotes === todo.id ? (
                                <textarea
                                  value={editNotesValue}
                                  onChange={(e) => setEditNotesValue(e.target.value)}
                                  className="w-full text-sm border border-blue-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  rows={3}
                                  placeholder="Add notes or context for this todo"
                                  autoFocus
                                />
                              ) : (
                                <p className="text-sm text-blue-800 whitespace-pre-wrap">
                                  {todo.notes || <span className="italic text-blue-600">Click Edit to add notes</span>}
                                </p>
                              )}
                            </div>
                          )}
                          
                          {/* Completion Summary */}
                          {todo.status === 'completed' && (todo.completionSummary || editingCompletion === todo.id) && (
                            <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-green-900">✅ Completion Summary</h4>
                                {editingCompletion !== todo.id ? (
                                  <button
                                    onClick={() => startEditingCompletion(todo.id, todo.completionSummary || '')}
                                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                                  >
                                    Edit
                                  </button>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => saveCompletion(todo.id)}
                                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelEditingCompletion}
                                      className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                              {editingCompletion === todo.id ? (
                                <textarea
                                  value={editCompletionValue}
                                  onChange={(e) => setEditCompletionValue(e.target.value)}
                                  className="w-full text-sm border border-green-300 rounded p-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  rows={3}
                                  placeholder="Describe what was accomplished"
                                  autoFocus
                                />
                              ) : (
                                <p className="text-sm text-green-800 whitespace-pre-wrap">
                                  {todo.completionSummary || <span className="italic text-green-600">Click Edit to add completion summary</span>}
                                </p>
                              )}
                            </div>
                          )}
                          
                          {/* Add Notes button for todos without notes */}
                          {!todo.notes && editingNotes !== todo.id && (
                            <div className="mt-3">
                              <button
                                onClick={() => startEditingNotes(todo.id, '')}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                              >
                                + Add Notes
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div 
                            className={`w-3 h-3 rounded-full ${getPriorityColor(todo.priority)}`} 
                            title={`${todo.priority} priority`}
                          />
                          <span className="text-xs text-gray-400 capitalize">{todo.priority}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                        {/* Primary Area Badge */}
                        {todo.primaryArea && AREA_COLORS[todo.primaryArea] && (
                          <span className={`
                            inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                            ${AREA_COLORS[todo.primaryArea].bgColor} text-gray-800
                          `}>
                            <span>{AREA_COLORS[todo.primaryArea].icon}</span>
                            {todo.primaryArea}
                            {todo.areas && todo.areas.length > 1 && (
                              <span className="text-xs opacity-60">+{todo.areas.length - 1}</span>
                            )}
                          </span>
                        )}
                        
                        {todo.estimatedDuration && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {todo.estimatedDuration}min
                          </span>
                        )}
                        
                        {todo.dependsOn.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Link className="w-3 h-3" />
                            {todo.dependsOn.length} dependencies
                          </span>
                        )}
                        
                        {todo.blockedBy.length > 0 && (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertCircle className="w-3 h-3" />
                            Blocked
                          </span>
                        )}
                        
                        <span className="text-xs text-gray-400 ml-auto">
                          Updated {new Date(todo.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // Graph View
          <div className="card p-6">
            {nodes.length === 0 ? (
              <div className="text-center py-16">
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <Network className="w-12 h-12 text-blue-500" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No dependency graph</h3>
                <p className="text-gray-600 mb-6">Add todos and dependencies to see the graph visualization!</p>
              </div>
            ) : (
              <div className="overflow-auto bg-gray-50 rounded-lg p-4">
                <svg 
                  width={Math.max(1000, nodes.reduce((max, n) => Math.max(max, n.x + 240), 0))} 
                  height={Math.max(400, 
                    Math.max(
                      nodes.reduce((max, n) => Math.max(max, n.y + 90), 0),
                      swimLanes.reduce((max, lane) => Math.max(max, lane.y + lane.height), 0)
                    )
                  )}
                  className="bg-white rounded-lg shadow-sm"
                  onClick={() => {
                    setSelectedTodo(null);
                    setSelectedEdge(null);
                    setHoveredEdge(null);
                  }}
                >
                  {/* Grid pattern for better visual organization */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
                    </pattern>
                    <filter id="dropShadow" x="0" y="0" width="120%" height="120%">
                      <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#00000020"/>
                    </filter>
                    {/* Arrow marker definition */}
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#94a3b8"
                      />
                    </marker>
                    <marker
                      id="arrowhead-highlighted"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#2563eb"
                      />
                    </marker>
                  </defs>
                  
                  {/* Grid background */}
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  
                  {/* Swim lane backgrounds */}
                  {swimLanes.map((lane, index) => {
                    const labelY = lane.y + (lane.height / 2) + 4; // Center vertically in the lane
                    const maxX = Math.max(1000, nodes.reduce((max, n) => Math.max(max, n.x + 240), 0));
                    const labelX = maxX - 180; // Position near the right edge
                    
                    return (
                      <g key={`swim-lane-${lane.area}`}>
                        <rect
                          x={0}
                          y={lane.y}
                          width="100%"
                          height={lane.height}
                          fill={lane.color}
                          opacity="0.05"
                          stroke={lane.color}
                          strokeWidth="1"
                          strokeOpacity="0.1"
                        />
                        {/* Area label with background */}
                        <rect
                          x={labelX - 5}
                          y={labelY - 12}
                          width="170"
                          height="20"
                          fill="white"
                          stroke={lane.color}
                          strokeWidth="1"
                          rx="10"
                          opacity="0.9"
                        />
                        <text
                          x={labelX}
                          y={labelY}
                          fill={lane.color}
                          fontSize="11"
                          fontWeight="600"
                          textAnchor="start"
                        >
                          {lane.icon} {lane.area} ({lane.todoCount} todo{lane.todoCount !== 1 ? 's' : ''})
                        </text>
                      </g>
                    );
                  })}
                  
                  {/* Level indicators */}
                  {Array.from(new Set(nodes.map(n => n.level))).map(level => (
                    <g key={`level-${level}`}>
                      <rect
                        x={20 + level * 280 - 15}
                        y={0}
                        width="270"
                        height="100%"
                        fill={level % 2 === 0 ? '#f8fafc' : '#f1f5f9'}
                        opacity="0.3"
                      />
                      <text
                        x={20 + level * 280 + 125}
                        y={30}
                        fill="#6b7280"
                        fontSize="12"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        Level {level}
                      </text>
                    </g>
                  ))}
                  
                  
                  {/* Render edges with simple direct bezier curves */}
                  {edges.map((edge, i) => {
                    const edgeId = `${edge.from}-${edge.to}`;
                    const isHighlighted = hoveredEdge === edgeId || selectedEdge === edgeId;
                    const isConnectedToSelected = selectedTodo && (edge.from === selectedTodo || edge.to === selectedTodo);
                    const shouldShow = !selectedTodo || isConnectedToSelected;
                    
                    // Check if this is a cross-area dependency
                    const fromTodo = nodes.find(n => n.id === edge.from)?.todo;
                    const toTodo = nodes.find(n => n.id === edge.to)?.todo;
                    const isCrossArea = fromTodo?.primaryArea && toTodo?.primaryArea && 
                                       fromTodo.primaryArea !== toTodo.primaryArea;
                    
                    // Direct bezier curve - short and simple
                    const horizontalDistance = edge.toX - edge.fromX;
                    const ctrlOffset = Math.min(60, Math.abs(horizontalDistance) * 0.3);
                    
                    const pathData = `M ${edge.fromX} ${edge.fromY}
                                     C ${edge.fromX + ctrlOffset} ${edge.fromY}
                                       ${edge.toX - ctrlOffset} ${edge.toY}
                                       ${edge.toX} ${edge.toY}`;
                    
                    return (
                      <g key={`edge-${i}`} 
                         style={{ 
                           opacity: shouldShow ? 1 : 0.15,
                           transition: 'opacity 0.3s ease'
                         }}>
                        {/* Invisible thick path for easier interaction */}
                        <path
                          d={pathData}
                          stroke="transparent"
                          strokeWidth="12"
                          fill="none"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredEdge(edgeId)}
                          onMouseLeave={() => setHoveredEdge(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEdge(selectedEdge === edgeId ? null : edgeId);
                          }}
                        />
                        
                        {/* Main path */}
                        <path
                          d={pathData}
                          stroke={isHighlighted ? "#3b82f6" : (isCrossArea ? "#f59e0b" : "#94a3b8")}
                          strokeWidth={isHighlighted ? "2.5" : (isCrossArea ? "2" : "1.5")}
                          strokeDasharray={isCrossArea ? "5,5" : "none"}
                          fill="none"
                          markerEnd={isHighlighted ? "url(#arrowhead-highlighted)" : "url(#arrowhead)"}
                          pointerEvents="none"
                          className="transition-all duration-200"
                        />
                      </g>
                    );
                  })}
                  
                  {/* Render nodes with proper text handling - always shown */}
                  {nodes.map((node) => {
                    const isSelected = selectedTodo === node.id;
                    const isConnectedToSelectedEdge = selectedEdge && 
                      (selectedEdge.startsWith(node.id + '-') || selectedEdge.endsWith('-' + node.id));
                    const isHighlighted = isSelected || isConnectedToSelectedEdge;
                    
                    return (
                      <g key={node.id} filter="url(#dropShadow)">
                        {/* Main node rectangle */}
                        <rect
                          x={node.x}
                          y={node.y}
                          width="200"
                          height="70"
                          rx="8"
                          fill={node.todo.primaryArea && AREA_COLORS[node.todo.primaryArea] 
                            ? `${AREA_COLORS[node.todo.primaryArea].color}15` 
                            : 'white'}
                          stroke={isHighlighted ? '#3b82f6' : 
                                  (node.todo.primaryArea && AREA_COLORS[node.todo.primaryArea] 
                                    ? AREA_COLORS[node.todo.primaryArea].color 
                                    : '#e5e7eb')}
                          strokeWidth={isHighlighted ? '3' : '2'}
                          className="cursor-pointer transition-all duration-200 hover:stroke-blue-400"
                          style={{
                            filter: isHighlighted ? 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.4))' : 'none'
                          }}
                          onClick={(e) => {
                            setSelectedTodo(selectedTodo === node.id ? null : node.id);
                            setSelectedEdge(null); // Clear edge selection when selecting a node
                            if (!node.todo.blockedBy.length) {
                              toggleTodoStatus(node.todo);
                              // Add visual feedback for graph nodes
                              e.currentTarget.style.filter = 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.8))';
                              setTimeout(() => {
                                e.currentTarget.style.filter = isHighlighted ? 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.4))' : 'none';
                              }, 300);
                            }
                          }}
                        />
                      
                      {/* Status indicator stripe */}
                      <rect
                        x={node.x}
                        y={node.y}
                        width="200"
                        height="6"
                        rx="8"
                        fill={node.todo.status === 'completed' ? '#10b981' : 
                              node.todo.status === 'in-progress' ? '#f59e0b' : '#6b7280'}
                      />
                      
                      {/* Priority indicator */}
                      <circle
                        cx={node.x + 15}
                        cy={node.y + 20}
                        r="4"
                        fill={getPriorityColor(node.todo.priority)}
                      />
                      
                      {/* Area icon indicator */}
                      {node.todo.primaryArea && AREA_COLORS[node.todo.primaryArea] && (
                        <text
                          x={node.x + 15}
                          y={node.y + 55}
                          fontSize="12"
                          textAnchor="middle"
                          fill={AREA_COLORS[node.todo.primaryArea].color}
                        >
                          {AREA_COLORS[node.todo.primaryArea].icon}
                        </text>
                      )}
                      
                      {/* Title - always prominent */}
                      <text
                        x={node.x + 30}
                        y={node.y + 25}
                        fontSize="14"
                        fontWeight="700"
                        fill="#111827"
                      >
                        {node.todo.title.length > 18 ? `${node.todo.title.slice(0, 18)}...` : node.todo.title}
                      </text>
                      
                      {/* Status - smaller and less prominent */}
                      <text
                        x={node.x + 30}
                        y={node.y + 42}
                        fontSize="10"
                        fontWeight="500"
                        fill="#9ca3af"
                      >
                        {node.todo.status.replace('-', ' ').toUpperCase()}
                      </text>
                      
                      {/* Area name */}
                      {node.todo.primaryArea && AREA_COLORS[node.todo.primaryArea] && (
                        <text
                          x={node.x + 30}
                          y={node.y + 55}
                          fontSize="9"
                          fontWeight="500"
                          fill={AREA_COLORS[node.todo.primaryArea].color}
                        >
                          {node.todo.primaryArea}
                        </text>
                      )}
                      
                      {/* Dependencies count */}
                      {node.todo.dependsOn.length > 0 && (
                        <g>
                          <circle
                            cx={node.x + 170}
                            cy={node.y + 20}
                            r="8"
                            fill="#dbeafe"
                            stroke="#3b82f6"
                            strokeWidth="1"
                          />
                          <text
                            x={node.x + 170}
                            y={node.y + 24}
                            fontSize="10"
                            fontWeight="600"
                            fill="#1e40af"
                            textAnchor="middle"
                          >
                            {node.todo.dependsOn.length}
                          </text>
                        </g>
                      )}
                      
                      {/* Duration */}
                      {node.todo.estimatedDuration && (
                        <text
                          x={node.x + 30}
                          y={node.y + 55}
                          fontSize="10"
                          fill="#9ca3af"
                        >
                          {node.todo.estimatedDuration}min
                        </text>
                      )}
                      
                      {/* Area indicator */}
                      {node.todo.primaryArea && AREA_COLORS[node.todo.primaryArea] && (
                        <g>
                          <rect
                            x={node.x + 115}
                            y={node.y + 46}
                            width="26"
                            height="16"
                            rx="8"
                            fill={AREA_COLORS[node.todo.primaryArea].color}
                            fillOpacity="0.1"
                            stroke={AREA_COLORS[node.todo.primaryArea].color}
                            strokeWidth="1"
                          />
                          <text
                            x={node.x + 128}
                            y={node.y + 56}
                            fontSize="10"
                            fill={AREA_COLORS[node.todo.primaryArea].color}
                            textAnchor="middle"
                            fontWeight="600"
                          >
                            {AREA_COLORS[node.todo.primaryArea].icon}
                          </text>
                        </g>
                      )}
                      
                      {/* Blocked indicator overlay */}
                      {node.todo.blockedBy.length > 0 && (
                        <g>
                          <rect
                            x={node.x + 120}
                            y={node.y + 45}
                            width="60"
                            height="18"
                            rx="9"
                            fill="#fee2e2"
                            stroke="#ef4444"
                            strokeWidth="1"
                          />
                          <text
                            x={node.x + 150}
                            y={node.y + 55}
                            fill="#dc2626"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            BLOCKED
                          </text>
                        </g>
                      )}
                    </g>
                    );
                  })}
                </svg>
                
                {/* Graph Legend */}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Legend</h4>
                  <div className="flex flex-wrap gap-6 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-gray-400 rounded"></div>
                      <span className="text-gray-600">Same area dependency</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-amber-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b, #f59e0b 3px, transparent 3px, transparent 6px)' }}></div>
                      <span className="text-gray-600">Cross-area dependency</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
                      <span className="text-gray-600">Area-colored node</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    
    {/* Completion Summary Modal */}
    {completionModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Complete Todo: {completionModal.todoTitle}
          </h2>
          
          <div className="mb-4">
            <label htmlFor="completion-summary" className="block text-sm font-medium text-gray-700 mb-2">
              Please provide a summary of what was done:
            </label>
            <textarea
              id="completion-summary"
              value={completionSummary}
              onChange={(e) => setCompletionSummary(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors resize-vertical"
              placeholder="Describe the changes made, files modified, features implemented, etc."
              autoFocus
            />
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setCompletionModal(null);
                setCompletionSummary('');
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCompleteTodo}
              disabled={!completionSummary.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Complete Todo
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}