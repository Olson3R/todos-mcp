import React from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { ProjectView } from './ProjectView';

export function ProjectViewWrapper() {
  const { workspacePath, projectId } = useParams<{ workspacePath: string; projectId: string }>();
  
  const decodedPath = workspacePath ? decodeURIComponent(workspacePath) : '/workspace';
  
  const {
    projects,
    createTodo,
    updateTodo
  } = useWebSocket({
    workspacePath: decodedPath,
    workerName: 'Web User',
    capabilities: ['ui', 'coordination', 'management'],
    purpose: 'Managing todos via web interface'
  });

  return (
    <ProjectView
      projects={projects}
      onCreateTodo={createTodo}
      onUpdateTodo={updateTodo}
    />
  );
}