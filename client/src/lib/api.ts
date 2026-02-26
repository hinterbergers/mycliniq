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
  LongTermShiftWish,
  InsertLongTermShiftWish,
  LongTermAbsence,
  InsertLongTermAbsence,
  DutyPlan,
  InsertDutyPlan,
  PlannedAbsence,
  InsertPlannedAbsence,
  VacationRule,
  InsertVacationRule,
  Competency,
  Diploma,
  PhysicalRoom,
  ServiceLine,
  InsertServiceLine,
  Clinic,
  Sop,
  InsertSop,
  SopVersion,
  SopReference,
  ProjectMember,
  Notification,
  MessageThread,
  MessageThreadMember,
  Message,
  TrainingVideo,
  TrainingPresentation,
} from "@shared/schema";
import { readAuthToken } from "./authToken";
import {
  type DashboardWidgetKey,
} from "@/lib/dashboard-widgets";

const API_BASE = "/api";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type OpenShiftSlot = {
  id: number | null;
  syntheticId?: string;
  date: string;
  serviceType: string;
  slotIndex?: number;
  isSynthetic: boolean;
  source: "final" | "draft";
  label?: string | null;
};

export type OpenShiftResponse = {
  slots: OpenShiftSlot[];
  planStatus: DutyPlan["status"] | null;
  statusAllowed: boolean;
  requiredDaily: Record<string, number>;
  countsByDay: Record<string, Record<string, number>>;
  missingCounts: Record<string, number>;
};

export type DashboardTeammate = {
  firstName: string | null;
  lastName: string | null;
};

export type DashboardZeInfo = {
  id: number;
  possible: true;
  accepted: boolean;
};

export type DashboardDutyInfo = {
  serviceType: string | null;
  labelShort: string | null;
  othersOnDuty: DashboardTeammate[];
};

export type DashboardDay = {
  date: string;
  statusLabel: string | null;
  workplace: string | null;
  teammates: DashboardTeammate[];
  absenceReason: string | null;
  ze?: DashboardZeInfo | null;
  duty?: DashboardDutyInfo | null;
};

export type DashboardResponse = {
  today: DashboardDay;
  birthday: null | { firstName: string | null; lastName: string | null };
  weekPreview: DashboardDay[];
  attendanceWidget: DashboardAttendanceWidget | null;
  recentChanges?: DashboardRecentChange[];
  enabledWidgets?: DashboardWidgetKey[];
};

export type DashboardAttendanceMember = {
  employeeId: number;
  firstName: string | null;
  lastName: string | null;
  workplace: string | null;
  workplaceRoomId?: number | null;
  workplaceSortOrder?: number | null;
  workplaceColor?: string | null;
  role: string | null;
  isDuty: boolean;
};

export type DashboardAttendanceDay = {
  members: DashboardAttendanceMember[];
  absentCount: number;
};

export type DashboardAttendanceWidget = {
  today: DashboardAttendanceDay;
  tomorrow: DashboardAttendanceDay;
};

export type DashboardAbsenceItem = {
  type: string;
  names: string[];
};

export type DashboardAbsenceDay = {
  date: string;
  types: DashboardAbsenceItem[];
};

export type DashboardAbsencesResponse = {
  from: string;
  to: string;
  days: DashboardAbsenceDay[];
};

export type DashboardRecentChange = {
  id: string;
  source:
    | "dutyplan_shift"
    | "dutyplan_absence"
    | "weeklyplan_override"
    | "weeklyplan_assignment";
  changedAt: string;
  action: "created" | "updated";
  title: string;
  subtitle: string | null;
  actorName?: string | null;
  targetUrl?: string | null;
};

export type GlobalSearchDocumentHit = {
  id: number;
  type: "sop" | "video" | "presentation";
  title: string;
  subtitle: string;
  keywords: string[];
  url: string;
  createdById: number | null;
  createdByLabel: string | null;
  createdByCurrentUser: boolean;
  createdAt?: string | null;
};

export type GlobalSearchPersonHit = {
  id: number;
  type: "person";
  displayName: string;
  role: string | null;
  url: string;
  contacts: {
    email: string | null;
    phoneWork: string | null;
    emailPrivate: string | null;
    phonePrivate: string | null;
    showPrivateContact: boolean;
  };
  preview?: {
    status: "pending" | string;
    message?: string | null;
  } | null;
};

export type GlobalSearchPersonPreview = {
  days: string[];
  duties: Array<{
    id: number;
    date: string;
    serviceType: string;
  }>;
  workplaces: Array<{
    date: string;
    workplace: string;
    roomName?: string | null;
  }>;
  absences: Array<{
    id: number;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
  }>;
  visibility: {
    absences: boolean;
  };
};

export type PersonCardProfile = {
  person: {
    id: number;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    role: string | null;
    contacts: GlobalSearchPersonHit["contacts"];
  } | null;
};

export type GlobalSearchResponse = {
  query: string;
  groups: {
    sops: GlobalSearchDocumentHit[];
    videos: GlobalSearchDocumentHit[];
    presentations: GlobalSearchDocumentHit[];
    people: GlobalSearchPersonHit[];
  };
  counts: {
    sops: number;
    videos: number;
    presentations: number;
    people: number;
  };
};

export type PlanningStateResponse = {
  submittedCount: number;
  missingCount: number;
  lastRunAt: string | null;
  isDirty: boolean;
  fixedPreferredEmployees: number[];
};

export type PlanningLock = {
  id: number;
  year: number;
  month: number;
  slotId: string;
  employeeId: number | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanningInputSummary = {
  version: "v1";
  meta: {
    timezone: string;
    createdAt: string;
    planningKind: "MONTHLY_DUTY" | "WEEKLY_PLAN" | string;
    source?: string;
  };
  period: {
    startDate: string;
    endDate: string;
    year: number;
    month: number;
  };
  slots: number;
  employees: number;
  roles: number;
  hardRules: number;
  softRules: number;
};

export type PlanningInputV1 = {
  version: "v1";
  meta: {
    timezone: string;
    createdAt: string;
    planningKind: "MONTHLY_DUTY" | "WEEKLY_PLAN" | string;
    source?: string;
  };
  period: {
    startDate: string;
    endDate: string;
    year: number;
    month: number;
  };
  roles: Array<{
    id: string;
    label: string;
    tags?: string[];
  }>;
  slots: Array<{
    id: string;
    date: string;
    roleId: string;
    required: number;
    startTime?: string;
    endTime?: string;
    isoWeek?: number;
    isWeekend?: boolean;
    tags?: string[];
  }>;
  employees: Array<{
    id: string;
    name: string;
    group: string;
    capabilities: {
      canRoleIds: string[];
      skillTags?: string[];
    };
    constraints: {
      limits?: {
        maxSlotsInPeriod?: number;
        minSlotsInPeriod?: number;
        maxSlotsPerIsoWeek?: number;
        maxWeekendSlotsInPeriod?: number;
      };
      hard?: {
        banDates?: string[];
        banWeekdays?: number[];
      };
      soft?: {
        preferDates?: string[];
        avoidDates?: string[];
        preferServiceTypes?: string[];
        avoidServiceTypes?: string[];
      };
    };
  }>;
  rules: {
    hardRules: Array<{ id?: string; type: string; hard: boolean; params?: Record<string, unknown> }>;
    softRules?: Array<{ id?: string; type: string; hard: boolean; params?: Record<string, unknown> }>;
    weights?: {
      prefer?: number;
      avoid?: number;
      weekendFairness?: number;
      avoidWeekendStreak?: number;
      continuity?: number;
    };
  };
};

export type PlanningInputSummaryResponse = {
  slots: number;
  employees: number;
  roles: number;
  hardRules: number;
  softRules: number;
};

export type PlanningOutputAssignment = {
  slotId: string;
  employeeId: string;
  locked?: boolean;
};

export type PlanningOutputViolation = {
  code: string;
  hard: boolean;
  message: string;
  slotId?: string;
  employeeId?: string;
};

export type PlanningUnfilledSlot = {
  slotId: string;
  date: string;
  serviceType: string;
  reasonCodes: string[];
  candidatesBlockedBy: string[];
  blocksPublish: boolean;
};

export type PlanningOutputV1 = {
  version: "v1";
  meta: {
    createdAt: string;
    planningKind: "MONTHLY_DUTY" | "WEEKLY_PLAN" | string;
    engine: string;
    seed: number;
  };
  assignments: PlanningOutputAssignment[];
  violations: PlanningOutputViolation[];
  unfilledSlots: PlanningUnfilledSlot[];
  publishAllowed: boolean;
  summary: {
    score: number;
    coverage: {
      filled: number;
      required: number;
    };
  };
};

export type MeResponse = {
  user?: {
    id: number;
    employeeId: number;
    name: string;
    lastName: string;
    email?: string;
  };
  clinic?: Pick<Clinic, "country" | "state"> | null;
  department?: unknown;
  capabilities?: string[];
};

function buildHeaders(
  headersInit: HeadersInit | undefined,
  hasBody: boolean,
): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = readAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = buildHeaders(init.headers, Boolean(init.body));
  return fetch(input, { ...init, headers });
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return {} as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error || body?.message || "Request failed";
    const error = new Error(message);
    (error as any).status = response.status;
    throw error;
  }

  if (body && typeof body === "object" && "success" in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.success) {
      const message = envelope.error || envelope.message || "Request failed";
      const error = new Error(message);
      (error as any).status = response.status;
      throw error;
    }
    if (typeof envelope.data !== "undefined") {
      return envelope.data;
    }
  }

  return body as T;
}

