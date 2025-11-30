import type { 
  Employee, 
  RosterShift, 
  Absence, 
  Resource, 
  WeeklyAssignment, 
  InsertWeeklyAssignment,
  ProjectInitiative,
  InsertProjectInitiative,
  ProjectTask,
  InsertProjectTask,
  ProjectDocument,
  InsertProjectDocument,
  Approval,
  InsertApproval,
  TaskActivity,
  InsertTaskActivity
} from "@shared/schema";

const API_BASE = "/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }
  
  if (response.status === 204) {
    return {} as T;
  }
  
  return response.json();
}

// Employee API
export const employeeApi = {
  getAll: async (): Promise<Employee[]> => {
    const response = await fetch(`${API_BASE}/employees`);
    return handleResponse<Employee[]>(response);
  },
  
  getById: async (id: number): Promise<Employee> => {
    const response = await fetch(`${API_BASE}/employees/${id}`);
    return handleResponse<Employee>(response);
  },
  
  create: async (data: Omit<Employee, "id" | "createdAt">): Promise<Employee> => {
    const response = await fetch(`${API_BASE}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<Employee>(response);
  },
  
  update: async (id: number, data: Partial<Omit<Employee, "id" | "createdAt">>): Promise<Employee> => {
    const response = await fetch(`${API_BASE}/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<Employee>(response);
  },
  
  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/employees/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  }
};

// Roster API
export const rosterApi = {
  getByMonth: async (year: number, month: number): Promise<RosterShift[]> => {
    const response = await fetch(`${API_BASE}/roster/${year}/${month}`);
    return handleResponse<RosterShift[]>(response);
  },
  
  getByDate: async (date: string): Promise<RosterShift[]> => {
    const response = await fetch(`${API_BASE}/roster/date/${date}`);
    return handleResponse<RosterShift[]>(response);
  },
  
  create: async (data: Omit<RosterShift, "id" | "createdAt">): Promise<RosterShift> => {
    const response = await fetch(`${API_BASE}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<RosterShift>(response);
  },
  
  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/roster/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  }
};

// Absence API
export const absenceApi = {
  getByDateRange: async (startDate: string, endDate: string): Promise<Absence[]> => {
    const response = await fetch(`${API_BASE}/absences?startDate=${startDate}&endDate=${endDate}`);
    return handleResponse<Absence[]>(response);
  },
  
  getByEmployee: async (employeeId: number): Promise<Absence[]> => {
    const response = await fetch(`${API_BASE}/absences?employeeId=${employeeId}`);
    return handleResponse<Absence[]>(response);
  },
  
  create: async (data: Omit<Absence, "id" | "createdAt">): Promise<Absence> => {
    const response = await fetch(`${API_BASE}/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<Absence>(response);
  },
  
  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/absences/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  }
};

