import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Settings, Eye, List, Network, CheckCircle, Clock, AlertCircle, Link } from 'lucide-react';

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

export function ProjectView({ projects, onCreateTodo, onUpdateTodo }: ProjectViewProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [graphMode, setGraphMode] = useState<'detailed'>('detailed');
  const [selectedTodo, setSelectedTodo] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  const project = projects.find(p => p.id === projectId);

  // Calculate dependency graph layout with proper hierarchy and spacing
  const { nodes, edges } = useMemo(() => {
    if (!project) return { nodes: [], edges: [] };

    const todos = project.todos;
    if (todos.length === 0) return { nodes: [], edges: [] };
    
    console.log('📊 Graph Debug - Input todos:', todos.map(t => ({
      id: t.id, 
      title: t.title, 
      dependsOn: t.dependsOn, 
      dependents: t.dependents
    })));
    
    // Build dependency graph
    const todoMap = new Map(todos.map(t => [t.id, t]));
    
    // Calculate dependency levels using proper topological sort
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    
    // Recursive function to calculate maximum depth from dependencies
    const calculateLevel = (todoId: string, path = new Set<string>()): number => {
      if (path.has(todoId)) {
        console.warn('Circular dependency detected:', Array.from(path), '->', todoId);
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
    
    console.log('📊 Graph Debug - Calculated levels:', 
      Array.from(levels.entries()).map(([id, level]) => ({ 
        id, 
        level, 
        title: todoMap.get(id)?.title 
      }))
    );
    
    // Group todos by level
    const levelGroups = new Map<number, TodoItem[]>();
    todos.forEach(todo => {
      const level = levels.get(todo.id) || 0;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(todo);
    });
    
    console.log('📊 Graph Debug - Level groups:', 
      Array.from(levelGroups.entries()).map(([level, todos]) => ({
        level,
        count: todos.length,
        todos: todos.map(t => t.title)
      }))
    );
    
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
    const offsetX = 40;
    const offsetY = 40;

    // Initial positioning
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
    
    // Update positions after reordering
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

    console.log('📊 Graph Debug - Final layout:', {
      nodeCount: graphNodes.length,
      edgeCount: graphEdges.length,
      levels: Array.from(levelGroups.keys()).sort()
    });

    return { 
      nodes: graphNodes, 
      edges: graphEdges
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

    onUpdateTodo(todo.id, { status: nextStatus });
  };

  const sortedTodos = [...project.todos].sort((a, b) => a.order - b.order);
  const completedTodos = sortedTodos.filter(t => t.status === 'completed').length;
  const totalTodos = sortedTodos.length;
  const progress = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-gray-600">{project.description}</p>
                )}
              </div>
              
              {/* Progress indicator */}
              <div className="flex items-center gap-3">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 rounded-full h-2 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600">
                  {completedTodos}/{totalTodos}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex gap-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-2 px-3 py-1 rounded text-sm font-medium transition-colors ${
                      viewMode === 'list' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <List className="w-4 h-4" />
                    List
                  </button>
                  <button
                    onClick={() => setViewMode('graph')}
                    className={`flex items-center gap-2 px-3 py-1 rounded text-sm font-medium transition-colors ${
                      viewMode === 'graph' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Network className="w-4 h-4" />
                    Graph
                  </button>
                </div>
                
              </div>
              
              <button className="p-2 text-gray-400 hover:text-gray-600">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === 'list' ? (
          // List View
          <div className="space-y-4">
            {sortedTodos.length === 0 ? (
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
            ) : (
              sortedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className={`
                    card p-6 cursor-pointer transition-all duration-200 border-l-4
                    ${getStatusColors(todo.status)}
                    hover:shadow-lg hover:scale-[1.01]
                    ${todo.blockedBy.length > 0 ? 'opacity-60' : ''}
                    ${selectedTodo === todo.id ? 'ring-2 ring-blue-500' : ''}
                  `}
                  onClick={() => {
                    setSelectedTodo(selectedTodo === todo.id ? null : todo.id);
                    if (!todo.blockedBy.length) toggleTodoStatus(todo);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(todo.status)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg mb-2">{todo.title}</h3>
                          {todo.description && (
                            <p className="text-gray-600 mb-3">{todo.description}</p>
                          )}
                        </div>
                        
                        <div className={`w-2 h-2 rounded-full ${getPriorityColor(todo.priority)}`} />
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="capitalize">{todo.priority} priority</span>
                        
                        {todo.estimatedDuration && (
                          <span>Est. {todo.estimatedDuration}min</span>
                        )}
                        
                        {todo.dependsOn.length > 0 && (
                          <div className="flex items-center">
                            <Link className="w-4 h-4 mr-1" />
                            {todo.dependsOn.length} dependencies
                          </div>
                        )}
                        
                        {todo.blockedBy.length > 0 && (
                          <div className="flex items-center text-red-600">
                            <AlertCircle className="w-4 h-4 mr-1" />
                            Blocked
                          </div>
                        )}
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
                  height={Math.max(400, nodes.reduce((max, n) => Math.max(max, n.y + 90), 0))}
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
                          stroke={isHighlighted ? "#3b82f6" : "#94a3b8"}
                          strokeWidth={isHighlighted ? "2.5" : "1.5"}
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
                          fill="white"
                          stroke={isHighlighted ? '#3b82f6' : '#e5e7eb'}
                          strokeWidth={isHighlighted ? '3' : '2'}
                          className="cursor-pointer transition-all duration-200 hover:stroke-blue-400"
                          style={{
                            filter: isHighlighted ? 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.4))' : 'none'
                          }}
                          onClick={() => {
                            setSelectedTodo(selectedTodo === node.id ? null : node.id);
                            setSelectedEdge(null); // Clear edge selection when selecting a node
                            if (!node.todo.blockedBy.length) toggleTodoStatus(node.todo);
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}