function unwrap<T>(resp: unknown): T {
  if (
    resp &&
    typeof resp === "object" &&
    "success" in resp &&
    "data" in resp
  ) {
    const envelope = resp as ApiEnvelope<T>;
    return envelope.data as T;
  }
  return resp as T;
}

function unwrapArray<T>(resp: unknown): T[] {
  const data = unwrap<unknown>(resp);
  return Array.isArray(data) ? (data as T[]) : [];
}

export const meApi = {
  get: async (): Promise<MeResponse> => {
    const response = await apiFetch(`${API_BASE}/me`);
    return handleResponse<MeResponse>(response);
  },
};

export const calendarApi = {
  getToken: async (options?: { regenerate?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.regenerate) {
      params.set("regenerate", "1");
    }
    const query = params.toString();
    const response = await apiFetch(
      `${API_BASE}/calendar-token${query ? `?${query}` : ""}`,
    );
    return handleResponse<{ token: string }>(response);
  },
};

export const dashboardApi = {
  get: async (): Promise<DashboardResponse> => {
    const response = await apiFetch(`${API_BASE}/dashboard?days=7`);
    if (!response.ok) {
      throw new Error(`Fehler beim Laden (Status ${response.status})`);
    }
    return handleResponse<DashboardResponse>(response);
  },
  getAbsences: async (): Promise<DashboardAbsencesResponse> => {
    const response = await apiFetch(`${API_BASE}/dashboard/absences`);
    return handleResponse<DashboardAbsencesResponse>(response);
  },
  acceptZeitausgleich: async (
    id: number,
  ): Promise<{
    id: number;
    accepted: boolean;
    acceptedAt?: string | null;
    acceptedById?: number | null;
  }> => {
    const response = await apiFetch(`${API_BASE}/zeitausgleich/${id}/accept`, {
      method: "POST",
    });
    return handleResponse(response);
  },
};

