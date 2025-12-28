// client/src/lib/api.ts
import type {
  Employee,
  RosterShift,
  InsertRosterShift,
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
  InsertTaskActivity,
  ShiftSwapRequest,
  InsertShiftSwapRequest,
  RosterSettings,
  InsertRosterSettings,
  ShiftWish,
  InsertShiftWish,
  PlannedAbsence,
  InsertPlannedAbsence,
} from "@shared/schema";
import { getAuthToken } from "@/lib/auth";

const API_BASE = "/api";

/** Backend response shape used in many endpoints */
type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

function isEnvelope(x: any): x is ApiEnvelope<any> {
  return x && typeof x === "object" && typeof x.success === "boolean";
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Unified fetch:
 * - adds Authorization header from localStorage token (if present)
 * - sends/accepts JSON by default
 * - unwraps { success, data } envelopes automatically
 * - throws with backend error message if available
 */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();

  const headers = new Headers(init.headers || {});
  // default content-type for JSON requests with body
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // 204 No Content
  if (res.status === 204) return {} as T;

  const payload = await safeJson(res);

  // HTTP errors
  if (!res.ok) {
    const msg =
      (payload && (payload.error || payload.message)) ||
      `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  // unwrap envelope
  if (isEnvelope(payload)) {
    if (!payload.success) {
      throw new Error(payload.error || payload.message || "Request failed");
    }
    return (payload.data ?? ({} as any)) as T;
  }

  // plain JSON (non-envelope endpoints)
  return payload as T;
}

// ----------------------------------------------------
// Employee API
// ----------------------------------------------------
export const employeeApi = {
  getAll: async (): Promise<Employee[]> => {
    return apiFetch<Employee[]>("/employees");
  },

  getById: async (id: number): Promise<Employee> => {
    return apiFetch<Employee>(`/employees/${id}`);
  },

  create: async (data: Omit<Employee, "id" | "createdAt">): Promise<Employee> => {
    return apiFetch<Employee>("/employees", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: number,
    data: Partial<Omit<Employee, "id" | "createdAt">>
  ): Promise<Employee> => {
    // keep PATCH as you had it (server side seems to accept it)
    return apiFetch<Employee>(`/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/employees/${id}`, { method: "DELETE" });
  },
};

// ----------------------------------------------------
// Roster API
// ----------------------------------------------------
export const rosterApi = {
  getByMonth: async (year: number, month: number): Promise<RosterShift[]> => {
    return apiFetch<RosterShift[]>(`/roster/${year}/${month}`);
  },

  getByDate: async (date: string): Promise<RosterShift[]> => {
    return apiFetch<RosterShift[]>(`/roster/date/${date}`);
  },

  getById: async (id: number): Promise<RosterShift> => {
    return apiFetch<RosterShift>(`/roster/shift/${id}`);
  },

  create: async (data: Omit<RosterShift, "id" | "createdAt">): Promise<RosterShift> => {
    return apiFetch<RosterShift>("/roster", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertRosterShift>): Promise<RosterShift> => {
    return apiFetch<RosterShift>(`/roster/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  bulkCreate: async (shifts: InsertRosterShift[]): Promise<RosterShift[]> => {
    return apiFetch<RosterShift[]>("/roster/bulk", {
      method: "POST",
      body: JSON.stringify({ shifts }),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/roster/${id}`, { method: "DELETE" });
  },

  deleteByMonth: async (year: number, month: number): Promise<void> => {
    await apiFetch<void>(`/roster/month/${year}/${month}`, { method: "DELETE" });
  },

  generate: async (
    year: number,
    month: number
  ): Promise<{
    success: boolean;
    generatedShifts: number;
    reasoning: string;
    warnings: string[];
    shifts: Array<{
      date: string;
      serviceType: string;
      employeeId: number;
      employeeName: string;
    }>;
  }> => {
    // This endpoint may already return plain JSON (not wrapped) → apiFetch handles both
    return apiFetch(
      "/roster/generate",
      {
        method: "POST",
        body: JSON.stringify({ year, month }),
      }
    );
  },

  applyGenerated: async (
    year: number,
    month: number,
    shifts: any[],
    replaceExisting: boolean = true
  ): Promise<{
    success: boolean;
    savedShifts: number;
    message: string;
  }> => {
    return apiFetch(
      "/roster/apply-generated",
      {
        method: "POST",
        body: JSON.stringify({ year, month, shifts, replaceExisting }),
      }
    );
  },
};

// ----------------------------------------------------
// Absence API
// ----------------------------------------------------
export const absenceApi = {
  getByDateRange: async (startDate: string, endDate: string): Promise<Absence[]> => {
    const qs = new URLSearchParams({ startDate, endDate }).toString();
    return apiFetch<Absence[]>(`/absences?${qs}`);
  },

  getByEmployee: async (employeeId: number): Promise<Absence[]> => {
    const qs = new URLSearchParams({ employeeId: String(employeeId) }).toString();
    return apiFetch<Absence[]>(`/absences?${qs}`);
  },

  create: async (data: Omit<Absence, "id" | "createdAt">): Promise<Absence> => {
    return apiFetch<Absence>("/absences", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/absences/${id}`, { method: "DELETE" });
  },
};

// ----------------------------------------------------
// Resource API
// ----------------------------------------------------
export const resourceApi = {
  getAll: async (): Promise<Resource[]> => {
    return apiFetch<Resource[]>("/resources");
  },

  update: async (id: number, data: Partial<Omit<Resource, "id" | "createdAt">>): Promise<Resource> => {
    return apiFetch<Resource>(`/resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};

// ----------------------------------------------------
// Weekly Assignment API
// ----------------------------------------------------
export const weeklyAssignmentApi = {
  getByWeek: async (year: number, week: number): Promise<WeeklyAssignment[]> => {
    return apiFetch<WeeklyAssignment[]>(`/weekly-assignments/${year}/${week}`);
  },

  create: async (data: InsertWeeklyAssignment): Promise<WeeklyAssignment> => {
    return apiFetch<WeeklyAssignment>("/weekly-assignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  bulkSave: async (assignments: InsertWeeklyAssignment[]): Promise<WeeklyAssignment[]> => {
    return apiFetch<WeeklyAssignment[]>("/weekly-assignments/bulk", {
      method: "POST",
      body: JSON.stringify({ assignments }),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/weekly-assignments/${id}`, { method: "DELETE" });
  },
};

// ----------------------------------------------------
// Project Initiative API
// ----------------------------------------------------
export const projectApi = {
  getAll: async (): Promise<ProjectInitiative[]> => {
    return apiFetch<ProjectInitiative[]>("/projects");
  },

  getById: async (id: number): Promise<ProjectInitiative> => {
    return apiFetch<ProjectInitiative>(`/projects/${id}`);
  },

  create: async (data: InsertProjectInitiative): Promise<ProjectInitiative> => {
    return apiFetch<ProjectInitiative>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertProjectInitiative>): Promise<ProjectInitiative> => {
    return apiFetch<ProjectInitiative>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/projects/${id}`, { method: "DELETE" });
  },
};

// ----------------------------------------------------
// Project Tasks API
// ----------------------------------------------------
export const taskApi = {
  getByProject: async (projectId: number): Promise<ProjectTask[]> => {
    return apiFetch<ProjectTask[]>(`/projects/${projectId}/tasks`);
  },

  getById: async (id: number): Promise<ProjectTask> => {
    return apiFetch<ProjectTask>(`/tasks/${id}`);
  },

  create: async (
    projectId: number,
    data: Omit<InsertProjectTask, "initiativeId">
  ): Promise<ProjectTask> => {
    return apiFetch<ProjectTask>(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertProjectTask>): Promise<ProjectTask> => {
    return apiFetch<ProjectTask>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/tasks/${id}`, { method: "DELETE" });
  },

  getActivities: async (taskId: number): Promise<TaskActivity[]> => {
    return apiFetch<TaskActivity[]>(`/tasks/${taskId}/activities`);
  },

  addActivity: async (
    taskId: number,
    data: Omit<InsertTaskActivity, "taskId">
  ): Promise<TaskActivity> => {
    return apiFetch<TaskActivity>(`/tasks/${taskId}/activities`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ----------------------------------------------------
// Project Documents API
// ----------------------------------------------------
export const documentApi = {
  getByProject: async (projectId: number): Promise<ProjectDocument[]> => {
    return apiFetch<ProjectDocument[]>(`/projects/${projectId}/documents`);
  },

  getById: async (id: number): Promise<ProjectDocument> => {
    return apiFetch<ProjectDocument>(`/documents/${id}`);
  },

  create: async (
    projectId: number,
    data: Omit<InsertProjectDocument, "initiativeId">
  ): Promise<ProjectDocument> => {
    return apiFetch<ProjectDocument>(`/projects/${projectId}/documents`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertProjectDocument>): Promise<ProjectDocument> => {
    return apiFetch<ProjectDocument>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
  },

  publish: async (id: number): Promise<ProjectDocument> => {
    return apiFetch<ProjectDocument>(`/documents/${id}/publish`, { method: "POST" });
  },

  getApprovals: async (documentId: number): Promise<Approval[]> => {
    return apiFetch<Approval[]>(`/documents/${documentId}/approvals`);
  },

  requestApproval: async (
    documentId: number,
    data: Omit<InsertApproval, "documentId">
  ): Promise<Approval> => {
    return apiFetch<Approval>(`/documents/${documentId}/approvals`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ----------------------------------------------------
// Approval API
// ----------------------------------------------------
export const approvalApi = {
  update: async (id: number, data: Partial<InsertApproval>): Promise<Approval> => {
    return apiFetch<Approval>(`/approvals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};

// ----------------------------------------------------
// Knowledge Base API (published documents)
// ----------------------------------------------------
export const knowledgeApi = {
  getPublished: async (): Promise<ProjectDocument[]> => {
    return apiFetch<ProjectDocument[]>("/knowledge/documents");
  },
};

// ----------------------------------------------------
// Shift Swap Request API
// ----------------------------------------------------
export const shiftSwapApi = {
  getAll: async (): Promise<ShiftSwapRequest[]> => {
    return apiFetch<ShiftSwapRequest[]>("/shift-swaps");
  },

  getPending: async (): Promise<ShiftSwapRequest[]> => {
    const qs = new URLSearchParams({ status: "Ausstehend" }).toString();
    return apiFetch<ShiftSwapRequest[]>(`/shift-swaps?${qs}`);
  },

  getByEmployee: async (employeeId: number): Promise<ShiftSwapRequest[]> => {
    const qs = new URLSearchParams({ employeeId: String(employeeId) }).toString();
    return apiFetch<ShiftSwapRequest[]>(`/shift-swaps?${qs}`);
  },

  getById: async (id: number): Promise<ShiftSwapRequest> => {
    return apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}`);
  },

  create: async (data: InsertShiftSwapRequest): Promise<ShiftSwapRequest> => {
    return apiFetch<ShiftSwapRequest>("/shift-swaps", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertShiftSwapRequest>): Promise<ShiftSwapRequest> => {
    return apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  approve: async (id: number, approverId: number, notes?: string): Promise<ShiftSwapRequest> => {
    return apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approverId, notes }),
    });
  },

  reject: async (id: number, approverId: number, notes?: string): Promise<ShiftSwapRequest> => {
    return apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ approverId, notes }),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/shift-swaps/${id}`, { method: "DELETE" });
  },
};

// ----------------------------------------------------
// Roster Settings API
// ----------------------------------------------------
export interface NextPlanningMonth {
  year: number;
  month: number;
  totalEmployees: number;
  submittedCount: number;
  allSubmitted: boolean;
}

export const rosterSettingsApi = {
  get: async (): Promise<RosterSettings> => {
    return apiFetch<RosterSettings>("/roster-settings");
  },

  update: async (data: InsertRosterSettings): Promise<RosterSettings> => {
    return apiFetch<RosterSettings>("/roster-settings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getNextPlanningMonth: async (): Promise<NextPlanningMonth> => {
    return apiFetch<NextPlanningMonth>("/roster-settings/next-planning-month");
  },
};

// ----------------------------------------------------
// Shift Wishes API
// ----------------------------------------------------
export const shiftWishesApi = {
  getByMonth: async (year: number, month: number): Promise<ShiftWish[]> => {
    const qs = new URLSearchParams({ year: String(year), month: String(month) }).toString();
    return apiFetch<ShiftWish[]>(`/shift-wishes?${qs}`);
  },

  getByEmployeeAndMonth: async (
    employeeId: number,
    year: number,
    month: number
  ): Promise<ShiftWish | null> => {
    const qs = new URLSearchParams({
      employeeId: String(employeeId),
      year: String(year),
      month: String(month),
    }).toString();
    return apiFetch<ShiftWish | null>(`/shift-wishes?${qs}`);
  },

  create: async (data: InsertShiftWish): Promise<ShiftWish> => {
    return apiFetch<ShiftWish>("/shift-wishes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertShiftWish>): Promise<ShiftWish> => {
    return apiFetch<ShiftWish>(`/shift-wishes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  submit: async (id: number): Promise<ShiftWish> => {
    return apiFetch<ShiftWish>(`/shift-wishes/${id}/submit`, { method: "POST" });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/shift-wishes/${id}`, { method: "DELETE" });
  },
};

// ----------------------------------------------------
// Planned Absences API
// ----------------------------------------------------
export const plannedAbsencesApi = {
  getByMonth: async (year: number, month: number): Promise<PlannedAbsence[]> => {
    const qs = new URLSearchParams({ year: String(year), month: String(month) }).toString();
    return apiFetch<PlannedAbsence[]>(`/planned-absences?${qs}`);
  },

  getByEmployeeAndMonth: async (
    employeeId: number,
    year: number,
    month: number
  ): Promise<PlannedAbsence[]> => {
    const qs = new URLSearchParams({
      employeeId: String(employeeId),
      year: String(year),
      month: String(month),
    }).toString();
    return apiFetch<PlannedAbsence[]>(`/planned-absences?${qs}`);
  },

  create: async (data: InsertPlannedAbsence): Promise<PlannedAbsence> => {
    return apiFetch<PlannedAbsence>("/planned-absences", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: Partial<InsertPlannedAbsence>): Promise<PlannedAbsence> => {
    return apiFetch<PlannedAbsence>(`/planned-absences/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiFetch<void>(`/planned-absences/${id}`, { method: "DELETE" });
  },
};