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

const API_BASE = "/api";
const TOKEN_KEY = "cliniq_auth_token";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string }
  | any;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isEnvelope(obj: any): obj is { success: boolean } {
  return obj && typeof obj === "object" && typeof obj.success === "boolean";
}

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: any;

  constructor(message: string, status: number, code?: string, payload?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/**
 * Zentraler Fetch:
 * - hängt Bearer Token automatisch an (wenn vorhanden)
 * - JSON-Handling + Envelope-Unwrap
 * - 401 => code "AUTH_REQUIRED"
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  config?: { unwrap?: boolean }
): Promise<T> {
  const unwrap = config?.unwrap ?? true;

  const token = readToken();

  const headers = new Headers(options.headers || {});
  // Accept immer setzen
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  // JSON body => content-type
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Auth
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 204
  if (res.status === 204) {
    return {} as T;
  }

  const data = await safeJson(res);

  // 401 sauber markieren (damit UI redirecten kann)
  if (res.status === 401) {
    const msg =
      data?.error ||
      (isEnvelope(data) && data.success === false && data.error) ||
      "Anmeldung erforderlich";
    throw new ApiError(msg, 401, "AUTH_REQUIRED", data);
  }

  // sonstige Fehler
  if (!res.ok) {
    const msg =
      data?.error ||
      (isEnvelope(data) && data.success === false && data.error) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(msg, res.status, "REQUEST_FAILED", data);
  }

 // Envelope entpacken (unterstützt sowohl {success:true,data:...} als auch {success:true,user:...})
if (unwrap && isEnvelope(data)) {
  if (data.success === true) {
    if ("data" in data) return (data as any).data as T;
    // wenn der Endpoint kein data hat, gib einfach den Body zurück
    return data as T;
  }

  throw new ApiError(
    (data as any).error || "Request failed",
    res.status,
    "REQUEST_FAILED",
    data
  );
}

  return data as T;
}

// ---------- Employee API ----------
export const employeeApi = {
  getAll: async (): Promise<Employee[]> => {
    return apiFetch<Employee[]>("/employees", { method: "GET" });
  },

  getById: async (id: number): Promise<Employee> => {
    return apiFetch<Employee>(`/employees/${id}`, { method: "GET" });
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
    return apiFetch<Employee>(`/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    return apiFetch<void>(`/employees/${id}`, { method: "DELETE" });
  },
};

// ---------- Roster API ----------
export const rosterApi = {
  getByMonth: async (year: number, month: number): Promise<RosterShift[]> => {
    return apiFetch<RosterShift[]>(`/roster/${year}/${month}`, { method: "GET" });
  },

  getByDate: async (date: string): Promise<RosterShift[]> => {
    return apiFetch<RosterShift[]>(`/roster/date/${date}`, { method: "GET" });
  },

  getById: async (id: number): Promise<RosterShift> => {
    return apiFetch<RosterShift>(`/roster/shift/${id}`, { method: "GET" });
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
    return apiFetch<void>(`/roster/${id}`, { method: "DELETE" });
  },

  deleteByMonth: async (year: number, month: number): Promise<void> => {
    return apiFetch<void>(`/roster/month/${year}/${month}`, { method: "DELETE" });
  },

  generate: async (
    year: number,
    month: number
  ): Promise<{
    success: boolean;
    generatedShifts: number;
    reasoning: string;
    warnings: string[];
    shifts: Array<{ date: string; serviceType: string; employeeId: number; employeeName: string }>;
  }> => {
    // generate liefert oft schon ein Objekt; unwrap bleibt ok
    return apiFetch(`/roster/generate`, {
      method: "POST",
      body: JSON.stringify({ year, month }),
    });
  },

  applyGenerated: async (
    year: number,
    month: number,
    shifts: any[],
    replaceExisting: boolean = true
  ): Promise<{ success: boolean; savedShifts: number; message: string }> => {
    return apiFetch(`/roster/apply-generated`, {
      method: "POST",
      body: JSON.stringify({ year, month, shifts, replaceExisting }),
    });
  },
};

// ---------- Absence API ----------
export const absenceApi = {
  getByDateRange: async (startDate: string, endDate: string): Promise<Absence[]> => {
    const qs = new URLSearchParams({ startDate, endDate });
    return apiFetch<Absence[]>(`/absences?${qs.toString()}`, { method: "GET" });
  },

  getByEmployee: async (employeeId: number): Promise<Absence[]> => {
    const qs = new URLSearchParams({ employeeId: String(employeeId) });
    return apiFetch<Absence[]>(`/absences?${qs.toString()}`, { method: "GET" });
  },

  create: async (data: Omit<Absence, "id" | "createdAt">): Promise<Absence> => {
    return apiFetch<Absence>("/absences", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    return apiFetch<void>(`/absences/${id}`, { method: "DELETE" });
  },
};

// ---------- Resource API ----------
export const resourceApi = {
  getAll: async (): Promise<Resource[]> => {
    return apiFetch<Resource[]>("/resources", { method: "GET" });
  },

  update: async (id: number, data: Partial<Omit<Resource, "id" | "createdAt">>): Promise<Resource> => {
    return apiFetch<Resource>(`/resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};

// ---------- Weekly Assignment API ----------
export const weeklyAssignmentApi = {
  getByWeek: async (year: number, week: number): Promise<WeeklyAssignment[]> => {
    return apiFetch<WeeklyAssignment[]>(`/weekly-assignments/${year}/${week}`, { method: "GET" });
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
    return apiFetch<void>(`/weekly-assignments/${id}`, { method: "DELETE" });
  },
};

// ---------- Project Initiative API ----------
export const projectApi = {
  getAll: async (): Promise<ProjectInitiative[]> => {
    return apiFetch<ProjectInitiative[]>("/projects", { method: "GET" });
  },

  getById: async (id: number): Promise<ProjectInitiative> => {
    return apiFetch<ProjectInitiative>(`/projects/${id}`, { method: "GET" });
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
    return apiFetch<void>(`/projects/${id}`, { method: "DELETE" });
  },
};

// ---------- Project Tasks API ----------
export const taskApi = {
  getByProject: async (projectId: number): Promise<ProjectTask[]> => {
    return apiFetch<ProjectTask[]>(`/projects/${projectId}/tasks`, { method: "GET" });
  },

  getById: async (id: number): Promise<ProjectTask> => {
    return apiFetch<ProjectTask>(`/tasks/${id}`, { method: "GET" });
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
    return apiFetch<void>(`/tasks/${id}`, { method: "DELETE" });
  },

  getActivities: async (taskId: number): Promise<TaskActivity[]> => {
    return apiFetch<TaskActivity[]>(`/tasks/${taskId}/activities`, { method: "GET" });
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

// ---------- Project Documents API ----------
export const documentApi = {
  getByProject: async (projectId: number): Promise<ProjectDocument[]> => {
    return apiFetch<ProjectDocument[]>(`/projects/${projectId}/documents`, { method: "GET" });
  },

  getById: async (id: number): Promise<ProjectDocument> => {
    return apiFetch<ProjectDocument>(`/documents/${id}`, { method: "GET" });
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
    return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
  },

  publish: async (id: number): Promise<ProjectDocument> => {
    return apiFetch<ProjectDocument>(`/documents/${id}/publish`, { method: "POST" });
  },

  getApprovals: async (documentId: number): Promise<Approval[]> => {
    return apiFetch<Approval[]>(`/documents/${documentId}/approvals`, { method: "GET" });
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

// ---------- Approval API ----------
export const approvalApi = {
  update: async (id: number, data: Partial<InsertApproval>): Promise<Approval> => {
    return apiFetch<Approval>(`/approvals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};

// ---------- Knowledge Base API ----------
export const knowledgeApi = {
  getPublished: async (): Promise<ProjectDocument[]> => {
    return apiFetch<ProjectDocument[]>("/knowledge/documents", { method: "GET" });
  },
};

// ---------- Shift Swap Request API ----------
export const shiftSwapApi = {
  getAll: async (): Promise<ShiftSwapRequest[]> => {
    return apiFetch<ShiftSwapRequest[]>("/shift-swaps", { method: "GET" });
  },

  getPending: async (): Promise<ShiftSwapRequest[]> => {
    return apiFetch<ShiftSwapRequest[]>("/shift-swaps?status=Ausstehend", { method: "GET" });
  },

  getByEmployee: async (employeeId: number): Promise<ShiftSwapRequest[]> => {
    return apiFetch<ShiftSwapRequest[]>(`/shift-swaps?employeeId=${employeeId}`, { method: "GET" });
  },

  getById: async (id: number): Promise<ShiftSwapRequest> => {
    return apiFetch<ShiftSwapRequest>(`/shift-swaps/${id}`, { method: "GET" });
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
    return apiFetch<void>(`/shift-swaps/${id}`, { method: "DELETE" });
  },
};

// ---------- Roster Settings API ----------
export interface NextPlanningMonth {
  year: number;
  month: number;
  totalEmployees: number;
  submittedCount: number;
  allSubmitted: boolean;
}

export const rosterSettingsApi = {
  get: async (): Promise<RosterSettings> => {
    return apiFetch<RosterSettings>("/roster-settings", { method: "GET" });
  },

  update: async (data: InsertRosterSettings): Promise<RosterSettings> => {
    return apiFetch<RosterSettings>("/roster-settings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getNextPlanningMonth: async (): Promise<NextPlanningMonth> => {
    return apiFetch<NextPlanningMonth>("/roster-settings/next-planning-month", { method: "GET" });
  },
};

// ---------- Shift Wishes API ----------
export const shiftWishesApi = {
  getByMonth: async (year: number, month: number): Promise<ShiftWish[]> => {
    return apiFetch<ShiftWish[]>(`/shift-wishes?year=${year}&month=${month}`, { method: "GET" });
  },

  getByEmployeeAndMonth: async (
    employeeId: number,
    year: number,
    month: number
  ): Promise<ShiftWish | null> => {
    return apiFetch<ShiftWish | null>(
      `/shift-wishes?employeeId=${employeeId}&year=${year}&month=${month}`,
      { method: "GET" }
    );
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
    return apiFetch<void>(`/shift-wishes/${id}`, { method: "DELETE" });
  },
};

// ---------- Planned Absences API ----------
export const plannedAbsencesApi = {
  getByMonth: async (year: number, month: number): Promise<PlannedAbsence[]> => {
    return apiFetch<PlannedAbsence[]>(`/planned-absences?year=${year}&month=${month}`, { method: "GET" });
  },

  getByEmployeeAndMonth: async (
    employeeId: number,
    year: number,
    month: number
  ): Promise<PlannedAbsence[]> => {
    return apiFetch<PlannedAbsence[]>(
      `/planned-absences?employeeId=${employeeId}&year=${year}&month=${month}`,
      { method: "GET" }
    );
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
    return apiFetch<void>(`/planned-absences/${id}`, { method: "DELETE" });
  },
};

export type MeResponse = {
  success: true;
  user: any;
};

eexport const authApi = {
  me: async (): Promise<any> => {
    const res = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
    return res.user;
  },
};