// Employee API
export const employeeApi = {
  getAll: async (): Promise<Employee[]> => {
    const response = await apiFetch(`${API_BASE}/employees`);
    return handleResponse<Employee[]>(response);
  },

  getById: async (id: number): Promise<Employee> => {
    const response = await apiFetch(`${API_BASE}/employees/${id}`);
    return handleResponse<Employee>(response);
  },

  create: async (
    data: Omit<Employee, "id" | "createdAt">,
  ): Promise<Employee> => {
    const response = await apiFetch(`${API_BASE}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<Employee>(response);
  },

  update: async (
    id: number,
    data: Partial<Omit<Employee, "id" | "createdAt">>,
  ): Promise<Employee> => {
    const response = await apiFetch(`${API_BASE}/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<Employee>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/employees/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },

  getCompetencies: async (
    id: number,
  ): Promise<
    Array<{ competencyId: number; code?: string | null; name?: string | null }>
  > => {
    const response = await apiFetch(`${API_BASE}/employees/${id}/competencies`);
    return handleResponse<
      Array<{
        competencyId: number;
        code?: string | null;
        name?: string | null;
      }>
    >(response);
  },

  updateCompetencies: async (
    id: number,
    competencyIds: number[],
  ): Promise<{
    id: number;
    competencies: Array<{
      competencyId: number;
      code?: string | null;
      name?: string | null;
    }>;
    count: number;
  }> => {
    const response = await apiFetch(
      `${API_BASE}/employees/${id}/competencies`,
      {
        method: "PUT",
        body: JSON.stringify({ competencyIds }),
      },
    );
    return handleResponse(response);
  },

  getDiplomas: async (
    id: number,
  ): Promise<
    Array<{
      diplomaId: number;
      name?: string | null;
      description?: string | null;
      isActive?: boolean;
    }>
  > => {
    const response = await apiFetch(`${API_BASE}/employees/${id}/diplomas`);
    return handleResponse(response);
  },

  updateDiplomas: async (
    id: number,
    diplomaIds: number[],
  ): Promise<{
    id: number;
    diplomas: Array<{
      diplomaId: number;
      name?: string | null;
      description?: string | null;
      isActive?: boolean;
    }>;
    count: number;
  }> => {
    const response = await apiFetch(`${API_BASE}/employees/${id}/diplomas`, {
      method: "PUT",
      body: JSON.stringify({ diplomaIds }),
    });
    return handleResponse(response);
  },
};

// Roster API
type AiRuleWeightsPayload = {
  weekendFairness: number;
  preferenceSatisfaction: number;
  minimizeConflicts: number;
};

type AiRulesPayload = {
  version?: number;
  hard: string;
  soft: string;
  weights: AiRuleWeightsPayload;
};

export const rosterApi = {
  getByMonth: async (
    year: number,
    month: number,
    opts?: { draft?: boolean; includeDraft?: boolean },
  ): Promise<RosterShift[]> => {
    const params = new URLSearchParams();
    if (typeof opts?.draft === "boolean") {
      params.set("draft", opts.draft ? "1" : "0");
    }
    if (opts?.includeDraft) {
      params.set("includeDraft", "1");
    }
    const query = params.toString();
    const response = await apiFetch(
      `${API_BASE}/roster/${year}/${month}${query ? `?${query}` : ""}`,
    );
    return handleResponse<RosterShift[]>(response);
  },

  getByDate: async (date: string): Promise<RosterShift[]> => {
    const response = await apiFetch(`${API_BASE}/roster/date/${date}`);
    return handleResponse<RosterShift[]>(response);
  },

  getById: async (id: number): Promise<RosterShift> => {
    const response = await apiFetch(`${API_BASE}/roster/shift/${id}`);
    return handleResponse<RosterShift>(response);
  },

  create: async (
    data: InsertRosterShift,
    opts?: { draft?: boolean },
  ): Promise<RosterShift> => {
    const query = opts?.draft ? "?draft=1" : "";
    const response = await apiFetch(`${API_BASE}/roster${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<RosterShift>(response);
  },

  getOpenShifts: async (
    year: number,
    month: number,
    opts?: { includeDraft?: boolean },
  ): Promise<OpenShiftResponse> => {
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
    });
    if (opts?.includeDraft) {
      params.set("includeDraft", "1");
    }
    const response = await apiFetch(
      `${API_BASE}/roster/open-shifts?${params.toString()}`,
    );
    return handleResponse<OpenShiftResponse>(response);
  },

  claimOpenShift: async (payload: {
    slotId?: number;
    date?: string;
    serviceType?: string;
    slotIndex?: number;
  }): Promise<RosterShift> => {
    const response = await apiFetch(`${API_BASE}/roster/open-shifts/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse<RosterShift>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertRosterShift>,
    opts?: { draft?: boolean },
  ): Promise<RosterShift> => {
    const query = opts?.draft ? "?draft=1" : "";
    const response = await apiFetch(`${API_BASE}/roster/${id}${query}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<RosterShift>(response);
  },

  bulkCreate: async (shifts: InsertRosterShift[]): Promise<RosterShift[]> => {
    const response = await apiFetch(`${API_BASE}/roster/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shifts }),
    });
    return handleResponse<RosterShift[]>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/roster/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },

  deleteByMonth: async (year: number, month: number): Promise<void> => {
    const response = await apiFetch(
      `${API_BASE}/roster/month/${year}/${month}`,
      {
        method: "DELETE",
      },
    );
    return handleResponse<void>(response);
  },

  generate: async (
    year: number,
    month: number,
    options?: { rules?: AiRulesPayload },
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
    mode?: "draft" | "final";
  }> => {
    const response = await apiFetch(`${API_BASE}/roster/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, ...(options ?? {}) }),
    });
    return handleResponse(response);
  },

  applyGenerated: async (
    year: number,
    month: number,
    shifts: any[],
    replaceExisting: boolean = true,
    isDraft: boolean = true,
  ): Promise<{
    success: boolean;
    savedShifts: number;
    message: string;
  }> => {
    const response = await apiFetch(`${API_BASE}/roster/apply-generated`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, shifts, replaceExisting, isDraft }),
    });
    return handleResponse(response);
  },
};

// Service Lines API (Dienstschienen)
type ServiceLineInput = Omit<InsertServiceLine, "clinicId">;

export type ServiceLineQuery = {
  clinicId?: number;
  departmentId?: number;
};

export const getServiceLineContextFromEmployee = (
  employee?: Pick<Employee, "departmentId"> | null,
): ServiceLineQuery | undefined => {
  if (!employee) return undefined;
  if (typeof employee.departmentId === "number") {
    return { departmentId: employee.departmentId };
  }
  return undefined;
};

const buildServiceLineUrl = (context?: ServiceLineQuery) => {
  const params = new URLSearchParams();
  if (typeof context?.clinicId === "number") {
    params.set("clinicId", String(context.clinicId));
  }
  if (typeof context?.departmentId === "number") {
    params.set("departmentId", String(context.departmentId));
  }

  const baseUrl = `${API_BASE}/service-lines`;
  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
};

export const serviceLinesApi = {
  getAll: async (context?: ServiceLineQuery): Promise<ServiceLine[]> => {
    const response = await apiFetch(buildServiceLineUrl(context));
    return handleResponse<ServiceLine[]>(response);
  },

  create: async (data: ServiceLineInput): Promise<ServiceLine> => {
    const response = await apiFetch(`${API_BASE}/service-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<ServiceLine>(response);
  },

  update: async (
    id: number,
    data: Partial<ServiceLineInput>,
  ): Promise<ServiceLine> => {
    const response = await apiFetch(`${API_BASE}/service-lines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return handleResponse<ServiceLine>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/service-lines/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

const buildTrainingUrl = (endpoint: string, includeInactive?: boolean) => {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.set("includeInactive", "1");
  }
  const query = params.toString();
  return `${API_BASE}/training${endpoint}${query ? `?${query}` : ""}`;
};

export const trainingApi = {
  getVideos: async (includeInactive = false): Promise<TrainingVideo[]> => {
    const response = await apiFetch(buildTrainingUrl("/videos", includeInactive));
    return handleResponse<TrainingVideo[]>(response);
  },

  createEmbedVideo: async (payload: {
    title: string;
    platform: "youtube" | "vimeo";
    videoUrlOrId: string;
    keywords?: string[];
  }): Promise<TrainingVideo> => {
    const response = await apiFetch(`${API_BASE}/training/videos/embed`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return handleResponse<TrainingVideo>(response);
  },

  deleteVideo: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/training/videos/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },

  updateVideo: async (
    id: number,
    payload: Partial<{
      title: string;
      keywords: string[];
      platform: string;
      videoId: string | null;
      url: string;
      embedUrl: string;
      isActive: boolean;
    }>,
  ): Promise<TrainingVideo> => {
    const response = await apiFetch(`${API_BASE}/training/videos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return handleResponse<TrainingVideo>(response);
  },

  getPresentations: async (
    includeInactive = false,
  ): Promise<TrainingPresentation[]> => {
    const response = await apiFetch(
      buildTrainingUrl("/presentations", includeInactive),
    );
    return handleResponse<TrainingPresentation[]>(response);
  },

  uploadPresentation: async (
    formData: FormData,
  ): Promise<TrainingPresentation> => {
    const headers: Record<string, string> = {};
    const token = readAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(
      `${API_BASE}/training/presentations/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );
    return handleResponse<TrainingPresentation>(response);
  },

  updatePresentation: async (
    id: number,
    payload: Partial<{
      title: string;
      keywords: string[];
      isActive: boolean;
    }>,
  ): Promise<TrainingPresentation> => {
    const response = await apiFetch(`${API_BASE}/training/presentations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return handleResponse<TrainingPresentation>(response);
  },

  deletePresentation: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/training/presentations/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

export const searchApi = {
  global: async (
    q: string,
    options?: { limit?: number },
  ): Promise<GlobalSearchResponse> => {
    const params = new URLSearchParams();
    params.set("q", q);
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    const response = await apiFetch(`${API_BASE}/search/global?${params.toString()}`);
    return handleResponse<GlobalSearchResponse>(response);
  },
  personPreview: async (
    employeeId: number,
    options?: { days?: number },
  ): Promise<GlobalSearchPersonPreview> => {
    const params = new URLSearchParams();
    if (typeof options?.days === "number") {
      params.set("days", String(options.days));
    }
    const query = params.toString();
    const response = await apiFetch(
      `${API_BASE}/search/people/${employeeId}/preview${query ? `?${query}` : ""}`,
    );
    return handleResponse<GlobalSearchPersonPreview>(response);
  },
  personProfile: async (employeeId: number): Promise<PersonCardProfile> => {
    const response = await apiFetch(`${API_BASE}/search/people/${employeeId}/profile`);
    return handleResponse<PersonCardProfile>(response);
  },
};

// Duty Plans API
export const dutyPlansApi = {
  getByMonth: async (year: number, month: number): Promise<DutyPlan | null> => {
    const response = await apiFetch(
      `${API_BASE}/duty-plans?year=${year}&month=${month}`,
    );
    const plans = await handleResponse<DutyPlan[]>(response);
    return plans[0] ?? null;
  },

  getById: async (
    id: number,
  ): Promise<DutyPlan & { days?: any[] }> => {
    const response = await apiFetch(`${API_BASE}/duty-plans/${id}`);
    return handleResponse<DutyPlan & { days?: any[] }>(response);
  },

  getAll: async (): Promise<DutyPlan[]> => {
    const response = await apiFetch(`${API_BASE}/duty-plans`);
    return handleResponse<DutyPlan[]>(response);
  },

  create: async (
    data: Pick<InsertDutyPlan, "year" | "month"> & {
      generatedById?: number | null;
    },
  ): Promise<DutyPlan> => {
    const response = await apiFetch(`${API_BASE}/duty-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<DutyPlan>(response);
  },

  updateStatus: async (
    id: number,
    status: DutyPlan["status"],
    releasedById?: number | null,
  ): Promise<DutyPlan> => {
    const payload: { status: DutyPlan["status"]; releasedById?: number } = {
      status,
    };
    if (typeof releasedById === "number") {
      payload.releasedById = releasedById;
    }
    const response = await apiFetch(`${API_BASE}/duty-plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse<DutyPlan>(response);
  },
  publishToRoster: async (
    id: number,
    options?: { force?: boolean },
  ): Promise<{ success: true; publishedCount: number; year: number; month: number }> => {
    const params = new URLSearchParams();
    if (options?.force) {
      params.set("force", "true");
    }
    const query = params.toString();
    const response = await apiFetch(
      `${API_BASE}/duty-plans/${id}/publish-to-roster${query ? `?${query}` : ""}`,
      {
        method: "POST",
      },
    );
    return handleResponse<{
      success: true;
      publishedCount: number;
      year: number;
      month: number;
    }>(response);
  },
};

// Absence API
export const absenceApi = {
  getByDateRange: async (
    startDate: string,
    endDate: string,
  ): Promise<Absence[]> => {
    const response = await apiFetch(
      `${API_BASE}/absences?startDate=${startDate}&endDate=${endDate}`,
    );
    return handleResponse<Absence[]>(response);
  },

  getByEmployee: async (employeeId: number): Promise<Absence[]> => {
    const response = await apiFetch(
      `${API_BASE}/absences?employeeId=${employeeId}`,
    );
    return handleResponse<Absence[]>(response);
  },

  create: async (data: Omit<Absence, "id" | "createdAt">): Promise<Absence> => {
    const response = await apiFetch(`${API_BASE}/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<Absence>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/absences/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

// Resource API
export const resourceApi = {
  getAll: async (): Promise<Resource[]> => {
    const response = await apiFetch(`${API_BASE}/resources`);
    return handleResponse<Resource[]>(response);
  },

  update: async (
    id: number,
    data: Partial<Omit<Resource, "id" | "createdAt">>,
  ): Promise<Resource> => {
    const response = await apiFetch(`${API_BASE}/resources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<Resource>(response);
  },
};

export const roomApi = {
  getAll: async (options?: { active?: boolean }): Promise<Resource[]> => {
    const params = new URLSearchParams();
    if (options?.active !== undefined) {
      params.set("active", options.active ? "true" : "false");
    }
    const query = params.toString();
    const response = await apiFetch(
      `${API_BASE}/rooms${query ? `?${query}` : ""}`,
    );
    return handleResponse<Resource[]>(response);
  },
  getWeeklyPlan: async (): Promise<
    Array<
      Resource & {
        weekdaySettings?: Array<{
          id: number;
          roomId: number;
          weekday: number;
          recurrence?: "weekly" | "monthly_first_third" | "monthly_once";
          usageLabel?: string | null;
          timeFrom?: string | null;
          timeTo?: string | null;
          isClosed?: boolean;
          closedReason?: string | null;
        }>;
        requiredCompetencies?: Array<{
          id: number;
          competencyId: number;
          relationType: "AND" | "OR";
          competencyCode?: string | null;
          competencyName?: string | null;
        }>;
        physicalRooms?: Array<{
          id: number;
          name: string;
          isActive?: boolean;
        }>;
      }
    >
  > => {
    const response = await apiFetch(`${API_BASE}/rooms/weekly-plan`);
    return handleResponse(response);
  },
  create: async (
    data: Omit<Resource, "id" | "createdAt"> & {
      requiredRoleCompetencies?: string[];
      alternativeRoleCompetencies?: string[];
    },
  ): Promise<Resource> => {
    const response = await apiFetch(`${API_BASE}/rooms`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<Resource>(response);
  },
  getById: async (
    id: number,
  ): Promise<
    Resource & {
      weekdaySettings?: Array<{
        id: number;
        roomId: number;
        weekday: number;
        recurrence?: "weekly" | "monthly_first_third" | "monthly_once";
        usageLabel?: string | null;
        timeFrom?: string | null;
        timeTo?: string | null;
        isClosed?: boolean;
        closedReason?: string | null;
      }>;
      requiredCompetencies?: Array<{
        id: number;
        competencyId: number;
        relationType: "AND" | "OR";
        competencyCode?: string | null;
        competencyName?: string | null;
      }>;
      physicalRooms?: Array<{
        id: number;
        name: string;
        isActive?: boolean;
      }>;
    }
  > => {
    const response = await apiFetch(`${API_BASE}/rooms/${id}`);
    return handleResponse(response);
  },
  update: async (
    id: number,
    data: Partial<Omit<Resource, "id" | "createdAt">> & {
      requiredRoleCompetencies?: string[];
      alternativeRoleCompetencies?: string[];
    },
  ): Promise<Resource> => {
    const response = await apiFetch(`${API_BASE}/rooms/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return handleResponse<Resource>(response);
  },
  delete: async (
    id: number,
  ): Promise<{ deactivated: boolean; id: number; message?: string }> => {
    const response = await apiFetch(`${API_BASE}/rooms/${id}`, {
      method: "DELETE",
    });
    return handleResponse(response);
  },
  updateWeekdaySettings: async (
    id: number,
    settings: Array<{
      weekday: number;
      recurrence?: "weekly" | "monthly_first_third" | "monthly_once";
      usageLabel?: string | null;
      timeFrom?: string | null;
      timeTo?: string | null;
      isClosed?: boolean;
      closedReason?: string | null;
    }>,
  ): Promise<{
    roomId: number;
    weekdaySettings: Array<{
      id: number;
      roomId: number;
      weekday: number;
      recurrence?: "weekly" | "monthly_first_third" | "monthly_once";
      usageLabel?: string | null;
      timeFrom?: string | null;
      timeTo?: string | null;
      isClosed?: boolean;
      closedReason?: string | null;
    }>;
    count: number;
  }> => {
    const response = await apiFetch(
      `${API_BASE}/rooms/${id}/weekday-settings`,
      {
        method: "PUT",
        body: JSON.stringify({ settings }),
      },
    );
    return handleResponse(response);
  },
  updateCompetencies: async (
    id: number,
    competencies: Array<{ competencyId: number; relationType: "AND" | "OR" }>,
  ): Promise<{
    roomId: number;
    requiredCompetencies: Array<{
      id: number;
      competencyId: number;
      relationType: "AND" | "OR";
      competencyCode?: string | null;
      competencyName?: string | null;
    }>;
    count: number;
  }> => {
    const response = await apiFetch(`${API_BASE}/rooms/${id}/competencies`, {
      method: "PUT",
      body: JSON.stringify({ competencies }),
    });
    return handleResponse(response);
  },
  updatePhysicalRooms: async (
    id: number,
    physicalRoomIds: number[],
  ): Promise<{
    roomId: number;
    physicalRooms: Array<{
      id: number;
      name: string;
      isActive?: boolean;
    }>;
    count: number;
  }> => {
    const response = await apiFetch(`${API_BASE}/rooms/${id}/physical-rooms`, {
      method: "PUT",
      body: JSON.stringify({ physicalRoomIds }),
    });
    return handleResponse(response);
  },
};

export const physicalRoomApi = {
  getAll: async (): Promise<PhysicalRoom[]> => {
    const response = await apiFetch(`${API_BASE}/physical-rooms`);
    return handleResponse<PhysicalRoom[]>(response);
  },
  create: async (
    data: Omit<PhysicalRoom, "id" | "createdAt" | "updatedAt">,
  ): Promise<PhysicalRoom> => {
    const response = await apiFetch(`${API_BASE}/physical-rooms`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<PhysicalRoom>(response);
  },
  update: async (
    id: number,
    data: Partial<Omit<PhysicalRoom, "id" | "createdAt" | "updatedAt">>,
  ): Promise<PhysicalRoom> => {
    const response = await apiFetch(`${API_BASE}/physical-rooms/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return handleResponse<PhysicalRoom>(response);
  },
  delete: async (id: number): Promise<{ id: number; deactivated: boolean }> => {
    const response = await apiFetch(`${API_BASE}/physical-rooms/${id}`, {
      method: "DELETE",
    });
    return handleResponse(response);
  },
};

export const competencyApi = {
  getAll: async (): Promise<Competency[]> => {
    const response = await apiFetch(`${API_BASE}/competencies`);
    return handleResponse<Competency[]>(response);
  },
  create: async (
    data: Omit<Competency, "id" | "createdAt" | "updatedAt">,
  ): Promise<Competency> => {
    const response = await apiFetch(`${API_BASE}/competencies`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<Competency>(response);
  },
  update: async (
    id: number,
    data: Partial<Omit<Competency, "id" | "createdAt" | "updatedAt">>,
  ): Promise<Competency> => {
    const response = await apiFetch(`${API_BASE}/competencies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return handleResponse<Competency>(response);
  },
  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/competencies/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
  getDiplomas: async (
    id: number,
  ): Promise<
    Array<{
      diplomaId: number;
      name?: string | null;
      description?: string | null;
      isActive?: boolean;
    }>
  > => {
    const response = await apiFetch(`${API_BASE}/competencies/${id}/diplomas`);
    return handleResponse(response);
  },
  updateDiplomas: async (
    id: number,
    diplomaIds: number[],
  ): Promise<{
    id: number;
    diplomas: Array<{
      diplomaId: number;
      name?: string | null;
      description?: string | null;
      isActive?: boolean;
    }>;
    count: number;
  }> => {
    const response = await apiFetch(`${API_BASE}/competencies/${id}/diplomas`, {
      method: "PUT",
      body: JSON.stringify({ diplomaIds }),
    });
    return handleResponse(response);
  },
};

export const diplomaApi = {
  getAll: async (): Promise<Diploma[]> => {
    const response = await apiFetch(`${API_BASE}/diplomas`);
    return handleResponse<Diploma[]>(response);
  },
  create: async (
    data: Omit<Diploma, "id" | "createdAt" | "updatedAt">,
  ): Promise<Diploma> => {
    const response = await apiFetch(`${API_BASE}/diplomas`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<Diploma>(response);
  },
  update: async (
    id: number,
    data: Partial<Omit<Diploma, "id" | "createdAt" | "updatedAt">>,
  ): Promise<Diploma> => {
    const response = await apiFetch(`${API_BASE}/diplomas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return handleResponse<Diploma>(response);
  },
  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/diplomas/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

export type WeeklyPlanAssignmentResponse = {
  id: number;
  weeklyPlanId: number;
  roomId: number;
  weekday: number;
  employeeId: number | null;
  roleLabel?: string | null;
  assignmentType: "Plan" | "Zeitausgleich" | "Fortbildung";
  note?: string | null;
  isBlocked?: boolean;
  createdAt?: string;
  updatedAt?: string;
  roomName?: string | null;
  roomCategory?: string | null;
  employeeName?: string | null;
  employeeLastName?: string | null;
  employeeRole?: string | null;
};

export type WeeklyPlanResponse = {
  id: number;
  year: number;
  weekNumber: number;
  status: "Entwurf" | "Vorläufig" | "Freigegeben";
  lockedWeekdays?: number[];
  assignments: WeeklyPlanAssignmentResponse[];
  assignmentsByWeekday?: Record<number, WeeklyPlanAssignmentResponse[]>;
  summary?: Record<string, number>;
};

export type WeeklyPlanAssignmentInput = {
  roomId: number;
  weekday: number;
  employeeId?: number | null;
  roleLabel?: string | null;
  assignmentType?: "Plan" | "Zeitausgleich" | "Fortbildung";
  note?: string | null;
  isBlocked?: boolean;
};

export type WeeklyPlanningGeneratedAssignment = {
  slotId: string;
  date: string;
  weekday: number;
  roomId: number;
  roomName: string;
  employeeId: number;
  employeeName: string;
  score: number;
};

export type WeeklyPlanningUnfilledSlot = {
  slotId: string;
  date: string;
  weekday: number;
  roomId: number;
  roomName: string;
  reasonCodes: string[];
  candidatesBlockedBy: string[];
  blocksPublish: boolean;
};

export type WeeklyPlanningViolation = {
  code: string;
  hard: boolean;
  message: string;
  date?: string;
  roomId?: number;
};

export type WeeklyPlanningResult = {
  meta: {
    year: number;
    week: number;
    from: string;
    to: string;
  };
  profile: Record<string, unknown>;
  stats: {
    generatedAssignments: number;
    existingAssignments: number;
    unfilledSlots: number;
    hardConflicts: number;
    softConflicts: number;
  };
  generatedAssignments: WeeklyPlanningGeneratedAssignment[];
  unfilledSlots: WeeklyPlanningUnfilledSlot[];
  violations: WeeklyPlanningViolation[];
  publishAllowed: boolean;
};

export type WeeklyPlanningRunResponse = {
  plan: WeeklyPlanResponse;
  result: WeeklyPlanningResult;
  appliedAssignments: number;
};

export const weeklyPlanApi = {
  getByWeek: async (
    year: number,
    week: number,
    createIfMissing = true,
  ): Promise<WeeklyPlanResponse> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-plans/week/${year}/${week}?createIfMissing=${createIfMissing ? "true" : "false"}`,
    );
    return handleResponse<WeeklyPlanResponse>(response);
  },
  updateStatus: async (
    id: number,
    status: WeeklyPlanResponse["status"],
  ): Promise<WeeklyPlanResponse> => {
    const response = await apiFetch(`${API_BASE}/weekly-plans/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return handleResponse<WeeklyPlanResponse>(response);
  },
  updateLockedWeekdays: async (
    id: number,
    lockedWeekdays: number[],
  ): Promise<WeeklyPlanResponse> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-plans/${id}/locked-weekdays`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lockedWeekdays }),
      },
    );
    return handleResponse<WeeklyPlanResponse>(response);
  },
  assign: async (
    id: number,
    data: WeeklyPlanAssignmentInput,
  ): Promise<WeeklyPlanAssignmentResponse> => {
    const response = await apiFetch(`${API_BASE}/weekly-plans/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<WeeklyPlanAssignmentResponse>(response);
  },
  updateAssignment: async (
    assignmentId: number,
    data: Partial<WeeklyPlanAssignmentInput>,
  ): Promise<WeeklyPlanAssignmentResponse> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-plans/assignments/${assignmentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return handleResponse<WeeklyPlanAssignmentResponse>(response);
  },
  deleteAssignment: async (assignmentId: number): Promise<void> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-plans/assignments/${assignmentId}`,
      {
        method: "DELETE",
      },
    );
    return handleResponse<void>(response);
  },
  previewGeneration: async (
    year: number,
    week: number,
    ruleProfile?: unknown,
  ): Promise<WeeklyPlanningResult> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-plans/week/${year}/${week}/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleProfile }),
      },
    );
    return handleResponse<WeeklyPlanningResult>(response);
  },
  runGeneration: async (
    year: number,
    week: number,
    ruleProfile?: unknown,
  ): Promise<WeeklyPlanningRunResponse> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-plans/week/${year}/${week}/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleProfile }),
      },
    );
    return handleResponse<WeeklyPlanningRunResponse>(response);
  },
};

// Weekly Assignment API
export const weeklyAssignmentApi = {
  getByWeek: async (
    year: number,
    week: number,
  ): Promise<WeeklyAssignment[]> => {
    const response = await apiFetch(
      `${API_BASE}/weekly-assignments/${year}/${week}`,
    );
    return handleResponse<WeeklyAssignment[]>(response);
  },

  create: async (data: InsertWeeklyAssignment): Promise<WeeklyAssignment> => {
    const response = await apiFetch(`${API_BASE}/weekly-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<WeeklyAssignment>(response);
  },

  bulkSave: async (
    assignments: InsertWeeklyAssignment[],
  ): Promise<WeeklyAssignment[]> => {
    const response = await apiFetch(`${API_BASE}/weekly-assignments/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    return handleResponse<WeeklyAssignment[]>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/weekly-assignments/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

export type ProjectMemberInfo = ProjectMember & {
  name?: string | null;
  lastName?: string | null;
};

export type ProjectDetail = ProjectInitiative & {
  owner?: { id: number; name?: string | null; lastName?: string | null } | null;
  members?: ProjectMemberInfo[];
};

// Project Initiative API
export const projectApi = {
  getAll: async (params?: {
    status?: string;
    category?: string;
  }): Promise<ProjectInitiative[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          searchParams.set(key, String(value));
        }
      });
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const response = await apiFetch(`${API_BASE}/projects${query}`);
    return handleResponse<ProjectInitiative[]>(response);
  },

  getById: async (id: number): Promise<ProjectDetail> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}`);
    return handleResponse<ProjectDetail>(response);
  },

  create: async (
    data: InsertProjectInitiative & {
      assignees?: Array<{ employeeId: number; role?: "read" | "edit" }>;
    },
  ): Promise<ProjectInitiative> => {
    const response = await apiFetch(`${API_BASE}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectInitiative>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertProjectInitiative>,
  ): Promise<ProjectInitiative> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectInitiative>(response);
  },

  assign: async (
    id: number,
    members: Array<{ employeeId: number; role?: "read" | "edit" }>,
  ): Promise<{ members: ProjectMember[] }> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ members }),
    });
    return handleResponse(response);
  },

  accept: async (id: number): Promise<ProjectInitiative> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}/accept`, {
      method: "POST",
    });
    return handleResponse<ProjectInitiative>(response);
  },

  reject: async (id: number, reason: string): Promise<ProjectInitiative> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return handleResponse<ProjectInitiative>(response);
  },

  complete: async (id: number): Promise<ProjectInitiative> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}/complete`, {
      method: "POST",
    });
    return handleResponse<ProjectInitiative>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/projects/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

export type TaskLifecycleStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "DONE";
export type TaskType = "ONE_OFF" | "RESPONSIBILITY";

export type TaskItem = {
  id: number;
  title: string;
  description: string | null;
  status: TaskLifecycleStatus;
  type: TaskType;
  assignedToId: number | null;
  dueDate: string | null;
  parentId: number | null;
  sopId: number | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignedTo: { id: number; name?: string | null; lastName?: string | null } | null;
  subtaskTotal?: number;
  subtaskDone?: number;
};

export type TaskAttachment = {
  id: number;
  taskId: number;
  uploadedById: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type TaskCreatePayload = {
  title: string;
  description?: string | null;
  assignedToId?: number | null;
  dueDate?: string | null;
  parentId?: number | null;
  sopId?: number | null;
  type?: TaskType;
  status?: TaskLifecycleStatus;
};

export type TaskUpdatePayload = Partial<{
  title: string;
  description: string | null;
  status: TaskLifecycleStatus;
  type: TaskType;
  assignedToId: number | null;
  dueDate: string | null;
  sopId: number | null;
}>;

type TaskListOptions = {
  view?: "my" | "team" | "responsibilities";
  assignedToId?: number;
  status?: TaskLifecycleStatus;
  type?: TaskType;
  sopId?: number;
  parentId?: number;
  q?: string;
};

const buildTaskQuery = (params?: TaskListOptions): string => {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  return search.toString() ? `?${search.toString()}` : "";
};

export const tasksApi = {
  list: async (params?: TaskListOptions): Promise<TaskItem[]> => {
    const response = await apiFetch(`${API_BASE}/tasks${buildTaskQuery(params)}`);
    const data = await handleResponse<unknown>(response);
    return unwrapArray<TaskItem>(data);
  },

  getById: async (id: number): Promise<TaskItem> => {
    const response = await apiFetch(`${API_BASE}/tasks/${id}`);
    const data = await handleResponse<unknown>(response);
    return unwrap<TaskItem>(data);
  },

  create: async (data: TaskCreatePayload): Promise<TaskItem> => {
    const response = await apiFetch(`${API_BASE}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<unknown>(response);
    return unwrap<TaskItem>(payload);
  },

  update: async (id: number, data: TaskUpdatePayload): Promise<TaskItem> => {
    const response = await apiFetch(`${API_BASE}/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<unknown>(response);
    return unwrap<TaskItem>(payload);
  },

  createSubtask: async (parentId: number, data: TaskCreatePayload) => {
    const response = await apiFetch(`${API_BASE}/tasks/${parentId}/subtasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<unknown>(response);
    return unwrap<TaskItem>(payload);
  },

  getSubtasks: async (parentId: number): Promise<TaskItem[]> => {
    const response = await apiFetch(`${API_BASE}/tasks/${parentId}/subtasks`);
    const data = await handleResponse<unknown>(response);
    return unwrapArray<TaskItem>(data);
  },
  getAttachments: async (taskId: number) => {
    const response = await apiFetch(`${API_BASE}/tasks/${taskId}/attachments`);
    const data = await handleResponse<unknown>(response);
    return unwrapArray<TaskAttachment>(data);
  },
  uploadAttachment: async (taskId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await apiFetch(`${API_BASE}/tasks/${taskId}/attachments`, {
      method: "POST",
      body: form,
    });
    const data = await handleResponse<unknown>(response);
    return unwrap<TaskAttachment>(data);
  },
  getAttachmentDownloadUrl: (attachmentId: number) => {
    const token = readAuthToken();
    const baseUrl = `${API_BASE}/tasks/attachments/${attachmentId}/download`;
    if (!token) {
      return baseUrl;
    }
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  },
};

export type SopMemberInfo = {
  employeeId: number;
  role: "read" | "edit";
  name?: string | null;
  lastName?: string | null;
};

export type SopVersionWithOwner = SopVersion & {
  releasedByName?: string | null;
  releasedByLastName?: string | null;
};

export type SopDetail = Sop & {
  createdBy?: { id: number; name?: string | null; lastName?: string | null };
  members?: SopMemberInfo[];
  references?: SopReference[];
  versions?: SopVersionWithOwner[];
};

export type SopReferenceSuggestion = Pick<
  SopReference,
  "type" | "title" | "url" | "publisher" | "yearOrVersion" | "relevanceNote"
> & {
  status?: "suggested";
  createdByAi?: boolean;
};

export const sopApi = {
  getAll: async (params?: {
    status?: string;
    category?: string;
    search?: string;
  }): Promise<Sop[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          searchParams.set(key, String(value));
        }
      });
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const response = await apiFetch(`${API_BASE}/sops${query}`);
    return handleResponse<Sop[]>(response);
  },

  getById: async (id: number): Promise<SopDetail> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}`);
    return handleResponse<SopDetail>(response);
  },

  create: async (
    data: InsertSop & {
      assignees?: Array<{ employeeId: number; role?: "read" | "edit" }>;
      status?: "proposed" | "in_progress" | "review" | "published";
    },
  ): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<Sop>(response);
  },

  update: async (id: number, data: Partial<InsertSop>): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return handleResponse<Sop>(response);
  },

  assign: async (
    id: number,
    members: Array<{ employeeId: number; role?: "read" | "edit" }>,
  ): Promise<{ members: SopMemberInfo[] }> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ members }),
    });
    return handleResponse(response);
  },

  accept: async (id: number): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/accept`, {
      method: "POST",
    });
    return handleResponse<Sop>(response);
  },

  reject: async (id: number, reason: string): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return handleResponse<Sop>(response);
  },

  requestReview: async (id: number): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/request-review`, {
      method: "POST",
    });
    return handleResponse<Sop>(response);
  },

  requestChanges: async (id: number, reason: string): Promise<Sop> => {
    const response = await apiFetch(
      `${API_BASE}/sops/${id}/review/request-changes`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
    return handleResponse<Sop>(response);
  },

  publish: async (id: number, changeNote: string): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/review/publish`, {
      method: "POST",
      body: JSON.stringify({ changeNote }),
    });
    return handleResponse<Sop>(response);
  },

  archive: async (id: number): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/archive`, {
      method: "POST",
    });
    return handleResponse<Sop>(response);
  },

  startRevision: async (id: number): Promise<Sop> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/start-revision`, {
      method: "POST",
    });
    return handleResponse<Sop>(response);
  },

  getVersions: async (id: number): Promise<SopVersionWithOwner[]> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/versions`);
    return handleResponse<SopVersionWithOwner[]>(response);
  },

  getReferences: async (id: number): Promise<SopReference[]> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/references`);
    return handleResponse<SopReference[]>(response);
  },

  addReference: async (
    id: number,
    data: Omit<
      SopReference,
      "id" | "sopId" | "createdAt" | "updatedAt" | "verifiedAt"
    >,
  ): Promise<SopReference> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/references`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<SopReference>(response);
  },

  acceptReference: async (
    sopId: number,
    refId: number,
  ): Promise<SopReference> => {
    const response = await apiFetch(
      `${API_BASE}/sops/${sopId}/references/${refId}/accept`,
      {
        method: "POST",
      },
    );
    return handleResponse<SopReference>(response);
  },

  rejectReference: async (
    sopId: number,
    refId: number,
  ): Promise<SopReference> => {
    const response = await apiFetch(
      `${API_BASE}/sops/${sopId}/references/${refId}/reject`,
      {
        method: "POST",
      },
    );
    return handleResponse<SopReference>(response);
  },

  suggestReferences: async (
    sopId: number,
  ): Promise<SopReferenceSuggestion[]> => {
    const response = await apiFetch(
      `${API_BASE}/sops/${sopId}/ai/suggest-references`,
      {
        method: "POST",
      },
    );
    return handleResponse<SopReferenceSuggestion[]>(response);
  },

  downloadDocx: async (id: number): Promise<Blob> => {
    const response = await apiFetch(`${API_BASE}/sops/${id}/export/docx`, {
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || body?.message || "Download failed");
    }
    return response.blob();
  },
};

// Project Tasks API
export const taskApi = {
  getByProject: async (projectId: number): Promise<ProjectTask[]> => {
    const response = await apiFetch(`${API_BASE}/projects/${projectId}/tasks`);
    return handleResponse<ProjectTask[]>(response);
  },

  getById: async (id: number): Promise<ProjectTask> => {
    const response = await apiFetch(`${API_BASE}/tasks/${id}`);
    return handleResponse<ProjectTask>(response);
  },

  create: async (
    projectId: number,
    data: Omit<InsertProjectTask, "initiativeId">,
  ): Promise<ProjectTask> => {
    const response = await apiFetch(`${API_BASE}/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectTask>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertProjectTask>,
  ): Promise<ProjectTask> => {
    const response = await apiFetch(`${API_BASE}/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectTask>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/tasks/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },

  getActivities: async (taskId: number): Promise<TaskActivity[]> => {
    const response = await apiFetch(`${API_BASE}/tasks/${taskId}/activities`);
    return handleResponse<TaskActivity[]>(response);
  },

  addActivity: async (
    taskId: number,
    data: Omit<InsertTaskActivity, "taskId">,
  ): Promise<TaskActivity> => {
    const response = await apiFetch(`${API_BASE}/tasks/${taskId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<TaskActivity>(response);
  },
};

// Project Documents API
export const documentApi = {
  getByProject: async (projectId: number): Promise<ProjectDocument[]> => {
    const response = await apiFetch(
      `${API_BASE}/projects/${projectId}/documents`,
    );
    return handleResponse<ProjectDocument[]>(response);
  },

  getById: async (id: number): Promise<ProjectDocument> => {
    const response = await apiFetch(`${API_BASE}/documents/${id}`);
    return handleResponse<ProjectDocument>(response);
  },

  create: async (
    projectId: number,
    data: Omit<InsertProjectDocument, "initiativeId">,
  ): Promise<ProjectDocument> => {
    const response = await apiFetch(
      `${API_BASE}/projects/${projectId}/documents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return handleResponse<ProjectDocument>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertProjectDocument>,
  ): Promise<ProjectDocument> => {
    const response = await apiFetch(`${API_BASE}/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectDocument>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/documents/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },

  publish: async (id: number): Promise<ProjectDocument> => {
    const response = await apiFetch(`${API_BASE}/documents/${id}/publish`, {
      method: "POST",
    });
    return handleResponse<ProjectDocument>(response);
  },

  getApprovals: async (documentId: number): Promise<Approval[]> => {
    const response = await apiFetch(
      `${API_BASE}/documents/${documentId}/approvals`,
    );
    return handleResponse<Approval[]>(response);
  },

  requestApproval: async (
    documentId: number,
    data: Omit<InsertApproval, "documentId">,
  ): Promise<Approval> => {
    const response = await apiFetch(
      `${API_BASE}/documents/${documentId}/approvals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return handleResponse<Approval>(response);
  },
};

// Approval API
export const approvalApi = {
  update: async (
    id: number,
    data: Partial<InsertApproval>,
  ): Promise<Approval> => {
    const response = await apiFetch(`${API_BASE}/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<Approval>(response);
  },
};

// Knowledge Base API (published documents)
export const knowledgeApi = {
  getPublished: async (): Promise<ProjectDocument[]> => {
    const response = await apiFetch(`${API_BASE}/knowledge/documents`);
    return handleResponse<ProjectDocument[]>(response);
  },
};

// Notifications API
export const notificationsApi = {
  getAll: async (): Promise<Notification[]> => {
    const response = await apiFetch(`${API_BASE}/notifications`);
    return handleResponse<Notification[]>(response);
  },

  markRead: async (id: number): Promise<Notification> => {
    const response = await apiFetch(`${API_BASE}/notifications/${id}/read`, {
      method: "POST",
    });
    return handleResponse<Notification>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/notifications/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

export type OnlineUser = {
  id: number;
  name: string;
  lastName: string;
  lastSeenAt: string | null;
};

export type OnlineUsersResponse = {
  count: number;
  users: OnlineUser[];
};

export const onlineUsersApi = {
  getAll: async (): Promise<OnlineUsersResponse> => {
    const response = await apiFetch(`${API_BASE}/online-users`);
    return handleResponse<OnlineUsersResponse>(response);
  },
};

export type MessageThreadListItem = MessageThread & {
  members?: Array<
    MessageThreadMember & { name?: string | null; lastName?: string | null }
  >;
  lastMessage?: Message | null;
};

export type MessageWithSender = Message & {
  senderName?: string | null;
  senderLastName?: string | null;
};

// Messaging API
export const messagesApi = {
  getThreads: async (): Promise<MessageThreadListItem[]> => {
    const response = await apiFetch(`${API_BASE}/messages/threads`);
    return handleResponse<MessageThreadListItem[]>(response);
  },

  createThread: async (data: {
    type: "direct" | "group";
    title?: string;
    memberIds: number[];
  }): Promise<MessageThread> => {
    const response = await apiFetch(`${API_BASE}/messages/threads`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<MessageThread>(response);
  },

  getMessages: async (threadId: number): Promise<MessageWithSender[]> => {
    const response = await apiFetch(
      `${API_BASE}/messages/threads/${threadId}/messages`,
    );
    return handleResponse<MessageWithSender[]>(response);
  },

  sendMessage: async (threadId: number, content: string): Promise<Message> => {
    const response = await apiFetch(
      `${API_BASE}/messages/threads/${threadId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
    );
    return handleResponse<Message>(response);
  },

  renameThread: async (
    threadId: number,
    title: string,
  ): Promise<MessageThread> => {
    const response = await apiFetch(
      `${API_BASE}/messages/threads/${threadId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title }),
      },
    );
    return handleResponse<MessageThread>(response);
  },

  updateMembers: async (
    threadId: number,
    data: { add?: number[]; remove?: number[] },
  ): Promise<{ members: MessageThreadMember[] }> => {
    const response = await apiFetch(
      `${API_BASE}/messages/threads/${threadId}/members`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    return handleResponse(response);
  },
};

// Shift Swap Request API
export const shiftSwapApi = {
  getAll: async (): Promise<ShiftSwapRequest[]> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps`);
    return handleResponse<ShiftSwapRequest[]>(response);
  },

  getPending: async (): Promise<ShiftSwapRequest[]> => {
    const response = await apiFetch(
      `${API_BASE}/shift-swaps?status=Ausstehend`,
    );
    return handleResponse<ShiftSwapRequest[]>(response);
  },

  getByEmployee: async (employeeId: number): Promise<ShiftSwapRequest[]> => {
    const response = await apiFetch(
      `${API_BASE}/shift-swaps?employeeId=${employeeId}`,
    );
    return handleResponse<ShiftSwapRequest[]>(response);
  },

  getByTargetEmployee: async (
    employeeId: number,
  ): Promise<ShiftSwapRequest[]> => {
    const response = await apiFetch(
      `${API_BASE}/shift-swaps?targetEmployeeId=${employeeId}`,
    );
    return handleResponse<ShiftSwapRequest[]>(response);
  },

  getById: async (id: number): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}`);
    return handleResponse<ShiftSwapRequest>(response);
  },

  create: async (data: InsertShiftSwapRequest): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ShiftSwapRequest>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertShiftSwapRequest>,
  ): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ShiftSwapRequest>(response);
  },

  approve: async (
    id: number,
    approverId: number,
    notes?: string,
  ): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, notes }),
    });
    return handleResponse<ShiftSwapRequest>(response);
  },

  reject: async (
    id: number,
    approverId: number,
    notes?: string,
  ): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, notes }),
    });
    return handleResponse<ShiftSwapRequest>(response);
  },

  acceptRequest: async (id: number): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}/accept`, {
      method: "POST",
    });
    return handleResponse<ShiftSwapRequest>(response);
  },

  rejectRequest: async (id: number): Promise<ShiftSwapRequest> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}/reject`, {
      method: "POST",
    });
    return handleResponse<ShiftSwapRequest>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/shift-swaps/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

