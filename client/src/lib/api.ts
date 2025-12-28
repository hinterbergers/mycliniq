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

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function parseJsonSafe(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAuthToken();
  const base: Record<string, string> = {};

  if (token) base.Authorization = `Bearer ${token}`;

  // extra darf base überschreiben
  return { ...base, ...(extra as any) };
}

/**
 * apiFetch:
 * - hängt Bearer Token automatisch an
 * - entpackt { success:true, data } Responses
 * - wirft bei { success:false, error } oder HTTP !ok
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: buildHeaders(init?.headers),
  });

  // 204: No Content
  if (res.status === 204) return {} as T;

  const body = await parseJsonSafe(res);

  // Wenn Backend "success envelope" nutzt:
  if (body && typeof body === "object" && "success" in body) {
    const env = body as ApiEnvelope<any>;
    if (env.success) return env.data as T;
    throw new Error(env.error || "Request failed");
  }

  // Kein Envelope: klassisch nach HTTP Status
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  // Plain JSON
  return body as T;
}

// -------------------- Employee API --------------------
export const employeeApi = {
  getAll: async (): Promise<Employee[]> => apiFetch<Employee[]>("/employees"),

  getById: async (id: number): Promise<Employee> =>
    apiFetch<Employee>(`/employees/${id}`),

  create: async (data: Omit<Employee, "id" | "createdAt">): Promise<Employee> =>
    apiFetch<Employee>("/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (
    id: number,
    data: Partial<Omit<Employee, "id" | "createdAt">>
  ): Promise<Employee> =>
    apiFetch<Employee>(`/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/employees/${id}`, { method: "DELETE" }),
};

// -------------------- Roster API --------------------
export const rosterApi = {
  getByMonth: async (year: number, month: number): Promise<RosterShift[]> =>
    apiFetch<RosterShift[]>(`/roster/${year}/${month}`),

  getByDate: async (date: string): Promise<RosterShift[]> =>
    apiFetch<RosterShift[]>(`/roster/date/${date}`),

  getById: async (id: number): Promise<RosterShift> =>
    apiFetch<RosterShift>(`/roster/shift/${id}`),

  create: async (data: Omit<RosterShift, "id" | "createdAt">): Promise<RosterShift> =>
    apiFetch<RosterShift>("/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertRosterShift>): Promise<RosterShift> =>
    apiFetch<RosterShift>(`/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  bulkCreate: async (shifts: InsertRosterShift[]): Promise<RosterShift[]> =>
    apiFetch<RosterShift[]>("/roster/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shifts }),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/roster/${id}`, { method: "DELETE" }),

  deleteByMonth: async (year: number, month: number): Promise<void> =>
    apiFetch<void>(`/roster/month/${year}/${month}`, { method: "DELETE" }),

  generate: async (year: number, month: number) =>
    apiFetch<{
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
    }>("/roster/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month }),
    }),

  applyGenerated: async (
    year: number,
    month: number,
    shifts: any[],
    replaceExisting: boolean = true
  ) =>
    apiFetch<{
      success: boolean;
      savedShifts: number;
      message: string;
    }>("/roster/apply-generated", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, shifts, replaceExisting }),
    }),
};

// -------------------- Absence API --------------------
export const absenceApi = {
  getByDateRange: async (startDate: string, endDate: string): Promise<Absence[]> =>
    apiFetch<Absence[]>(`/absences?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),

  getByEmployee: async (employeeId: number): Promise<Absence[]> =>
    apiFetch<Absence[]>(`/absences?employeeId=${employeeId}`),

  create: async (data: Omit<Absence, "id" | "createdAt">): Promise<Absence> =>
    apiFetch<Absence>("/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/absences/${id}`, { method: "DELETE" }),
};

// -------------------- Resource API --------------------
export const resourceApi = {
  getAll: async (): Promise<Resource[]> => apiFetch<Resource[]>("/resources"),

  update: async (
    id: number,
    data: Partial<Omit<Resource, "id" | "createdAt">>
  ): Promise<Resource> =>
    apiFetch<Resource>(`/resources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};

// -------------------- Weekly Assignment API --------------------
export const weeklyAssignmentApi = {
  getByWeek: async (year: number, week: number): Promise<WeeklyAssignment[]> =>
    apiFetch<WeeklyAssignment[]>(`/weekly-assignments/${year}/${week}`),

  create: async (data: InsertWeeklyAssignment): Promise<WeeklyAssignment> =>
    apiFetch<WeeklyAssignment>("/weekly-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  bulkSave: async (assignments: InsertWeeklyAssignment[]): Promise<WeeklyAssignment[]> =>
    apiFetch<WeeklyAssignment[]>("/weekly-assignments/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/weekly-assignments/${id}`, { method: "DELETE" }),
};

// -------------------- Projects API --------------------
export const projectApi = {
  getAll: async (): Promise<ProjectInitiative[]> => apiFetch<ProjectInitiative[]>("/projects"),

  getById: async (id: number): Promise<ProjectInitiative> =>
    apiFetch<ProjectInitiative>(`/projects/${id}`),

  create: async (data: InsertProjectInitiative): Promise<ProjectInitiative> =>
    apiFetch<ProjectInitiative>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertProjectInitiative>): Promise<ProjectInitiative> =>
    apiFetch<ProjectInitiative>(`/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/projects/${id}`, { method: "DELETE" }),
};

// -------------------- Tasks API --------------------
export const taskApi = {
  getByProject: async (projectId: number): Promise<ProjectTask[]> =>
    apiFetch<ProjectTask[]>(`/projects/${projectId}/tasks`),

  getById: async (id: number): Promise<ProjectTask> =>
    apiFetch<ProjectTask>(`/tasks/${id}`),

  create: async (
    projectId: number,
    data: Omit<InsertProjectTask, "initiativeId">
  ): Promise<ProjectTask> =>
    apiFetch<ProjectTask>(`/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertProjectTask>): Promise<ProjectTask> =>
    apiFetch<ProjectTask>(`/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/tasks/${id}`, { method: "DELETE" }),

  getActivities: async (taskId: number): Promise<TaskActivity[]> =>
    apiFetch<TaskActivity[]>(`/tasks/${taskId}/activities`),

  addActivity: async (
    taskId: number,
    data: Omit<InsertTaskActivity, "taskId">
  ): Promise<TaskActivity> =>
    apiFetch<TaskActivity>(`/tasks/${taskId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};

// -------------------- Documents API --------------------
export const documentApi = {
  getByProject: async (projectId: number): Promise<ProjectDocument[]> =>
    apiFetch<ProjectDocument[]>(`/projects/${projectId}/documents`),

  getById: async (id: number): Promise<ProjectDocument> =>
    apiFetch<ProjectDocument>(`/documents/${id}`),

  create: async (
    projectId: number,
    data: Omit<InsertProjectDocument, "initiativeId">
  ): Promise<ProjectDocument> =>
    apiFetch<ProjectDocument>(`/projects/${projectId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertProjectDocument>): Promise<ProjectDocument> =>
    apiFetch<ProjectDocument>(`/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/documents/${id}`, { method: "DELETE" }),

  publish: async (id: number): Promise<ProjectDocument> =>
    apiFetch<ProjectDocument>(`/documents/${id}/publish`, { method: "POST" }),

  getApprovals: async (documentId: number): Promise<Approval[]> =>
    apiFetch<Approval[]>(`/documents/${documentId}/approvals`),

  requestApproval: async (
    documentId: number,
    data: Omit<InsertApproval, "documentId">
  ): Promise<Approval> =>
    apiFetch<Approval>(`/documents/${documentId}/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};

export const approvalApi = {
  update: async (id: number, data: Partial<InsertApproval>): Promise<Approval> =>
    apiFetch<Approval>(`/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};

// -------------------- Knowledge API --------------------
export const knowledgeApi = {
  getPublished: async (): Promise<ProjectDocument[]> =>
    apiFetch<ProjectDocument[]>("/knowledge/documents"),
};

// -------------------- Shift Swap API --------------------
export const shiftSwapApi = {
  getAll: async (): Promise<ShiftSwapRequest[]> => apiFetch<ShiftSwapRequest[]>("/shift-swaps"),

  getPending: async (): Promise<ShiftSwapRequest[]> =>
    apiFetch<ShiftSwapRequest[]>("/shift-swaps?status=Ausstehend"),

  getByEmployee: async (employeeId: number): Promise<ShiftSwapRequest[]> =>
    apiFetch<ShiftSwapRequest[]>(`/shift-swaps?employeeId=${employeeId}`),

  getById: async (id: number): Promise<ShiftSwapRequest> =>
    apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}`),

  create: async (data: InsertShiftSwapRequest): Promise<ShiftSwapRequest> =>
    apiFetch<ShiftSwapRequest>("/shift-swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertShiftSwapRequest>): Promise<ShiftSwapRequest> =>
    apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  approve: async (id: number, approverId: number, notes?: string): Promise<ShiftSwapRequest> =>
    apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, notes }),
    }),

  reject: async (id: number, approverId: number, notes?: string): Promise<ShiftSwapRequest> =>
    apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, notes }),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/shift-swaps/${id}`, { method: "DELETE" }),
};

// -------------------- Roster Settings API --------------------
export interface NextPlanningMonth {
  year: number;
  month: number;
  totalEmployees: number;
  submittedCount: number;
  allSubmitted: boolean;
}

export const rosterSettingsApi = {
  get: async (): Promise<RosterSettings> => apiFetch<RosterSettings>("/roster-settings"),

  update: async (data: InsertRosterSettings): Promise<RosterSettings> =>
    apiFetch<RosterSettings>("/roster-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getNextPlanningMonth: async (): Promise<NextPlanningMonth> =>
    apiFetch<NextPlanningMonth>("/roster-settings/next-planning-month"),
};

// -------------------- Shift Wishes API --------------------
export const shiftWishesApi = {
  getByMonth: async (year: number, month: number): Promise<ShiftWish[]> =>
    apiFetch<ShiftWish[]>(`/shift-wishes?year=${year}&month=${month}`),

  getByEmployeeAndMonth: async (employeeId: number, year: number, month: number): Promise<ShiftWish | null> =>
    apiFetch<ShiftWish | null>(`/shift-wishes?employeeId=${employeeId}&year=${year}&month=${month}`),

  create: async (data: InsertShiftWish): Promise<ShiftWish> =>
    apiFetch<ShiftWish>("/shift-wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertShiftWish>): Promise<ShiftWish> =>
    apiFetch<ShiftWish>(`/shift-wishes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  submit: async (id: number): Promise<ShiftWish> =>
    apiFetch<ShiftWish>(`/shift-wishes/${id}/submit`, { method: "POST" }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/shift-wishes/${id}`, { method: "DELETE" }),
};

// -------------------- Planned Absences API --------------------
export const plannedAbsencesApi = {
  getByMonth: async (year: number, month: number): Promise<PlannedAbsence[]> =>
    apiFetch<PlannedAbsence[]>(`/planned-absences?year=${year}&month=${month}`),

  getByEmployeeAndMonth: async (employeeId: number, year: number, month: number): Promise<PlannedAbsence[]> =>
    apiFetch<PlannedAbsence[]>(`/planned-absences?employeeId=${employeeId}&year=${year}&month=${month}`),

  create: async (data: InsertPlannedAbsence): Promise<PlannedAbsence> =>
    apiFetch<PlannedAbsence>("/planned-absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: async (id: number, data: Partial<InsertPlannedAbsence>): Promise<PlannedAbsence> =>
    apiFetch<PlannedAbsence>(`/planned-absences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: async (id: number): Promise<void> =>
    apiFetch<void>(`/planned-absences/${id}`, { method: "DELETE" }),
};