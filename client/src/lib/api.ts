import type { Employee, RosterShift, Absence, Resource, WeeklyAssignment, InsertWeeklyAssignment } from "@shared/schema";

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