// Roster Settings API
export interface NextPlanningMonth {
  year: number;
  month: number;
  totalEmployees: number;
  submittedCount: number;
  allSubmitted: boolean;
  draftShiftCount?: number;
  hasDraft?: boolean;
  eligibleEmployeeIds?: number[];
}

export type WeeklyRuleProfileResponse = {
  weeklyRuleProfile: Record<string, unknown> | null;
};

export const rosterSettingsApi = {
  get: async (): Promise<RosterSettings> => {
    const response = await apiFetch(`${API_BASE}/roster-settings`);
    return handleResponse<RosterSettings>(response);
  },

  update: async (data: InsertRosterSettings): Promise<RosterSettings> => {
    const response = await apiFetch(`${API_BASE}/roster-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<RosterSettings>(response);
  },

  getNextPlanningMonth: async (): Promise<NextPlanningMonth> => {
    const response = await apiFetch(
      `${API_BASE}/roster-settings/next-planning-month`,
    );
    return handleResponse<NextPlanningMonth>(response);
  },

  setWishMonth: async (
    year: number,
    month: number,
  ): Promise<RosterSettings> => {
    const response = await apiFetch(`${API_BASE}/roster-settings/wishes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month }),
    });
    return handleResponse<RosterSettings>(response);
  },

  getWeeklyRuleProfile: async (): Promise<WeeklyRuleProfileResponse> => {
    const response = await apiFetch(
      `${API_BASE}/roster-settings/weekly-rule-profile`,
    );
    return handleResponse<WeeklyRuleProfileResponse>(response);
  },

  updateWeeklyRuleProfile: async (
    weeklyRuleProfile: unknown,
  ): Promise<WeeklyRuleProfileResponse> => {
    const response = await apiFetch(
      `${API_BASE}/roster-settings/weekly-rule-profile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyRuleProfile }),
      },
    );
    return handleResponse<WeeklyRuleProfileResponse>(response);
  },
};

// Shift Wishes API
export const shiftWishesApi = {
  getByMonth: async (year: number, month: number): Promise<ShiftWish[]> => {
    const response = await apiFetch(
      `${API_BASE}/shift-wishes?year=${year}&month=${month}`,
    );
    return handleResponse<ShiftWish[]>(response);
  },

  getByEmployeeAndMonth: async (
    employeeId: number,
    year: number,
    month: number,
  ): Promise<ShiftWish | null> => {
    const response = await apiFetch(
      `${API_BASE}/shift-wishes?employeeId=${employeeId}&year=${year}&month=${month}`,
    );
    return handleResponse<ShiftWish | null>(response);
  },

  create: async (data: InsertShiftWish): Promise<ShiftWish> => {
    const response = await apiFetch(`${API_BASE}/shift-wishes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ShiftWish>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertShiftWish>,
  ): Promise<ShiftWish> => {
    const response = await apiFetch(`${API_BASE}/shift-wishes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<ShiftWish>(response);
  },

  submit: async (id: number): Promise<ShiftWish> => {
    const response = await apiFetch(`${API_BASE}/shift-wishes/${id}/submit`, {
      method: "POST",
    });
    return handleResponse<ShiftWish>(response);
  },

  reopen: async (id: number): Promise<ShiftWish> => {
    const response = await apiFetch(`${API_BASE}/shift-wishes/${id}/reopen`, {
      method: "POST",
    });
    return handleResponse<ShiftWish>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/shift-wishes/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

// Long-term shift wishes API
export const longTermWishesApi = {
  getByEmployee: async (
    employeeId: number,
  ): Promise<LongTermShiftWish | null> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-wishes?employeeId=${employeeId}`,
    );
    return handleResponse<LongTermShiftWish | null>(response);
  },

  getByStatus: async (status: string): Promise<LongTermShiftWish[]> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-wishes?status=${encodeURIComponent(status)}`,
    );
    return handleResponse<LongTermShiftWish[]>(response);
  },

  save: async (data: InsertLongTermShiftWish): Promise<LongTermShiftWish> => {
    const response = await apiFetch(`${API_BASE}/long-term-wishes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<LongTermShiftWish>(response);
  },

  submit: async (id: number): Promise<LongTermShiftWish> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-wishes/${id}/submit`,
      {
        method: "POST",
      },
    );
    return handleResponse<LongTermShiftWish>(response);
  },

  approve: async (id: number, notes?: string): Promise<LongTermShiftWish> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-wishes/${id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      },
    );
    return handleResponse<LongTermShiftWish>(response);
  },

  reject: async (id: number, notes?: string): Promise<LongTermShiftWish> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-wishes/${id}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      },
    );
    return handleResponse<LongTermShiftWish>(response);
  },
};

// Long-term absences API
export const longTermAbsencesApi = {
  getByEmployee: async (employeeId: number): Promise<LongTermAbsence[]> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-absences?employeeId=${employeeId}`,
    );
    return handleResponse<LongTermAbsence[]>(response);
  },

  getByStatus: async (
    status: string,
    from?: string,
    to?: string,
  ): Promise<LongTermAbsence[]> => {
    const params = new URLSearchParams({ status });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const response = await apiFetch(
      `${API_BASE}/long-term-absences?${params.toString()}`,
    );
    return handleResponse<LongTermAbsence[]>(response);
  },

  create: async (data: InsertLongTermAbsence): Promise<LongTermAbsence> => {
    const response = await apiFetch(`${API_BASE}/long-term-absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<LongTermAbsence>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertLongTermAbsence>,
  ): Promise<LongTermAbsence> => {
    const response = await apiFetch(`${API_BASE}/long-term-absences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<LongTermAbsence>(response);
  },

  submit: async (id: number): Promise<LongTermAbsence> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-absences/${id}/submit`,
      {
        method: "POST",
      },
    );
    return handleResponse<LongTermAbsence>(response);
  },

  approve: async (id: number, notes?: string): Promise<LongTermAbsence> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-absences/${id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      },
    );
    return handleResponse<LongTermAbsence>(response);
  },

  reject: async (id: number, notes?: string): Promise<LongTermAbsence> => {
    const response = await apiFetch(
      `${API_BASE}/long-term-absences/${id}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      },
    );
    return handleResponse<LongTermAbsence>(response);
  },
};

