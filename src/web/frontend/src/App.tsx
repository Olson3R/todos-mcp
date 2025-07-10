import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { Settings, Users, Activity, FolderOpen, Plus } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { WorkspaceView } from './components/WorkspaceView';
import { ProjectViewWrapper } from './components/ProjectViewWrapper';


function App() {
  const navigate = useNavigate();

  // Redirect to default workspace if no workspace in URL
  useEffect(() => {
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '') {
      navigate('/workspace/%2Fworkspace', { replace: true }); // /workspace encoded
    }
  }, [navigate]);

  return (
    <Routes>
      <Route path="/workspace/:workspacePath/project/:projectId" element={<ProjectViewWrapper />} />
      <Route path="/workspace/:workspacePath" element={<WorkspaceView />} />
      <Route path="*" element={<WorkspaceView />} />
    </Routes>
  );
}

export default App;