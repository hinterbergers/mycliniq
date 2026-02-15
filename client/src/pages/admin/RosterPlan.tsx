import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { PlanningDrawer } from "@/components/planning/PlanningDrawer";
import {
  PlanningInspector,
  type SlotInspectorInfo,
} from "@/components/planning/PlanningInspector";
import {
  Download,
  ArrowLeft,
  ArrowRight,
  Info,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Brain,
  Pencil,
  Calendar,
  Plus,
  X,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  employeeApi,
  planningRestApi,
  rosterApi,
  plannedAbsencesAdminApi,
  longTermAbsencesApi,
  dutyPlansApi,
  rosterSettingsApi,
  serviceLinesApi,
  getServiceLineContextFromEmployee,
  type NextPlanningMonth,
  type PlannedAbsenceAdmin,
  type PlanningOutputV1,
  type PlanningOutputViolation,
  type PlanningUnfilledSlot,
} from "@/lib/api";
import type {
  Employee,
  RosterShift,
  LongTermAbsence,
  DutyPlan,
  ServiceLine,
} from "@shared/schema";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
} from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePlanning } from "@/hooks/usePlanning";
import {
  getServiceTypesForEmployee,
  employeeDoesShifts,
  type ServiceType,
} from "@shared/shiftTypes";
import { getAustrianHoliday } from "@/lib/holidays";

interface GeneratedShift {
  date: string;
  serviceType: string;
  employeeId: number | null;
  employeeName?: string;
  assigneeFreeText?: string | null;
}

type ServiceLineConfig = {
  key: string;
  label: string;
  sortOrder?: number | null;
  isActive?: boolean | null;
  roleGroup?: string | null;
};

interface PromptPreviewData {
  model: string;
  maxOutputTokens: number;
  system: string;
  prompt: string;
  promptCharCount: number;
  approxTokenHint: number;
}

type GenerationPayload = {
  year: number;
  month: number;
  rules: AiRules;
  specialRules?: PlannerSpecialRules;
  promptOverride?: string;
};

const SERVICE_LINE_PALETTE = [
  {
    header: "bg-pink-50/50 border-pink-100 text-pink-900",
    cell: "bg-pink-100 text-pink-800 border-pink-200",
    stat: "bg-pink-50/20 text-pink-900",
  },
  {
    header: "bg-blue-50/50 border-blue-100 text-blue-900",
    cell: "bg-blue-100 text-blue-800 border-blue-200",
    stat: "bg-blue-50/20 text-blue-900",
  },
  {
    header: "bg-emerald-50/50 border-emerald-100 text-emerald-900",
    cell: "bg-emerald-100 text-emerald-800 border-emerald-200",
    stat: "bg-emerald-50/20 text-emerald-900",
  },
  {
    header: "bg-violet-50/50 border-violet-100 text-violet-900",
    cell: "bg-violet-100 text-violet-800 border-violet-200",
    stat: "bg-violet-50/20 text-violet-900",
  },
  {
    header: "bg-amber-50/50 border-amber-100 text-amber-900",
    cell: "bg-amber-100 text-amber-800 border-amber-200",
    stat: "bg-amber-50/20 text-amber-900",
  },
  {
    header: "bg-sky-50/50 border-sky-100 text-sky-900",
    cell: "bg-sky-100 text-sky-800 border-sky-200",
    stat: "bg-sky-50/20 text-sky-900",
  },
];

const API_BASE = "/api";

const FALLBACK_SERVICE_LINES = [
  {
    key: "kreiszimmer",
    label: "Kreißzimmer (Ass.)",
    roleGroup: "ASS",
    sortOrder: 1,
    isActive: true,
  },
  {
    key: "gyn",
    label: "Gynäkologie (OA)",
    roleGroup: "OA",
    sortOrder: 2,
    isActive: true,
  },
  {
    key: "turnus",
    label: "Turnus (Ass./TA)",
    roleGroup: "TURNUS",
    sortOrder: 3,
    isActive: true,
  },
  {
    key: "overduty",
    label: "Überdienst (Ruf)",
    roleGroup: "OA",
    sortOrder: 4,
    isActive: true,
  },
];

const PLAN_STATUS_LABELS: Record<DutyPlan["status"], string> = {
  Entwurf: "Bearbeitung",
  Vorläufig: "Vorschau",
  Freigegeben: "Freigabe",
};

const UNFILLED_REASON_LABELS: Record<string, string> = {
  NO_CANDIDATE: "Keine passende Ressource gefunden",
  BAN_DATE: "Abwesenheit/Sperrtag",
  BAN_WEEKDAY: "Wochentag gesperrt",
  CONSECUTIVE_DAY: "Folgetag-Regel",
  MAX_SLOTS: "Monatslimit erreicht",
  MAX_WEEK_SLOTS: "Wochenlimit erreicht",
  MAX_WEEKEND_SLOTS: "Wochenendlimit erreicht",
  NO_DUTY_EMPLOYEE: "Mitarbeiter ist auf 'kein Dienst' gesetzt",
  FIXED_ONLY: "Mitarbeiter hat nur Fixwunschdienste",
  ROLE_NOT_ALLOWED: "Diensttyp nicht erlaubt",
  LOCKED_EMPTY: "Slot ist als leer gesperrt",
  FIX_PREFERRED_CONFLICT: "Fixwunsch kollidiert mit harten Regeln",
};

const MONTH_NAMES = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const RULES_STORAGE_KEY = "mycliniq.roster.aiRules.v1";
const SPECIAL_RULES_STORAGE_KEY = "mycliniq.roster.specialRules.v1";
const LONGTERM_ABSENCE_TOGGLE_KEY = "mycliniq.roster.editor.showLongTermAbsences.v1";
const ABSENCE_COLUMN_VISIBLE_KEY = "mycliniq.roster.editor.absenceColumnVisible.v1";

type AiRuleWeights = {
  weekendFairness: number;
  preferenceSatisfaction: number;
  minimizeConflicts: number;
};

type AiRules = {
  version: number;
  hard: string;
  soft: string;
  weights: AiRuleWeights;
};

type PlannerSpecialRules = {
  version: number;
  fixedPreferredEmployeeIds: number[];
  noDutyEmployeeIds: number[];
};

const DEFAULT_AI_RULES: AiRules = {
  version: 1,
  hard: `# Hard Rules (MUSS)
- Wenn Primarius einen Wunsch einträgt, ist er fix.
- Keine zwei Dienste an aufeinanderfolgenden Kalendertagen pro Person.
`,
  soft: `# Soft Rules (SOLL)
- Wochenenden fair verteilen (rolling).
- Möglichst keine 2 Wochenenden in Serie.
`,
  weights: {
    weekendFairness: 7,
    preferenceSatisfaction: 7,
    minimizeConflicts: 10,
  },
};

const DEFAULT_SPECIAL_RULES: PlannerSpecialRules = {
  version: 1,
  fixedPreferredEmployeeIds: [],
  noDutyEmployeeIds: [],
};

const clampWeight = (value: number) => Math.max(0, Math.min(10, value));

const ROLE_SORT_ORDER: Record<string, number> = {
  Primararzt: 1,
  "1. Oberarzt": 2,
  Funktionsoberarzt: 3,
  Ausbildungsoberarzt: 4,
  Oberarzt: 5,
  Oberärztin: 5,
  Facharzt: 6,
  Assistenzarzt: 7,
  Assistenzärztin: 7,
  Turnusarzt: 8,
  "Student (KPJ)": 9,
  "Student (Famulant)": 9,
};

const normalizeRoleValue = (role?: string | null) => {
  if (!role) return "";
  if (role === "Oberärztin") return "Oberarzt";
  if (role === "Assistenzärztin") return "Assistenzarzt";
  return role;
};

const getRoleSortRank = (role?: string | null) =>
  ROLE_SORT_ORDER[normalizeRoleValue(role)] ?? 999;

const getRoleGroup = (role?: string | null) => {
  const normalized = normalizeRoleValue(role);
  if (
    normalized === "Assistenzarzt" ||
    normalized === "Turnusarzt" ||
    normalized === "Student (KPJ)" ||
    normalized === "Student (Famulant)"
  ) {
    return "ass";
  }
  return "oa";
};

const ABSENCE_REASONS = [
  "Urlaub",
  "Fortbildung",
  "Krankenstand",
  "Zeitausgleich",
  "Pflegeurlaub",
  "Gebührenurlaub",
  "Sonderurlaub",
  "Zusatzurlaub",
  "Quarantäne",
  "Ruhezeit",
] as const;

type RosterAbsenceEntry = {
  employeeId: number;
  name: string;
  reason: string;
  source: "planned" | "long_term" | "legacy";
  absenceId?: number;
  status?: "Geplant" | "Genehmigt" | "Abgelehnt";
  notes?: string | null;
};

const getLastNameFromText = (value?: string | null) => {
  if (!value) return "";
  const parts = value.trim().split(/\s+/);
  return parts[parts.length - 1] || value;
};

