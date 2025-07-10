// Event types
export interface LiveUpdateEvent {
  id: string;
  type: string;
  workerId: string;
  workerName?: string;
  timestamp: Date;
  message: string;
  projectId?: string;
  todoId?: string;
}