export interface PlannedAbsenceAdmin extends PlannedAbsence {
  employeeName?: string | null;
  employeeLastName?: string | null;
  employeeRole?: string | null;
}

export interface PlannedAbsenceMonthSummary {
  year: number;
  month: number;
  absences: PlannedAbsenceAdmin[];
  summary: {
    total: number;
    geplant: number;
    genehmigt: number;
    abgelehnt: number;
  };
  byReason?: Record<string, PlannedAbsenceAdmin[]>;
}

export const plannedAbsencesAdminApi = {
  getMonthSummary: async (
    year: number,
    month: number,
  ): Promise<PlannedAbsenceMonthSummary> => {
    const response = await apiFetch(
      `${API_BASE}/absences/month/${year}/${month}`,
    );
    return handleResponse<PlannedAbsenceMonthSummary>(response);
  },
  getRange: async (options: {
    from: string;
    to: string;
    status?: "Geplant" | "Genehmigt" | "Abgelehnt";
    employeeId?: number;
  }): Promise<PlannedAbsenceAdmin[]> => {
    const params = new URLSearchParams();
    params.set("from", options.from);
    params.set("to", options.to);
    if (options.status) params.set("status", options.status);
    if (typeof options.employeeId === "number")
      params.set("employeeId", String(options.employeeId));
    const response = await apiFetch(
      `${API_BASE}/absences?${params.toString()}`,
    );
    return handleResponse<PlannedAbsenceAdmin[]>(response);
  },
  create: async (data: {
    employeeId: number;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string | null;
    status?: "Geplant" | "Genehmigt" | "Abgelehnt";
  }): Promise<PlannedAbsenceAdmin> => {
    const response = await apiFetch(`${API_BASE}/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<PlannedAbsenceAdmin>(response);
  },
  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/absences/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },

  updateStatus: async (
    id: number,
    status: "Geplant" | "Genehmigt" | "Abgelehnt",
    approvedById?: number,
  ): Promise<PlannedAbsenceAdmin> => {
    const response = await apiFetch(`${API_BASE}/absences/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approvedById }),
    });
    return handleResponse<PlannedAbsenceAdmin>(response);
  },
  respond: async (
    id: number,
    action: "accept" | "decline",
  ): Promise<PlannedAbsenceAdmin> => {
    const response = await apiFetch(`${API_BASE}/absences/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return handleResponse<PlannedAbsenceAdmin>(response);
  },
};

export type VacationRuleInput = Omit<
  InsertVacationRule,
  "createdById" | "updatedById" | "createdAt" | "updatedAt"
>;

export const vacationRulesApi = {
  getAll: async (departmentId?: number): Promise<VacationRule[]> => {
    const params = new URLSearchParams();
    if (typeof departmentId === "number") {
      params.set("departmentId", String(departmentId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiFetch(`${API_BASE}/vacation-rules${suffix}`);
    return handleResponse<VacationRule[]>(response);
  },
  create: async (data: VacationRuleInput): Promise<VacationRule> => {
    const response = await apiFetch(`${API_BASE}/vacation-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<VacationRule>(response);
  },
  update: async (
    id: number,
    data: Partial<VacationRuleInput>,
  ): Promise<VacationRule> => {
    const response = await apiFetch(`${API_BASE}/vacation-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<VacationRule>(response);
  },
  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/vacation-rules/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

// Planned Absences API
export const plannedAbsencesApi = {
  getByMonth: async (
    year: number,
    month: number,
  ): Promise<PlannedAbsence[]> => {
    const response = await apiFetch(
      `${API_BASE}/planned-absences?year=${year}&month=${month}`,
    );
    return handleResponse<PlannedAbsence[]>(response);
  },

  getByEmployeeAndMonth: async (
    employeeId: number,
    year: number,
    month: number,
  ): Promise<PlannedAbsence[]> => {
    const response = await apiFetch(
      `${API_BASE}/planned-absences?employeeId=${employeeId}&year=${year}&month=${month}`,
    );
    return handleResponse<PlannedAbsence[]>(response);
  },

  create: async (data: InsertPlannedAbsence): Promise<PlannedAbsence> => {
    const response = await apiFetch(`${API_BASE}/planned-absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<PlannedAbsence>(response);
  },

  update: async (
    id: number,
    data: Partial<InsertPlannedAbsence>,
  ): Promise<PlannedAbsence> => {
    const response = await apiFetch(`${API_BASE}/planned-absences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<PlannedAbsence>(response);
  },

  delete: async (id: number): Promise<void> => {
    const response = await apiFetch(`${API_BASE}/planned-absences/${id}`, {
      method: "DELETE",
    });
    return handleResponse<void>(response);
  },
};

export interface ToolVisibilitySetting {
  toolKey: string;
  isEnabled: boolean;
}

// Tools API
export const toolsApi = {
  getVisibility: async (): Promise<ToolVisibilitySetting[]> => {
    const response = await apiFetch(`${API_BASE}/tools`);
    return handleResponse<ToolVisibilitySetting[]>(response);
  },

  updateVisibility: async (
    tools: ToolVisibilitySetting[],
  ): Promise<ToolVisibilitySetting[]> => {
    const response = await apiFetch(`${API_BASE}/tools/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tools }),
    });
    return handleResponse<ToolVisibilitySetting[]>(response);
  },
};

