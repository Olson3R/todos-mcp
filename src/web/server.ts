import express from 'express';
import * as path from 'path';
import { TodosStorage } from '../storage.js';
import { ValidationError } from '../validation.js';

const app = express();
const storage = new TodosStorage();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Workspace routes
app.get('/api/workspaces', async (req, res) => {
  try {
    const workspaces = await storage.listWorkspaces();
    res.json(workspaces);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

// Project routes
app.get('/api/projects', async (req, res) => {
  try {
    const { workspaceId } = req.query;
    const projects = await storage.listProjects(workspaceId as string);
    res.json(projects);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { name, description, workspacePath } = req.body;
    if (!name || !workspacePath) {
      return res.status(400).json({ error: 'Name and workspacePath are required' });
    }
    
    const project = await storage.createProject({ name, description, workspacePath });
    res.status(201).json(project);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    
    const project = await storage.updateProject(req.params.id, updates);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const success = await storage.deleteProject(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ message: 'Project deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

// Phase routes
app.post('/api/projects/:projectId/phases', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const phase = await storage.createPhase({
      projectId: req.params.projectId,
      name,
      description
    });
    
    if (!phase) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.status(201).json(phase);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

// Todo routes
app.post('/api/projects/:projectId/todos', async (req, res) => {
  try {
    const { title, description, phaseId } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const todo = await storage.createTodo({
      projectId: req.params.projectId,
      title,
      description,
      phaseId
    });
    
    if (!todo) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.status(201).json(todo);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.put('/api/todos/:id', async (req, res) => {
  try {
    const { title, description, status, phaseId } = req.body;
    const todo = await storage.updateTodo({
      id: req.params.id,
      title,
      description,
      status,
      phaseId
    });
    
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    
    res.json(todo);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  try {
    const success = await storage.deleteTodo(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.json({ message: 'Todo deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.put('/api/projects/:projectId/todos/reorder', async (req, res) => {
  try {
    const { todoIds } = req.body;
    if (!Array.isArray(todoIds)) {
      return res.status(400).json({ error: 'todoIds must be an array' });
    }
    
    const success = await storage.reorderTodos({
      projectId: req.params.projectId,
      todoIds
    });
    
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ message: 'Todos reordered' });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

// Document routes
app.post('/api/projects/:projectId/documents', async (req, res) => {
  try {
    const { type, title, url, filePath, confluenceSpace, confluencePage } = req.body;
    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }
    
    const document = await storage.attachDocument({
      projectId: req.params.projectId,
      type,
      title,
      url,
      filePath,
      confluenceSpace,
      confluencePage
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.status(201).json(document);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

app.delete('/api/projects/:projectId/documents/:documentId', async (req, res) => {
  try {
    const success = await storage.removeDocument(req.params.projectId, req.params.documentId);
    if (!success) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ message: 'Document removed' });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

// Serve the web interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web interface running on http://localhost:${PORT}`);
});