// Resource API
export const resourceApi = {
  getAll: async (): Promise<Resource[]> => {
    const response = await fetch(`${API_BASE}/resources`);
    return handleResponse<Resource[]>(response);
  },
  
  update: async (id: number, data: Partial<Omit<Resource, "id" | "createdAt">>): Promise<Resource> => {
    const response = await fetch(`${API_BASE}/resources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<Resource>(response);
  }
};

// Weekly Assignment API
export const weeklyAssignmentApi = {
  getByWeek: async (year: number, week: number): Promise<WeeklyAssignment[]> => {
    const response = await fetch(`${API_BASE}/weekly-assignments/${year}/${week}`);
    return handleResponse<WeeklyAssignment[]>(response);
  },
  
  create: async (data: InsertWeeklyAssignment): Promise<WeeklyAssignment> => {
    const response = await fetch(`${API_BASE}/weekly-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<WeeklyAssignment>(response);
  },
  
  bulkSave: async (assignments: InsertWeeklyAssignment[]): Promise<WeeklyAssignment[]> => {
    const response = await fetch(`${API_BASE}/weekly-assignments/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments })
    });
    return handleResponse<WeeklyAssignment[]>(response);
  },
  
  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/weekly-assignments/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  }
};

// Project Initiative API
export const projectApi = {
  getAll: async (): Promise<ProjectInitiative[]> => {
    const response = await fetch(`${API_BASE}/projects`);
    return handleResponse<ProjectInitiative[]>(response);
  },

  getById: async (id: number): Promise<ProjectInitiative> => {
    const response = await fetch(`${API_BASE}/projects/${id}`);
    return handleResponse<ProjectInitiative>(response);
  },

  create: async (data: InsertProjectInitiative): Promise<ProjectInitiative> => {
    const response = await fetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<ProjectInitiative>(response);
  },

  update: async (id: number, data: Partial<InsertProjectInitiative>): Promise<ProjectInitiative> => {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<ProjectInitiative>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  }
};

// Project Tasks API
export const taskApi = {
  getByProject: async (projectId: number): Promise<ProjectTask[]> => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/tasks`);
    return handleResponse<ProjectTask[]>(response);
  },

  getById: async (id: number): Promise<ProjectTask> => {
    const response = await fetch(`${API_BASE}/tasks/${id}`);
    return handleResponse<ProjectTask>(response);
  },

  create: async (projectId: number, data: Omit<InsertProjectTask, 'initiativeId'>): Promise<ProjectTask> => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<ProjectTask>(response);
  },

  update: async (id: number, data: Partial<InsertProjectTask>): Promise<ProjectTask> => {
    const response = await fetch(`${API_BASE}/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<ProjectTask>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/tasks/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  },

  getActivities: async (taskId: number): Promise<TaskActivity[]> => {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/activities`);
    return handleResponse<TaskActivity[]>(response);
  },

  addActivity: async (taskId: number, data: Omit<InsertTaskActivity, 'taskId'>): Promise<TaskActivity> => {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<TaskActivity>(response);
  }
};

// Project Documents API
export const documentApi = {
  getByProject: async (projectId: number): Promise<ProjectDocument[]> => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/documents`);
    return handleResponse<ProjectDocument[]>(response);
  },

  getById: async (id: number): Promise<ProjectDocument> => {
    const response = await fetch(`${API_BASE}/documents/${id}`);
    return handleResponse<ProjectDocument>(response);
  },

  create: async (projectId: number, data: Omit<InsertProjectDocument, 'initiativeId'>): Promise<ProjectDocument> => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<ProjectDocument>(response);
  },

  update: async (id: number, data: Partial<InsertProjectDocument>): Promise<ProjectDocument> => {
    const response = await fetch(`${API_BASE}/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<ProjectDocument>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/documents/${id}`, {
      method: "DELETE"
    });
    return handleResponse<void>(response);
  },

  publish: async (id: number): Promise<ProjectDocument> => {
    const response = await fetch(`${API_BASE}/documents/${id}/publish`, {
      method: "POST"
    });
    return handleResponse<ProjectDocument>(response);
  },

  getApprovals: async (documentId: number): Promise<Approval[]> => {
    const response = await fetch(`${API_BASE}/documents/${documentId}/approvals`);
    return handleResponse<Approval[]>(response);
  },

  requestApproval: async (documentId: number, data: Omit<InsertApproval, 'documentId'>): Promise<Approval> => {
    const response = await fetch(`${API_BASE}/documents/${documentId}/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<Approval>(response);
  }
};

// Approval API
export const approvalApi = {
  update: async (id: number, data: Partial<InsertApproval>): Promise<Approval> => {
    const response = await fetch(`${API_BASE}/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handleResponse<Approval>(response);
  }
};

// Knowledge Base API (published documents)
export const knowledgeApi = {
  getPublished: async (): Promise<ProjectDocument[]> => {
    const response = await fetch(`${API_BASE}/knowledge/documents`);
    return handleResponse<ProjectDocument[]>(response);
  }
};