// Planning API
const buildPlanningQuery = (year: number, month: number) => {
  const params = new URLSearchParams();
  params.set("year", String(year));
  params.set("month", String(month));
  return `?${params.toString()}`;
};

export const planningRestApi = {
  getInput: async (year: number, month: number): Promise<PlanningInputV1> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/${year}/${month}/input`,
    );
    return handleResponse<PlanningInputV1>(response);
  },

  getState: async (year: number, month: number): Promise<PlanningStateResponse> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/state${buildPlanningQuery(year, month)}`,
    );
    return handleResponse<PlanningStateResponse>(response);
  },

  getInputSummary: async (
    year: number,
    month: number,
  ): Promise<PlanningInputSummary> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/input-summary${buildPlanningQuery(
        year,
        month,
      )}`,
    );
    return handleResponse<PlanningInputSummary>(response);
  },

  getLocks: async (
    year: number,
    month: number,
  ): Promise<PlanningLock[]> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/locks${buildPlanningQuery(year, month)}`,
    );
    return handleResponse<PlanningLock[]>(response);
  },

  upsertLock: async (
    year: number,
    month: number,
    slotId: string,
    employeeId: number | null,
  ): Promise<PlanningLock> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/${year}/${month}/locks`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, employeeId }),
      },
    );
    return handleResponse<PlanningLock>(response);
  },

  deleteLock: async (
    year: number,
    month: number,
    slotId: string,
  ): Promise<void> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/${year}/${month}/locks/${encodeURIComponent(
        slotId,
      )}`,
      { method: "DELETE" },
    );
    return handleResponse<void>(response);
  },

  preview: async (
    year: number,
    month: number,
    data: { seed?: number | null },
  ): Promise<PlanningOutputV1> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/${year}/${month}/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return handleResponse<PlanningOutputV1>(response);
  },

  run: async (
    year: number,
    month: number,
    data: {
      seed?: number | null;
      dryRun?: boolean;
      specialRules?: {
        fixedPreferredEmployeeIds?: number[];
        noDutyEmployeeIds?: number[];
      };
    },
  ): Promise<PlanningOutputV1> => {
    const response = await apiFetch(
      `${API_BASE}/roster/planning/${year}/${month}/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return handleResponse<PlanningOutputV1>(response);
  },

  runPlanningPreview: async (
    year: number,
    month: number,
    data: {
      seed?: number | null;
      specialRules?: {
        fixedPreferredEmployeeIds?: number[];
        noDutyEmployeeIds?: number[];
      };
    } = {},
  ): Promise<PlanningOutputV1> => {
    return planningRestApi.run(year, month, { ...data, dryRun: true });
  },
};