const formatSlotId = (date: Date, type: ServiceType) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}-${type}`;
};

export default function RosterPlan() {
  const {
    employee: currentUser,
    capabilities,
    isAdmin,
    isTechnicalAdmin,
    token,
  } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [absences, setAbsences] = useState<PlannedAbsenceAdmin[]>([]);
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>(
    [],
  );
  const [dutyPlan, setDutyPlan] = useState<DutyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [generatedShifts, setGeneratedShifts] = useState<GeneratedShift[]>([]);
  const [generationReasoning, setGenerationReasoning] = useState("");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [generationUnfilledSlots, setGenerationUnfilledSlots] = useState<
    PlanningUnfilledSlot[]
  >([]);
  const [generationViolations, setGenerationViolations] = useState<
    PlanningOutputViolation[]
  >([]);
  const [generationPublishAllowed, setGenerationPublishAllowed] =
    useState(true);
  const [latestGenerationMode, setLatestGenerationMode] = useState<
    "draft" | "final" | null
  >(null);
  const [isApplying, setIsApplying] = useState(false);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [planningDrawerOpen, setPlanningDrawerOpen] = useState(false);
  const [planningAutoRunTrigger] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSlot, setInspectorSlot] = useState<SlotInspectorInfo | null>(
    null,
  );
  const [showLongTermAbsences, setShowLongTermAbsences] = useState(false);
  const [showAbsenceColumn, setShowAbsenceColumn] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(
    null,
  );
  const [publishedPlanApplied, setPublishedPlanApplied] = useState(false);
  const [wishDialogOpen, setWishDialogOpen] = useState(false);
  const [wishMonth, setWishMonth] = useState<number>(
    currentDate.getMonth() + 1,
  );
  const [wishYear, setWishYear] = useState<number>(currentDate.getFullYear());
  const [wishSaving, setWishSaving] = useState(false);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceDraft, setAbsenceDraft] = useState<{
    employeeId: string;
    startDate: string;
    endDate: string;
    reason: (typeof ABSENCE_REASONS)[number];
    notes: string;
  }>({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: ABSENCE_REASONS[0],
    notes: "",
  });
  const [rulesDialogOpen, setRulesDialogOpen] = useState(false);
  const [aiRules, setAiRules] = useState<AiRules>(DEFAULT_AI_RULES);
  const [specialRules, setSpecialRules] =
    useState<PlannerSpecialRules>(DEFAULT_SPECIAL_RULES);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [promptPreviewSupported, setPromptPreviewSupported] = useState(true);
  const [promptPreviewData, setPromptPreviewData] =
    useState<PromptPreviewData | null>(null);
  const [promptPreviewEdited, setPromptPreviewEdited] = useState("");
  const [pendingGenerationPayload, setPendingGenerationPayload] =
    useState<GenerationPayload | null>(null);
  const planStatus = dutyPlan?.status ?? "Entwurf";
  const planStatusLabel = PLAN_STATUS_LABELS[planStatus];
  const isDraftMode =
    planStatus === "Entwurf" || latestGenerationMode === "draft";
  const shouldUseDraftData = isDraftMode || manualEditMode;

  const currentPlanningYear = currentDate.getFullYear();
  const currentPlanningMonth = currentDate.getMonth() + 1;
  const {
    input: planningInput,
    state: planningState,
    locks: planningLocks,
    loading: planningLoading,
    error: planningError,
    refresh: refreshPlanning,
  } = usePlanning(currentPlanningYear, currentPlanningMonth);

  const fetchRosterShifts = useCallback(
    async (draftFlag?: boolean) => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const data = await rosterApi.getByMonth(year, month, {
        draft: draftFlag ? true : undefined,
      });
      return Array.isArray(data) ? data : [];
    },
    [currentDate],
  );

  const reloadRosterShifts = useCallback(
    async (draftFlag: boolean) => {
      const data = await fetchRosterShifts(draftFlag);
      setShifts(data);
      return data;
    },
    [fetchRosterShifts],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(RULES_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      const weights = parsed.weights ?? {};
      setAiRules({
        version:
          typeof parsed.version === "number"
            ? parsed.version
            : DEFAULT_AI_RULES.version,
        hard:
          typeof parsed.hard === "string"
            ? parsed.hard
            : DEFAULT_AI_RULES.hard,
        soft:
          typeof parsed.soft === "string"
            ? parsed.soft
            : DEFAULT_AI_RULES.soft,
        weights: {
          weekendFairness: clampWeight(
            typeof weights.weekendFairness === "number"
              ? weights.weekendFairness
              : DEFAULT_AI_RULES.weights.weekendFairness,
          ),
          preferenceSatisfaction: clampWeight(
            typeof weights.preferenceSatisfaction === "number"
              ? weights.preferenceSatisfaction
              : DEFAULT_AI_RULES.weights.preferenceSatisfaction,
          ),
          minimizeConflicts: clampWeight(
            typeof weights.minimizeConflicts === "number"
              ? weights.minimizeConflicts
              : DEFAULT_AI_RULES.weights.minimizeConflicts,
          ),
        },
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(aiRules));
  }, [aiRules]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SPECIAL_RULES_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      const fixedPreferredEmployeeIds = Array.isArray(parsed.fixedPreferredEmployeeIds)
        ? parsed.fixedPreferredEmployeeIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value))
        : [];
      const noDutyEmployeeIds = Array.isArray(parsed.noDutyEmployeeIds)
        ? parsed.noDutyEmployeeIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value))
        : [];
      setSpecialRules({
        version:
          typeof parsed.version === "number"
            ? parsed.version
            : DEFAULT_SPECIAL_RULES.version,
        fixedPreferredEmployeeIds,
        noDutyEmployeeIds,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SPECIAL_RULES_STORAGE_KEY,
      JSON.stringify(specialRules),
    );
  }, [specialRules]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(LONGTERM_ABSENCE_TOGGLE_KEY);
    if (!stored) return;
    setShowLongTermAbsences(stored === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      LONGTERM_ABSENCE_TOGGLE_KEY,
      showLongTermAbsences ? "1" : "0",
    );
  }, [showLongTermAbsences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ABSENCE_COLUMN_VISIBLE_KEY);
    if (stored === "1") {
      setShowAbsenceColumn(true);
    } else if (stored === "0") {
      setShowAbsenceColumn(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      ABSENCE_COLUMN_VISIBLE_KEY,
      showAbsenceColumn ? "1" : "0",
    );
  }, [showAbsenceColumn]);

  const serviceLineDisplay = useMemo(() => {
    const lines: ServiceLineConfig[] = (
      serviceLines.length ? serviceLines : FALLBACK_SERVICE_LINES
    ) as ServiceLineConfig[];

    const shiftKeys = new Set(shifts.map((shift) => shift.serviceType));
    const knownKeys = new Set(lines.map((line) => line.key));

    const extras: ServiceLineConfig[] = [...shiftKeys]
      .filter((key) => !knownKeys.has(key))
      .map((key) => ({
        key,
        label: key,
        sortOrder: 999,
        isActive: true,
        roleGroup: null,
      }));

    return [...lines, ...extras]
      .filter((line) => line.isActive !== false || shiftKeys.has(line.key))
      .sort((a, b) => {
        const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (order !== 0) return order;
        return a.label.localeCompare(b.label);
      })
      .map((line, index) => ({
        key: line.key as ServiceType,
        label: line.label,
        roleGroup: line.roleGroup ?? null,
        style: SERVICE_LINE_PALETTE[index % SERVICE_LINE_PALETTE.length],
      }));
  }, [serviceLines, shifts]);

  const serviceLineMeta = useMemo(
    () =>
      serviceLineDisplay.map((line) => ({
        key: line.key,
        roleGroup: line.roleGroup,
      })),
    [serviceLineDisplay],
  );

  const serviceLineLookup = useMemo(() => {
    return new Map(serviceLineDisplay.map((line) => [line.key, line]));
  }, [serviceLineDisplay]);

  const toggleAbsenceColumn = useCallback(() => {
    setShowAbsenceColumn((prev) => !prev);
  }, []);

  const absenceEmployeeOptions = useMemo(() => {
    return [...employees].sort((a, b) => {
      const lastNameA = (a.lastName || a.name || "").toLowerCase();
      const lastNameB = (b.lastName || b.name || "").toLowerCase();
      if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB);
      const firstNameA = (a.firstName || "").toLowerCase();
      const firstNameB = (b.firstName || "").toLowerCase();
      return firstNameA.localeCompare(firstNameB);
    });
  }, [employees]);

  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    if (isAdmin || isTechnicalAdmin) return true;
    return capabilities.includes("dutyplan.edit");
  }, [currentUser, isAdmin, isTechnicalAdmin, capabilities]);

  const canPublish = useMemo(() => {
    if (!currentUser) return false;
    if (isAdmin || isTechnicalAdmin) return true;
    return capabilities.includes("dutyplan.publish");
  }, [currentUser, isAdmin, isTechnicalAdmin, capabilities]);

  const canApproveVacation = useMemo(() => {
    if (!currentUser) return false;
    if (isAdmin || isTechnicalAdmin) return true;
    return capabilities.includes("vacation.approve");
  }, [currentUser, isAdmin, isTechnicalAdmin, capabilities]);

  const activePlannedAbsences = useMemo(
    () => absences.filter((absence) => absence.status !== "Abgelehnt"),
    [absences],
  );

  const yearOptions = useMemo(() => {
    const baseYear = currentDate.getFullYear();
    return [baseYear, baseYear + 1, baseYear + 2];
  }, [currentDate]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const dayStrings = useMemo(
    () => days.map((day) => format(day, "yyyy-MM-dd")),
    [days],
  );

  const getShiftForDay = (date: Date, type: ServiceType) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return shifts.find((s) => s.date === dateStr && s.serviceType === type);
  };

  const handleSlotInspectorOpen = (slotInfo: SlotInspectorInfo | null) => {
    if (!slotInfo) return;
    setInspectorSlot(slotInfo);
    setInspectorOpen(true);
  };

  const getEmployeeById = (id?: number | null) => {
    if (!id) return null;
    return employees.find((e) => e.id === id) || null;
  };

  const isLegacyInactiveOnDate = (employee: Employee, dateStr: string) => {
    if (!employee.inactiveFrom && !employee.inactiveUntil) return false;
    const target = new Date(`${dateStr}T00:00:00`);
    const from = employee.inactiveFrom
      ? new Date(`${employee.inactiveFrom}T00:00:00`)
      : null;
    const until = employee.inactiveUntil
      ? new Date(`${employee.inactiveUntil}T00:00:00`)
      : null;
    if (from && until) return target >= from && target <= until;
    if (from) return target >= from;
    if (until) return target <= until;
    return false;
  };

  const resolveEmployeeLastName = (
    employeeId: number,
    fallbackName?: string | null,
    fallbackLastName?: string | null,
  ) => {
    const employee = employees.find((emp) => emp.id === employeeId);
    if (employee?.lastName) return employee.lastName;
    if (employee?.name) return getLastNameFromText(employee.name);
    if (fallbackLastName) return getLastNameFromText(fallbackLastName);
    if (fallbackName) return getLastNameFromText(fallbackName);
    return "Unbekannt";
  };

  const getConflictReasons = (
    employee: Employee | null,
    dateStr: string,
    type: ServiceType,
  ) => {
    if (!employee) return [];
    const reasons: string[] = [];
    const allowedTypes = getServiceTypesForEmployee(employee, serviceLineMeta);
    if (!allowedTypes.includes(type)) {
      reasons.push("Nicht für diesen Dienst einsetzbar");
    }
    if (employee.takesShifts === false) {
      reasons.push("Dienstplan berücksichtigen ist deaktiviert");
    }
    if (employee.isActive === false) {
      reasons.push("Mitarbeiter ist deaktiviert");
    }
    const hasAbsence = activePlannedAbsences.some(
      (absence) =>
        absence.employeeId === employee.id &&
        absence.startDate <= dateStr &&
        absence.endDate >= dateStr,
    );
    if (hasAbsence) {
      reasons.push("Abwesenheit eingetragen");
    }
    const hasLongTermAbsence = longTermAbsences.some(
      (absence) =>
        absence.employeeId === employee.id &&
        absence.status === "Genehmigt" &&
        absence.startDate <= dateStr &&
        absence.endDate >= dateStr,
    );
    if (hasLongTermAbsence) {
      reasons.push("Langzeit-Abwesenheit genehmigt");
    }
    if (isLegacyInactiveOnDate(employee, dateStr)) {
      reasons.push("Langzeit-Deaktivierung (Legacy)");
    }
    return reasons;
  };

  const isPublished = planStatus === "Freigegeben";

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const startDate = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const endDate = format(endOfMonth(currentDate), "yyyy-MM-dd");

      const [empData, plannedAbsenceData, shiftData] = await Promise.all([
        employeeApi.getAll(),
        plannedAbsencesAdminApi.getRange({ from: startDate, to: endDate }),
        fetchRosterShifts(shouldUseDraftData ? true : undefined),
      ]);
      const planSummary = await dutyPlansApi.getByMonth(year, month);
      let plan = planSummary;
      if (planSummary?.id) {
        plan = await dutyPlansApi.getById(planSummary.id);
      }
      let serviceLineData: ServiceLine[] = [];
      try {
        serviceLineData = await serviceLinesApi.getAll(
          getServiceLineContextFromEmployee(currentUser),
        );
      } catch {
        serviceLineData = [];
      }

      let longTermAbsenceData: LongTermAbsence[] = [];
      try {
        longTermAbsenceData = await longTermAbsencesApi.getByStatus(
          "Genehmigt",
          startDate,
          endDate,
        );
      } catch {
        longTermAbsenceData = [];
      }

      setEmployees(empData);
      setServiceLines(serviceLineData);
      setShifts(Array.isArray(shiftData) ? shiftData : []);
      setAbsences(plannedAbsenceData);
      setLongTermAbsences(longTermAbsenceData);
      setDutyPlan(plan ?? null);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Fehler beim Laden",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, fetchRosterShifts, shouldUseDraftData, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadPlanningMonth = async () => {
      try {
        const data = await rosterSettingsApi.getNextPlanningMonth();
        setPlanningMonth(data);
      } catch (error) {
        setPlanningMonth(null);
      }
    };
    loadPlanningMonth();
  }, []);

  useEffect(() => {
    if (planningMonth) {
      setWishMonth(planningMonth.month);
      setWishYear(planningMonth.year);
    }
  }, [planningMonth]);

  useEffect(() => {
    if (publishedPlanApplied) return;
    let active = true;
    const loadPublishedPlan = async () => {
      try {
        const plans = await dutyPlansApi.getAll();
        const published = plans
          .filter((plan) => plan.status === "Freigegeben")
          .sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.month - b.month;
          });
        const latest = published[published.length - 1];
        if (published.length && latest && active) {
          setCurrentDate(new Date(latest.year, latest.month - 1, 1));
        }
      } catch (error) {
        console.error("Failed to load published plans:", error);
      } finally {
        if (active) {
          setPublishedPlanApplied(true);
        }
      }
    };
    void loadPublishedPlan();
    return () => {
      active = false;
    };
  }, [publishedPlanApplied]);

  useEffect(() => {
    if (!manualEditMode) {
      setManualDrafts({});
      setActiveCellKey(null);
    }
  }, [manualEditMode]);

  useEffect(() => {
    setManualDrafts({});
    setActiveCellKey(null);
  }, [currentDate]);

  const clearManualDraft = useCallback((cellKey: string) => {
    setManualDrafts((prev) => {
      if (!prev[cellKey]) return prev;
      const next = { ...prev };
      delete next[cellKey];
      return next;
    });
  }, []);

  const getAbsences = (date: Date): RosterAbsenceEntry[] => {
    const dateStr = format(date, "yyyy-MM-dd");

    const plannedEntries: RosterAbsenceEntry[] = activePlannedAbsences
      .filter(
        (absence) => absence.startDate <= dateStr && absence.endDate >= dateStr,
      )
      .map(
        (absence): RosterAbsenceEntry => ({
          employeeId: absence.employeeId,
          name: resolveEmployeeLastName(
            absence.employeeId,
            absence.employeeName,
            absence.employeeLastName,
          ),
          reason: absence.reason,
          source: "planned",
          absenceId: absence.id,
          status: absence.status,
          notes: absence.notes ?? null,
        }),
      );

    const longTermEntries: RosterAbsenceEntry[] = showLongTermAbsences
      ? longTermAbsences
          .filter(
            (absence) =>
              absence.status === "Genehmigt" &&
              absence.startDate <= dateStr &&
              absence.endDate >= dateStr,
          )
          .map(
            (absence): RosterAbsenceEntry => ({
              employeeId: absence.employeeId,
              name: resolveEmployeeLastName(absence.employeeId),
              reason: absence.reason,
              source: "long_term",
            }),
          )
      : [];

    const legacyEntries: RosterAbsenceEntry[] = showLongTermAbsences
      ? employees
          .filter((employee) => isLegacyInactiveOnDate(employee, dateStr))
          .map(
            (employee): RosterAbsenceEntry => ({
              employeeId: employee.id,
              name: resolveEmployeeLastName(
                employee.id,
                employee.name,
                employee.lastName,
              ),
              reason: "Langzeit-Deaktivierung",
              source: "legacy",
            }),
          )
      : [];

    return [...plannedEntries, ...longTermEntries, ...legacyEntries].sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  };

  const renderAssignmentCell = (
    date: Date,
    line: {
      key: ServiceType;
      label: string;
      style: { cell: string };
    },
  ) => {
    const type = line.key;
    const shift = getShiftForDay(date, type);
    const employee = shift ? getEmployeeById(shift.employeeId) : null;
    const freeText = shift?.assigneeFreeText?.trim() || "";
    const dateStr = format(date, "yyyy-MM-dd");
    const conflictReasons = employee
      ? getConflictReasons(employee, dateStr, type)
      : [];
    const hasConflict = conflictReasons.length > 0;
    const cellKey = `${dateStr}-${type}`;
    const isSaving = savingCellKey === cellKey;

    if (!manualEditMode || !canEdit) {
      if (employee || freeText) {
        const label = employee
          ? isPublished
            ? employee.name.split(" ").pop()
            : employee.name
          : freeText;
        const slotInfo: SlotInspectorInfo = {
          slotId: formatSlotId(date, type),
          date: dateStr,
          roleId: type,
          employeeId: employee?.id ?? null,
          employeeName: employee?.name ?? (freeText || null),
        };
        return (
          <div
            className={`relative ${hasConflict ? "border border-red-300 bg-red-50/60" : ""} rounded cursor-pointer`}
            onClick={() => handleSlotInspectorOpen(slotInfo)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSlotInspectorOpen(slotInfo);
              }
            }}
          >
            <div
              className={`text-sm px-2 py-1.5 rounded font-medium text-center border shadow-sm ${
                employee
                  ? line.style.cell
                  : "bg-slate-100 text-slate-700 border-slate-200 italic"
              }`}
              title={employee ? employee.name : freeText}
            >
              <span className="block truncate">{label}</span>
            </div>
            {hasConflict && employee && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1">
                    <AlertTriangle className="w-3 h-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    {conflictReasons.map((reason) => (
                      <div key={reason}>{reason}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      }

      return (
        <div className="h-8 border border-dashed border-slate-200 rounded flex items-center justify-center text-xs text-slate-400">
          +
        </div>
      );
    }

    const allowedEmployees = employees
      .filter((emp) => emp.isActive !== false)
      .filter((emp) => emp.takesShifts !== false)
      .filter((emp) =>
        getServiceTypesForEmployee(emp, serviceLineMeta).includes(type),
      )
      .sort((a, b) =>
        (a.lastName || a.name).localeCompare(b.lastName || b.name),
      );
    const draftValue = manualDrafts[cellKey];
    const currentLabel = draftValue ?? employee?.name ?? freeText ?? "";
    const isActive = activeCellKey === cellKey;
    const normalizedInput = currentLabel.trim().toLowerCase();
    const suggestions = normalizedInput
      ? allowedEmployees.filter((emp) => {
          const last = (emp.lastName || "").toLowerCase();
          const full = emp.name.toLowerCase();
          return (
            last.includes(normalizedInput) || full.includes(normalizedInput)
          );
        })
      : allowedEmployees;

    return (
      <div className="relative">
        <Popover
          open={isActive && suggestions.length > 0}
          onOpenChange={(open) => {
            if (!open) {
              setActiveCellKey(null);
            }
          }}
        >
          <PopoverAnchor asChild>
            <Input
              value={currentLabel}
              onChange={(event) => {
                const nextValue = event.target.value;
                setManualDrafts((prev) => ({ ...prev, [cellKey]: nextValue }));
              }}
              onFocus={() => setActiveCellKey(cellKey)}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (!value) {
                  handleManualAssign(date, type, null, null);
                  setActiveCellKey(null);
                  return;
                }

                const normalized = value.toLowerCase();
                const blockedMatch = employees.find(
                  (emp) =>
                    emp.takesShifts === false &&
                    (emp.name.toLowerCase() === normalized ||
                      emp.lastName?.toLowerCase() === normalized),
                );
                if (blockedMatch) {
                  toast({
                    title: "Nicht einsetzbar",
                    description: `${blockedMatch.name} ist im Dienstplan deaktiviert.`,
                    variant: "destructive",
                  });
                  clearManualDraft(cellKey);
                  setActiveCellKey(null);
                  return;
                }
                const exactMatch = allowedEmployees.find(
                  (emp) =>
                    emp.name.toLowerCase() === normalized ||
                    emp.lastName?.toLowerCase() === normalized,
                );
                if (exactMatch) {
                  handleManualAssign(date, type, exactMatch.id, null);
                  setActiveCellKey(null);
                  return;
                }

                const matches = allowedEmployees.filter((emp) => {
                  const last = (emp.lastName || "").toLowerCase();
                  const full = emp.name.toLowerCase();
                  return (
                    last.startsWith(normalized) || full.startsWith(normalized)
                  );
                });

                if (matches.length === 1) {
                  handleManualAssign(date, type, matches[0].id, null);
                  setActiveCellKey(null);
                  return;
                }

                handleManualAssign(date, type, null, value);
                setActiveCellKey(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              placeholder="+"
              className={`h-8 text-xs w-full min-w-0 ${hasConflict ? "border-red-400" : ""}`}
              disabled={isSaving}
            />
          </PopoverAnchor>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={4}
            collisionPadding={8}
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="p-0 w-[var(--radix-popper-anchor-width)] max-h-[min(12rem,var(--radix-popper-available-height))] overflow-y-auto overflow-x-hidden"
          >
            {suggestions.map((emp) => (
              <button
                key={emp.id}
                type="button"
                className="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-slate-100"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleManualAssign(date, type, emp.id, null);
                  setActiveCellKey(null);
                }}
              >
                <span className="truncate">{emp.name}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {emp.role}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        {hasConflict && (
          <div className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1">
            <AlertTriangle className="w-3 h-3" />
          </div>
        )}
      </div>
    );
  };

  const stats = useMemo(() => {
    const serviceKeys = serviceLineDisplay.length
      ? serviceLineDisplay.map((line) => line.key)
      : ["gyn", "kreiszimmer", "turnus"];

    const base = employees
      .filter((employee) => employeeDoesShifts(employee, serviceLineMeta))
      .map((emp) => {
        const empShifts = shifts.filter((s) => s.employeeId === emp.id);
        const empAbsenceDays = dayStrings.filter((dateStr) => {
          const planned = activePlannedAbsences.some(
            (absence) =>
              absence.employeeId === emp.id &&
              absence.startDate <= dateStr &&
              absence.endDate >= dateStr,
          );
          if (planned) return true;
          const longTerm = longTermAbsences.some(
            (absence) =>
              absence.employeeId === emp.id &&
              absence.status === "Genehmigt" &&
              absence.startDate <= dateStr &&
              absence.endDate >= dateStr,
          );
          if (longTerm) return true;
          return isLegacyInactiveOnDate(emp, dateStr);
        }).length;
        const byService = serviceKeys.reduce<Record<string, number>>(
          (acc, key) => {
            acc[key] = empShifts.filter((s) => s.serviceType === key).length;
            return acc;
          },
          {},
        );
        return {
          ...emp,
          stats: {
            byService,
            sum: empShifts.length,
            abw: empAbsenceDays,
          },
        };
      });

    return base.sort((a, b) => {
      const roleRank = getRoleSortRank(a.role) - getRoleSortRank(b.role);
      if (roleRank !== 0) return roleRank;
      const lastNameA = (a.lastName || a.name || "").toLowerCase();
      const lastNameB = (b.lastName || b.name || "").toLowerCase();
      if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB);
      const firstNameA = (a.firstName || "").toLowerCase();
      const firstNameB = (b.firstName || "").toLowerCase();
      return firstNameA.localeCompare(firstNameB);
    });
  }, [
    employees,
    shifts,
    activePlannedAbsences,
    longTermAbsences,
    dayStrings,
    serviceLineDisplay,
    serviceLineMeta,
  ]);

  const statsRows = useMemo(() => {
    const rows: Array<
      { type: "separator" } | { type: "data"; emp: (typeof stats)[number] }
    > = [];
    let lastGroup: string | null = null;
    stats.forEach((emp) => {
      const group = getRoleGroup(emp.role);
      if (lastGroup && lastGroup !== group && group === "ass") {
        rows.push({ type: "separator" });
      }
      rows.push({ type: "data", emp });
      lastGroup = group;
    });
    return rows;
  }, [stats]);

  const statsColumnCount = 2 + serviceLineDisplay.length + 2;

  const handleExport = async () => {
    if (!token) {
      toast({
        title: "Nicht angemeldet",
        description:
          "Bitte melden Sie sich erneut an, um den Dienstplan zu exportieren.",
        variant: "destructive",
      });
      return;
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setExporting(true);
    try {
      const response = await fetch(
        `/api/roster/export?year=${year}&month=${month}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Export fehlgeschlagen");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dienstplan-${year}-${String(month).padStart(2, "0")}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Export fehlgeschlagen",
        description: error.message || "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
      } finally {
        setExporting(false);
      }
    };

  const buildGenerationPayload = (
    promptOverride?: string,
  ): GenerationPayload => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const specialRulesPayload = {
      ...specialRules,
      scope: { year, month },
    };
    const enhancedHardRules = `${aiRules.hard}\n\n# Sonderregeln (JSON)\n${JSON.stringify(
      specialRulesPayload,
      null,
      2,
    )}`;
    return {
      year,
      month,
      rules: {
        ...aiRules,
        hard: enhancedHardRules,
      },
      specialRules,
      promptOverride,
    };
  };

  const showGenerationError = (error: any) => {
    console.error("Generation failed:", error);
    toast({
      title: "Generierung fehlgeschlagen",
      description: error?.message || "Bitte später erneut versuchen",
      variant: "destructive",
    });
  };

  const executeGeneration = async (
    payload: GenerationPayload,
  ): Promise<boolean> => {
    const planningOutput: PlanningOutputV1 =
      await planningRestApi.runPlanningPreview(payload.year, payload.month, {
        specialRules: payload.specialRules,
      });
    const shifts = planningOutput.assignments
      .map((assignment): GeneratedShift | null => {
        const parsedEmployeeId = Number(assignment.employeeId);
        if (!Number.isFinite(parsedEmployeeId)) return null;
        const date = assignment.slotId.slice(0, 10);
        const serviceType = assignment.slotId.slice(11);
        if (!date || !serviceType) return null;
        const employee = employees.find((item) => item.id === parsedEmployeeId);
        return {
          date,
          serviceType,
          employeeId: parsedEmployeeId,
          employeeName: employee?.name ?? `ID ${parsedEmployeeId}`,
          assigneeFreeText: null,
        };
      })
      .filter((shift): shift is GeneratedShift => shift !== null);
    const warnings: string[] = [];
    if (!planningOutput.publishAllowed) {
      warnings.push(
        "Pflichtdienste sind noch unbesetzt. Veröffentlichen ist aktuell blockiert.",
      );
    }
    if (planningOutput.unfilledSlots.length > 0) {
      warnings.push(
        `${planningOutput.unfilledSlots.length} Slots sind unbesetzt (siehe Planning-Vorschau).`,
      );
    }

    setLatestGenerationMode("draft");
    setGeneratedShifts(shifts);
    setGenerationReasoning(
      `Engine ${planningOutput.meta.engine}: Pflichtabdeckung ${planningOutput.summary.coverage.filled}/${planningOutput.summary.coverage.required}, publishAllowed=${planningOutput.publishAllowed ? "ja" : "nein"}.`,
    );
    setGenerationWarnings(warnings);
    setGenerationUnfilledSlots(planningOutput.unfilledSlots);
    setGenerationViolations(planningOutput.violations);
    setGenerationPublishAllowed(planningOutput.publishAllowed);

    setRulesDialogOpen(false);
    setGenerationDialogOpen(true);

    toast({
      title: "Vorschau berechnet",
      description: `${shifts.length} Dienste aus dem Solver wurden vorbereitet`,
    });
    return true;
  };

  const requestPromptPreview = async (
    payload: GenerationPayload,
  ): Promise<boolean> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/roster/generate?preview=1`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 404) {
      setPromptPreviewSupported(false);
      return false;
    }

    if (!response.ok) {
      const text = (await response.text()).trim();
      throw new Error(text || "Preview fehlgeschlagen");
    }

    const previewData = await response.json().catch(() => ({}));
    const promptText =
      typeof previewData.prompt === "string" ? previewData.prompt : "";
    setPromptPreviewData({
      model: String(previewData.model ?? ""),
      maxOutputTokens: Number(previewData.maxOutputTokens) || 0,
      system: String(previewData.system ?? ""),
      prompt: promptText,
      promptCharCount: Number(previewData.promptCharCount) || 0,
      approxTokenHint: Number(previewData.approxTokenHint) || 0,
    });
    setPromptPreviewEdited(promptText);
    setPendingGenerationPayload(payload);
    setPromptPreviewOpen(true);
    return true;
  };

  const handlePromptPreviewGenerate = async () => {
    if (!pendingGenerationPayload || !promptPreviewData) return;
    const override =
      promptPreviewEdited !== promptPreviewData.prompt
        ? promptPreviewEdited
        : undefined;
    setPromptPreviewOpen(false);
    setPromptPreviewData(null);
    setPromptPreviewEdited("");
    setPendingGenerationPayload(null);
    setIsGenerating(true);
    toast({
      title: "Dienstplan-Generierung",
      description: "Dienstplan wird automatisch erstellt...",
    });
    try {
      await executeGeneration({
        ...pendingGenerationPayload,
        promptOverride: override,
      });
    } catch (error: any) {
      showGenerationError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePromptPreviewClose = () => {
    setPromptPreviewOpen(false);
    setPromptPreviewData(null);
    setPromptPreviewEdited("");
    setPendingGenerationPayload(null);
  };

  const copyPreviewText = (value: string, label: string) => {
    if (!value) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(value)
        .then(() =>
          toast({
            title: `${label} kopiert`,
            description: "In die Zwischenablage kopiert",
          }),
        )
        .catch(() => {});
    }
  };

  const handleAutoGenerate = async (): Promise<boolean> => {
    setIsGenerating(true);
    toast({
      title: "Dienstplan-Generierung",
      description: "Solver berechnet den Dienstplan...",
    });
    const payload = buildGenerationPayload();

    try {
      await executeGeneration(payload);
      return true;
    } catch (error: any) {
      showGenerationError(error);
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFromRules = async () => {
    await handleAutoGenerate(); // bleibt offen, schließt bei Erfolg in handleAutoGenerate
  };

  const eligibleSpecialRuleEmployees = useMemo(
    () =>
      employees.slice().sort((a, b) => a.name.localeCompare(b.name, "de")),
    [employees],
  );

  const specialRulesPreviewJson = useMemo(
    () =>
      JSON.stringify(
        {
          ...specialRules,
          scope: {
            year: currentDate.getFullYear(),
            month: currentDate.getMonth() + 1,
          },
        },
        null,
        2,
      ),
    [specialRules, currentDate],
  );

  const toggleSpecialRuleEmployee = (
    key: "fixedPreferredEmployeeIds" | "noDutyEmployeeIds",
    employeeId: number,
    checked: boolean,
  ) => {
    setSpecialRules((prev) => {
      const existing = new Set(prev[key]);
      if (checked) {
        existing.add(employeeId);
      } else {
        existing.delete(employeeId);
      }
      return {
        ...prev,
        [key]: Array.from(existing).sort((a, b) => a - b),
      };
    });
  };

  const handleApplyGenerated = async () => {
    setIsApplying(true);

    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      const result = await rosterApi.applyGenerated(
        year,
        month,
        generatedShifts,
        true,
        true,
      );

      if (result.success) {
        toast({
          title: "Dienstplan übernommen",
          description: result.message,
        });
        setGenerationDialogOpen(false);
        loadData();
      }
    } catch (error: any) {
      toast({
        title: "Übernahme fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleManualAssign = async (
    date: Date,
    type: ServiceType,
    nextEmployeeId?: number | null,
    assigneeFreeText?: string | null,
  ) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const shift = getShiftForDay(date, type);
    const cellKey = `${dateStr}-${type}`;
    setSavingCellKey(cellKey);
    try {
      if (!nextEmployeeId && !assigneeFreeText) {
        if (shift) {
          await rosterApi.delete(shift.id);
          setShifts((prev) => prev.filter((item) => item.id !== shift.id));
        }
        clearManualDraft(cellKey);
      } else {
        const employeeId = nextEmployeeId || null;
        const trimmedFreeText = assigneeFreeText?.trim() || null;
        const targetDraft = shouldUseDraftData;
        if (shift) {
          const updated = await rosterApi.update(shift.id, {
            employeeId,
            assigneeFreeText: employeeId ? null : trimmedFreeText,
            isDraft: targetDraft,
          }, { draft: targetDraft });
          setShifts((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          );
          clearManualDraft(cellKey);
        } else {
          const created = await rosterApi.create({
            employeeId,
            assigneeFreeText: employeeId ? null : trimmedFreeText,
            date: dateStr,
            serviceType: type,
            isDraft: targetDraft,
          }, { draft: targetDraft });
          setShifts((prev) => [...prev, created]);
          clearManualDraft(cellKey);
        }
      }
    } catch (error: any) {
      toast({
        title: "Speichern fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive",
      });
    } finally {
      setSavingCellKey(null);
    }
  };

  const handleUpdatePlanStatus = async (nextStatus: DutyPlan["status"]) => {
    if (!currentUser) return;
    setIsStatusUpdating(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      let existing = dutyPlan;
      if (!existing) {
        existing = await dutyPlansApi.getByMonth(year, month);
      }
      if (!existing) {
        try {
          existing = await dutyPlansApi.create({
            year,
            month,
            generatedById: currentUser.id,
          });
        } catch (error: any) {
          existing = await dutyPlansApi.getByMonth(year, month);
          if (!existing) {
            throw error;
          }
        }
      }
      const updated = await dutyPlansApi.updateStatus(
        existing.id,
        nextStatus,
        nextStatus === "Freigegeben" ? currentUser.id : null,
      );
      let detailed = updated;
      if (updated.id) {
        detailed = await dutyPlansApi.getById(updated.id);
      }
      setDutyPlan(detailed);
      toast({
        title: "Status aktualisiert",
        description: `Dienstplan ist jetzt ${PLAN_STATUS_LABELS[updated.status]}.`,
      });

      if (nextStatus === "Freigegeben") {
        // Important: Do NOT auto-call publish-to-roster here.
        // This page edits roster shifts directly; an auto "publish-to-roster" call can overwrite/wipe the month.
        await loadData();
      }
    } catch (error: any) {
      toast({
        title: "Status-Update fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive",
      });
    } finally {
      setIsStatusUpdating(false);
    }
  };

  const handleSetWishMonth = async () => {
    setWishSaving(true);
    try {
      await rosterSettingsApi.setWishMonth(wishYear, wishMonth);
      const updated = await rosterSettingsApi.getNextPlanningMonth();
      setPlanningMonth(updated);
      toast({
        title: "Dienstwünsche freigeschaltet",
        description: `Dienstwünsche sind jetzt für ${MONTH_NAMES[wishMonth - 1]} ${wishYear} geöffnet.`,
      });
      setWishDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Freischaltung fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive",
      });
    } finally {
      setWishSaving(false);
    }
  };

  const handleOpenAbsenceDialog = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setAbsenceDraft({
      employeeId: "",
      startDate: dateStr,
      endDate: dateStr,
      reason: ABSENCE_REASONS[0],
      notes: "",
    });
    setAbsenceDialogOpen(true);
  };

  const handleSaveAbsence = async () => {
    if (
      !absenceDraft.employeeId ||
      !absenceDraft.startDate ||
      !absenceDraft.endDate
    ) {
      toast({
        title: "Unvollständig",
        description: "Bitte Mitarbeiter und Zeitraum auswaehlen.",
        variant: "destructive",
      });
      return;
    }

    if (absenceDraft.startDate > absenceDraft.endDate) {
      toast({
        title: "Zeitraum ungueltig",
        description: "Das Enddatum muss nach dem Startdatum liegen.",
        variant: "destructive",
      });
      return;
    }

    setAbsenceSaving(true);
    try {
      const created = await plannedAbsencesAdminApi.create({
        employeeId: Number(absenceDraft.employeeId),
        startDate: absenceDraft.startDate,
        endDate: absenceDraft.endDate,
        reason: absenceDraft.reason,
        notes: absenceDraft.notes?.trim() || null,
        status: "Geplant",
      });

      let finalAbsence = created;
      if (canApproveVacation) {
        finalAbsence = await plannedAbsencesAdminApi.updateStatus(
          created.id,
          "Genehmigt",
          currentUser?.id,
        );
      }

      setAbsences((prev) => [...prev, finalAbsence]);
      setAbsenceDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Speichern fehlgeschlagen",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setAbsenceSaving(false);
    }
  };

  const handleAbsenceDelete = async (absenceId: number) => {
    try {
      await plannedAbsencesAdminApi.delete(absenceId);
      setAbsences((prev) => prev.filter((absence) => absence.id !== absenceId));
    } catch (error: any) {
      toast({
        title: "Loeschen fehlgeschlagen",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Layout title="Dienstplan">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dienstplan">
      <div className="space-y-6">
        {/* Controls Header */}
        <div className="bg-card p-4 rounded-xl kabeg-shadow space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="font-bold w-40 text-center text-lg">
                  {format(currentDate, "MMMM yyyy", { locale: de })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <Badge
                variant="outline"
                className={`gap-1 whitespace-nowrap ${
                  planStatus === "Freigegeben"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : planStatus === "Vorläufig"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                <Info className="w-3 h-3" />
                <span>Planungsstatus: {planStatusLabel}</span>
              </Badge>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleExport}
              disabled={exporting}
              data-testid="button-export-excel"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Export läuft..." : "Excel Export"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Checkbox
                id="toggle-longterm-absences"
                checked={showLongTermAbsences}
                onCheckedChange={(value) =>
                  setShowLongTermAbsences(Boolean(value))
                }
              />
              <Label
                htmlFor="toggle-longterm-absences"
                className="text-sm cursor-pointer"
              >
                Langzeit-Abwesenheiten anzeigen
              </Label>
            </div>
            {canEdit && (
              <Button
                variant={manualEditMode ? "default" : "outline"}
                className="gap-2"
                onClick={() => setManualEditMode((prev) => !prev)}
                data-testid="button-manual-edit"
              >
                <Pencil className="w-4 h-4" />
                {manualEditMode
                  ? "Manuelle Eingabe aktiv"
                  : "Manuell bearbeiten"}
              </Button>
            )}
            {canEdit && (
              <Button
                className="gap-2"
                onClick={() => setRulesDialogOpen(true)}
                disabled={isGenerating}
                data-testid="button-auto-generate"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Dienstplan generieren
              </Button>
            )}
            {canEdit && planStatus === "Entwurf" && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleUpdatePlanStatus("Vorläufig")}
                disabled={isStatusUpdating}
                data-testid="button-preview-roster"
              >
                {isStatusUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
                Vorschau
              </Button>
            )}
            {canEdit && planStatus === "Vorläufig" && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleUpdatePlanStatus("Entwurf")}
                disabled={isStatusUpdating}
                data-testid="button-back-to-draft"
              >
                {isStatusUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                Bearbeitung
              </Button>
            )}
            {canPublish && planStatus === "Freigegeben" && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleUpdatePlanStatus("Entwurf")}
                disabled={isStatusUpdating}
                data-testid="button-reopen-roster"
              >
                {isStatusUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                Bearbeitung
              </Button>
            )}
            {canPublish && (
              <Button
                variant={isPublished ? "outline" : "default"}
                className="gap-2"
                onClick={() => handleUpdatePlanStatus("Freigegeben")}
                disabled={
                  isPublished || planStatus !== "Vorläufig" || isStatusUpdating
                }
                data-testid="button-publish-roster"
              >
                {isStatusUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isPublished ? "Freigegeben" : "Freigeben"}
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setWishDialogOpen(true)}
                data-testid="button-release-wishes"
              >
                <Calendar className="w-4 h-4" />
                Dienstwünsche freigeben
              </Button>
            )}
          </div>
        </div>

        <Dialog open={wishDialogOpen} onOpenChange={setWishDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dienstwünsche freigeben</DialogTitle>
              <DialogDescription>
                Legt den Monat fest, für den Dienstwünsche eingegeben werden
                können.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {planningMonth && (
                <div className="text-sm text-muted-foreground">
                  Aktuell freigeschaltet: {MONTH_NAMES[planningMonth.month - 1]}{" "}
                  {planningMonth.year}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Monat</Label>
                  <Select
                    value={wishMonth.toString()}
                    onValueChange={(value) => setWishMonth(parseInt(value, 10))}
                    disabled={wishSaving}
                  >
                    <SelectTrigger data-testid="select-wish-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, index) => (
                        <SelectItem key={name} value={(index + 1).toString()}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jahr</Label>
                  <Select
                    value={wishYear.toString()}
                    onValueChange={(value) => setWishYear(parseInt(value, 10))}
                    disabled={wishSaving}
                  >
                    <SelectTrigger data-testid="select-wish-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setWishDialogOpen(false)}
                disabled={wishSaving}
              >
                Abbrechen
              </Button>
              <Button onClick={handleSetWishMonth} disabled={wishSaving}>
                {wishSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Freigeben
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit eintragen</DialogTitle>
              <DialogDescription>
                Tragen Sie Urlaub, Fortbildung oder andere Abwesenheiten ein.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mitarbeiter</Label>
                <Select
                  value={absenceDraft.employeeId}
                  onValueChange={(value) =>
                    setAbsenceDraft((prev) => ({ ...prev, employeeId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mitarbeiter waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {absenceEmployeeOptions.map((employee) => (
                      <SelectItem
                        key={employee.id}
                        value={employee.id.toString()}
                      >
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Von</Label>
                  <Input
                    type="date"
                    value={absenceDraft.startDate}
                    onChange={(event) =>
                      setAbsenceDraft((prev) => ({
                        ...prev,
                        startDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bis</Label>
                  <Input
                    type="date"
                    value={absenceDraft.endDate}
                    onChange={(event) =>
                      setAbsenceDraft((prev) => ({
                        ...prev,
                        endDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Grund</Label>
                <Select
                  value={absenceDraft.reason}
                  onValueChange={(value) =>
                    setAbsenceDraft((prev) => ({
                      ...prev,
                      reason: value as (typeof ABSENCE_REASONS)[number],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notiz (optional)</Label>
                <Textarea
                  value={absenceDraft.notes}
                  onChange={(event) =>
                    setAbsenceDraft((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAbsenceDialogOpen(false)}
                disabled={absenceSaving}
              >
                Abbrechen
              </Button>
              <Button onClick={handleSaveAbsence} disabled={absenceSaving}>
                {absenceSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main Roster Table */}
        <Card className="border-none kabeg-shadow overflow-hidden">
  {manualEditMode && canEdit && (
    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4" />
      Manuelle Eingabe aktiv. Konflikte werden markiert, Speicherung
      bleibt erlaubt.
    </div>
  )}
        <div className="overflow-x-auto overflow-y-visible">
          {!shifts.length && !isLoading && (
            <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border">
              Keine Schichten für{" "}
              {format(currentDate, "MMMM yyyy", { locale: de })}.
            </div>
          )}
          <Table className="border-collapse w-full min-w-[1400px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 text-center border-r border-border font-bold">
                    KW
                  </TableHead>
                  <TableHead className="w-12 text-center border-r border-border font-bold">
                    Tag
                  </TableHead>
                  <TableHead className="w-24 border-r border-border font-bold">
                    Datum
                  </TableHead>

                  {/* Service Columns */}
                  {serviceLineDisplay.map((line) => (
                    <TableHead
                      key={line.key}
                      className={`w-48 border-r border-border font-bold text-center ${line.style.header}`}
                    >
                      {line.label}
                    </TableHead>
                  ))}

                  {/* Absence Column */}
                  <TableHead className="min-w-[300px] bg-slate-50/50 font-bold text-center">
                    <button
                      type="button"
                      onClick={toggleAbsenceColumn}
                      aria-pressed={showAbsenceColumn}
                      title={
                        showAbsenceColumn
                          ? "Abwesenheitsspalte ausblenden"
                          : "Abwesenheitsspalte einblenden"
                      }
                      className="flex w-full flex-col items-center gap-1 px-1 py-2 text-xs font-semibold leading-tight text-slate-700 transition hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                    >
                      <span>Abwesenheiten / Info</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        {showAbsenceColumn ? "verstecken" : "anzeigen"}
                      </span>
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day) => {
                  const isWeekendDay = isWeekend(day);
                  const holiday = getAustrianHoliday(day);
                  const isHoliday = Boolean(holiday);

                  const dayAbsences = getAbsences(day);

                  return (
                    <TableRow
                      key={day.toISOString()}
                      className={`
                      ${isWeekendDay || isHoliday ? "bg-amber-50/60" : "bg-white"} 
                      hover:bg-slate-100/80 transition-colors border-b border-border/60
                    `}
                    >
                      <TableCell className="text-center text-xs text-muted-foreground border-r border-border">
                        {format(day, "w")}
                      </TableCell>
                      <TableCell
                        className={`text-center font-medium border-r border-border ${isWeekendDay || isHoliday ? "text-rose-600" : ""}`}
                      >
                        {format(day, "EEE", { locale: de })}.
                      </TableCell>
                      <TableCell
                        className={`border-r border-border ${isWeekendDay || isHoliday ? "text-rose-600 font-bold" : ""}`}
                      >
            {format(day, "dd.MM.")}
          </TableCell>

          {serviceLineDisplay.map((line) => (
            <TableCell
              key={line.key}
              className="border-r border-border p-1"
            >
              {renderAssignmentCell(day, line)}
            </TableCell>
          ))}

                      {/* Absences & Info */}
                      <TableCell
                        className={
                          showAbsenceColumn
                            ? "p-1 text-muted-foreground"
                            : "hidden"
                        }
                      >
                        {showAbsenceColumn && (
                          <div className="flex flex-wrap items-center gap-1">
                            {isHoliday && (
                              <Badge
                                variant="outline"
                                className="bg-red-50 text-red-600 border-red-200 mr-2"
                              >
                                {holiday?.name}
                              </Badge>
                            )}
                            {dayAbsences.map((absence) => {
                              const titleParts = [
                                absence.name,
                                absence.reason,
                                absence.status ? `(${absence.status})` : null,
                              ].filter(Boolean);
                              if (absence.notes) {
                                titleParts.push(absence.notes);
                              }
                              return (
                                <span
                                  key={`${absence.source}-${absence.employeeId}-${absence.absenceId ?? absence.reason}`}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                  title={titleParts.join(" · ")}
                                >
                                  <span className="truncate max-w-[120px]">
                                    {absence.name}
                                  </span>
                                  {canEdit &&
                                  absence.source === "planned" &&
                                  absence.absenceId ? (
                                    <button
                                      type="button"
                                      className="text-slate-400 hover:text-slate-700"
                                      onClick={() =>
                                        handleAbsenceDelete(absence.absenceId!)
                                      }
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  ) : null}
                                </span>
                              );
                            })}
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-500"
                                onClick={() => handleOpenAbsenceDialog(day)}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Statistics Summary */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              Dienststatistik Jänner 2026
            </CardTitle>
            <CardDescription>
              Übersicht der Dienste und Abwesenheiten pro Mitarbeiter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Mitarbeiter</TableHead>
                    <TableHead>Kürzel</TableHead>
                    {serviceLineDisplay.map((line) => (
                      <TableHead
                        key={line.key}
                        className={`text-center ${line.style.header}`}
                      >
                        {line.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-center font-bold">
                      Summe
                    </TableHead>
                    <TableHead className="text-center text-slate-500 bg-slate-50/50">
                      Abwesend
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsRows.map((row, index) => {
                    if (row.type === "separator") {
                      return (
                        <TableRow
                          key={`sep-${index}`}
                          className="bg-transparent"
                        >
                          <TableCell colSpan={statsColumnCount} className="p-0">
                            <div className="border-t border-slate-200" />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const emp = row.emp;
                    return (
                      <TableRow key={emp.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">
                          {emp.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {emp.name
                            .split(" ")
                            .pop()
                            ?.substring(0, 2)
                            .toUpperCase()}
                        </TableCell>
                        {serviceLineDisplay.map((line) => (
                          <TableCell
                            key={line.key}
                            className={`text-center ${line.style.stat}`}
                          >
                            {emp.stats.byService[line.key] ?? 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold">
                          {emp.stats.sum}
                        </TableCell>
                        <TableCell className="text-center text-slate-500 bg-slate-50/20">
                          {emp.stats.abw}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Regelwerk Dialog */}
        <Dialog
          open={rulesDialogOpen}
          onOpenChange={(open) => {
            if (isGenerating) return;
            setRulesDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                Regelwerk
              </DialogTitle>
              <DialogDescription>
                Legen Sie Vorgaben für die automatische Generierung fest. Harte
                Regeln dürfen nicht verletzt werden, weiche Regeln dienen als
                Optimierungsziele. Passen Sie die Gewichtung an, um Prioritäten
                zu verschieben.
              </DialogDescription>
            </DialogHeader>

            {isGenerating ? (
              <Alert className="bg-primary/5 border-primary/20">
                <Loader2 className="w-4 h-4 animate-spin" />
                <AlertDescription>
                  Dienstplan wird gerade generiert – bitte das Fenster nicht schließen.
                </AlertDescription>
              </Alert>
            ) : null}

            <Tabs defaultValue="hard" className="space-y-4">
              <TabsList>
                <TabsTrigger value="hard">Hard (MUSS)</TabsTrigger>
                <TabsTrigger value="soft">Soft (SOLL)</TabsTrigger>
                <TabsTrigger value="weights">Gewichte</TabsTrigger>
                <TabsTrigger value="special">Sonderregeln</TabsTrigger>
              </TabsList>
              <TabsContent value="hard">
                <Textarea
                  value={aiRules.hard}
                  onChange={(event) =>
                    setAiRules((prev) => ({ ...prev, hard: event.target.value }))
                  }
                  rows={10}
                  className="font-mono text-sm"
                />
              </TabsContent>
              <TabsContent value="soft">
                <Textarea
                  value={aiRules.soft}
                  onChange={(event) =>
                    setAiRules((prev) => ({ ...prev, soft: event.target.value }))
                  }
                  rows={10}
                  className="font-mono text-sm"
                />
              </TabsContent>
              <TabsContent value="weights">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs uppercase tracking-wide">
                      Wochenenden fair verteilen
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={aiRules.weights.weekendFairness}
                      onChange={(event) =>
                        setAiRules((prev) => ({
                          ...prev,
                          weights: {
                            ...prev.weights,
                            weekendFairness: clampWeight(
                              Number(event.target.value) || 0,
                            ),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs uppercase tracking-wide">
                      Wünsche erfüllen
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={aiRules.weights.preferenceSatisfaction}
                      onChange={(event) =>
                        setAiRules((prev) => ({
                          ...prev,
                          weights: {
                            ...prev.weights,
                            preferenceSatisfaction: clampWeight(
                              Number(event.target.value) || 0,
                            ),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs uppercase tracking-wide">
                      Konflikte minimieren
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={aiRules.weights.minimizeConflicts}
                      onChange={(event) =>
                        setAiRules((prev) => ({
                          ...prev,
                          weights: {
                            ...prev.weights,
                            minimizeConflicts: clampWeight(
                              Number(event.target.value) || 0,
                            ),
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Werte 0–10: Je höher, desto wichtiger für die Planung.
                </p>
              </TabsContent>
              <TabsContent value="special">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide">
                        Wünsche fix setzen
                      </Label>
                      <ScrollArea className="h-44 rounded border p-2">
                        <div className="space-y-2">
                          {eligibleSpecialRuleEmployees.map((employee) => (
                            <label
                              key={`fix-${employee.id}`}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={specialRules.fixedPreferredEmployeeIds.includes(
                                  employee.id,
                                )}
                                onCheckedChange={(value) =>
                                  toggleSpecialRuleEmployee(
                                    "fixedPreferredEmployeeIds",
                                    employee.id,
                                    Boolean(value),
                                  )
                                }
                              />
                              <span>{employee.name}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide">
                        Keine Dienste im Monat
                      </Label>
                      <ScrollArea className="h-44 rounded border p-2">
                        <div className="space-y-2">
                          {eligibleSpecialRuleEmployees.map((employee) => (
                            <label
                              key={`noduty-${employee.id}`}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={specialRules.noDutyEmployeeIds.includes(
                                  employee.id,
                                )}
                                onCheckedChange={(value) =>
                                  toggleSpecialRuleEmployee(
                                    "noDutyEmployeeIds",
                                    employee.id,
                                    Boolean(value),
                                  )
                                }
                              />
                              <span>{employee.name}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide">
                      JSON Vorschau
                    </Label>
                    <Textarea
                      value={specialRulesPreviewJson}
                      readOnly
                      rows={8}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  setAiRules(DEFAULT_AI_RULES);
                  setSpecialRules(DEFAULT_SPECIAL_RULES);
                }}
                disabled={isGenerating}
              >
                Reset
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRulesDialogOpen(false)}
                  disabled={isGenerating}
                >
                  Schließen
                </Button>
                <Button
                  onClick={handleGenerateFromRules}
                  disabled={isGenerating}
                  className="gap-2"
                  data-testid="button-generate-from-rules"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Generieren
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Prompt Preview Dialog */}
        <Dialog
          open={promptPreviewOpen}
          onOpenChange={(open) => !open && handlePromptPreviewClose()}
        >
          <DialogContent className="max-w-4xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Prompt-Vorschau</DialogTitle>
              <DialogDescription>
                Überprüfen oder passen Sie den Prompt für die Dienstplan-Generierung an.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {promptPreviewData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      Modell: <span className="font-semibold">{promptPreviewData.model}</span>
                      <br />
                      Tokens: <span className="font-semibold">{promptPreviewData.maxOutputTokens}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {promptPreviewData.promptCharCount} Zeichen · ca.{" "}
                      {promptPreviewData.approxTokenHint} Token
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Instructions</Label>
                    <div className="border rounded-md">
                      <ScrollArea className="h-32">
                        <pre className="p-3 text-xs whitespace-pre-wrap text-slate-900">
                          {promptPreviewData.system}
                        </pre>
                      </ScrollArea>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyPreviewText(promptPreviewData.system, "Anweisungen")}
                      >
                        Anweisungen kopieren
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Prompt</Label>
                    <Textarea
                      className="h-40 font-mono text-xs"
                      value={promptPreviewEdited}
                      onChange={(event) => setPromptPreviewEdited(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyPreviewText(promptPreviewEdited, "Prompt")}
                      >
                        Prompt kopieren
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Alert className="bg-primary/5 border-primary/20">
                  <AlertDescription>Vorschau wird geladen…</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter className="gap-2 mt-4">
              <Button
                variant="ghost"
                onClick={handlePromptPreviewClose}
                disabled={isGenerating}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handlePromptPreviewGenerate}
                disabled={isGenerating || !promptPreviewData}
                className="gap-2"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Jetzt generieren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI Generation Results Dialog */}
        <Dialog
          open={generationDialogOpen}
          onOpenChange={setGenerationDialogOpen}
        >
          <DialogContent className="max-w-5xl w-[95vw] max-h-[88vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                Generierter Dienstplan -{" "}
                {format(currentDate, "MMMM yyyy", { locale: de })}
              </DialogTitle>
              <DialogDescription>
                Überprüfen Sie den generierten Plan und übernehmen Sie ihn in
                den Dienstplan
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 min-h-0 flex-1 overflow-hidden">
              {/* Reasoning */}
              {generationReasoning && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Brain className="w-4 h-4" />
                  <AlertDescription>{generationReasoning}</AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {generationWarnings.length > 0 && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <AlertDescription>
                    <ul className="list-disc list-inside text-sm">
                      {generationWarnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue="plan" className="flex flex-col gap-3 min-h-0 flex-1 overflow-hidden">
                <TabsList className="w-fit">
                  <TabsTrigger value="plan">Plan</TabsTrigger>
                  <TabsTrigger value="errors">Fehleranzeige</TabsTrigger>
                </TabsList>

                <TabsContent value="plan" className="min-h-0">
                  <div className="border rounded-lg flex flex-col">
                    <div className="p-3 bg-muted/30 border-b flex justify-between items-center">
                      <span className="font-medium">Generierte Dienste</span>
                      <Badge variant="secondary">
                        {generatedShifts.length} Dienste
                      </Badge>
                    </div>
                    <ScrollArea className="h-[30vh]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Dienst</TableHead>
                            <TableHead>Mitarbeiter</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {generatedShifts.map((shift, i) => {
                            const line = serviceLineLookup.get(shift.serviceType);
                            const label = line?.label || shift.serviceType;
                            const badgeClass =
                              line?.style.cell ||
                              "bg-slate-100 text-slate-700 border-slate-200";
                            return (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-sm">
                                  {shift.date}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={badgeClass}>
                                    {label}
                                  </Badge>
                                </TableCell>
                                <TableCell>{shift.employeeName}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="errors" className="min-h-0">
                  <div className="border rounded-lg flex flex-col">
                    <div className="p-3 bg-muted/30 border-b flex items-center gap-3">
                      <Badge
                        variant={generationPublishAllowed ? "default" : "destructive"}
                      >
                        Publish {generationPublishAllowed ? "erlaubt" : "blockiert"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Unbesetzte Slots: {generationUnfilledSlots.length}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Violations: {generationViolations.length}
                      </span>
                    </div>

                    {generationUnfilledSlots.length === 0 &&
                    generationViolations.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        Keine Fehler gefunden.
                      </div>
                    ) : (
                      <ScrollArea className="h-[30vh]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum</TableHead>
                              <TableHead>Dienst</TableHead>
                              <TableHead>Grund</TableHead>
                              <TableHead>Blocker</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {generationUnfilledSlots.map((slot) => {
                              const line = serviceLineLookup.get(slot.serviceType);
                              const label = line?.label || slot.serviceType;
                              const reasonText = slot.reasonCodes
                                .map((code) => UNFILLED_REASON_LABELS[code] ?? code)
                                .join(", ");
                              const blockerText = slot.candidatesBlockedBy
                                .map((code) => UNFILLED_REASON_LABELS[code] ?? code)
                                .join(", ");
                              return (
                                <TableRow key={slot.slotId}>
                                  <TableCell className="font-mono text-sm">
                                    {slot.date}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{label}</Badge>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {reasonText || "-"}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {blockerText || "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {generationViolations.slice(0, 30).map((violation, idx) => (
                              <TableRow key={`v-${idx}`}>
                                <TableCell className="font-mono text-sm">
                                  {violation.slotId?.slice(0, 10) || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {violation.slotId?.slice(11) || violation.code}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">{violation.message}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {violation.employeeId ? `Mitarbeiter ${violation.employeeId}` : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="gap-2 shrink-0 border-t pt-3 bg-background relative z-20">
              <Button
                variant="outline"
                onClick={() => setGenerationDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleApplyGenerated}
                disabled={isApplying || generatedShifts.length === 0}
                className="gap-2"
                data-testid="button-apply-generated"
              >
                {isApplying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Plan übernehmen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <PlanningDrawer
        open={planningDrawerOpen}
        onOpenChange={setPlanningDrawerOpen}
        year={currentPlanningYear}
        month={currentPlanningMonth}
        employees={employees}
        input={planningInput}
        state={planningState}
        locks={planningLocks}
        loading={planningLoading}
        error={planningError}
        refresh={refreshPlanning}
        autoRunTrigger={planningAutoRunTrigger}
      />
      <PlanningInspector
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        year={currentPlanningYear}
        month={currentPlanningMonth}
        slot={inspectorSlot}
        employees={employees}
        locks={planningLocks}
        onRefresh={refreshPlanning}
      />
    </Layout>
  );
}
