import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachMonthOfInterval,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  endOfYear,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfDay,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";

import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  competencyApi,
  employeeApi,
  longTermAbsencesApi,
  meApi,
  plannedAbsencesAdminApi,
  rosterSettingsApi,
  vacationRulesApi,
  type PlannedAbsenceAdmin,
  type VacationRuleInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getAustrianHoliday } from "@/lib/holidays";
import {
  getSchoolHoliday,
  type SchoolHolidayLocation,
} from "@/lib/schoolHolidays";
import { cn } from "@/lib/utils";
import type {
  Competency,
  Employee,
  LongTermAbsence,
  RosterSettings,
  VacationRule,
} from "@shared/schema";

const STATUS_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "Geplant", label: "Geplant" },
  { value: "Genehmigt", label: "Genehmigt" },
  { value: "Abgelehnt", label: "Abgelehnt" },
] as const;

const ABSENCE_REASONS = [
  "Urlaub",
  "Fortbildung",
  "Krankenstand",
  "Zeitausgleich",
  "Pflegeurlaub",
  "Geb\u00fchrenurlaub",
  "Sonderurlaub",
  "Zusatzurlaub",
  "Quarant\u00e4ne",
  "Ruhezeit",
] as const;

const STATUS_STYLES: Record<string, string> = {
  Geplant: "bg-slate-50 text-slate-700 border-slate-200",
  Genehmigt: "bg-green-50 text-green-700 border-green-200",
  Abgelehnt: "bg-red-50 text-red-700 border-red-200",
};

const REASON_STYLES: Record<string, { bg: string; label: string }> = {
  Urlaub: { bg: "bg-emerald-200", label: "U" },
  Fortbildung: { bg: "bg-indigo-200", label: "F" },
  Karenz: { bg: "bg-violet-200", label: "K" },
  Krankenstand: { bg: "bg-red-200", label: "S" },
  Zeitausgleich: { bg: "bg-amber-200", label: "Z" },
  Pflegeurlaub: { bg: "bg-orange-200", label: "P" },
  Gebührenurlaub: { bg: "bg-lime-200", label: "G" },
  Sonderurlaub: { bg: "bg-teal-200", label: "S" },
  Zusatzurlaub: { bg: "bg-cyan-200", label: "Z" },
  Quarantäne: { bg: "bg-fuchsia-200", label: "Q" },
  Ruhezeit: { bg: "bg-slate-200", label: "R" },
};

const SUMMARY_REASON_KEYS = Object.keys(REASON_STYLES) as Array<
  keyof typeof REASON_STYLES
>;

type VacationVisibilityGroup = "OA" | "ASS" | "TA" | "SEK";

const DEFAULT_VISIBILITY_GROUPS: VacationVisibilityGroup[] = [
  "OA",
  "ASS",
  "TA",
  "SEK",
];

const VISIBILITY_GROUP_LABELS: Record<VacationVisibilityGroup, string> = {
  OA: "Oberaerzte & Fachaerzte",
  ASS: "Assistenz",
  TA: "Turnus & Studierende",
  SEK: "Sekretariat",
};

const LOCKED_DAY_OVERLAY_STYLE = {
  backgroundImage:
    "linear-gradient(135deg, transparent 0 34%, rgba(100,116,139,0.28) 34% 66%, transparent 66% 100%)",
} as const;

const ROLE_BUBBLE_STYLES: Record<
  "OA" | "ASS" | "TA",
  { chip: string; panel: string }
> = {
  OA: {
    chip: "border border-sky-200 bg-sky-50 text-sky-800",
    panel: "border border-sky-200 bg-sky-50 text-sky-900",
  },
  ASS: {
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-800",
    panel: "border border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  TA: {
    chip: "border border-amber-200 bg-amber-50 text-amber-800",
    panel: "border border-amber-200 bg-amber-50 text-amber-900",
  },
};

type CalendarViewMode = "year" | "month" | "week" | "day";

type ShiftPreferences = {
  vacationVisibilityRoleGroups?: VacationVisibilityGroup[];
};

type CalendarAbsence = {
  id: string;
  employeeId: number;
  startDate: string;
  endDate: string;
  reason: string;
  styleKey: keyof typeof REASON_STYLES;
  status?: PlannedAbsenceAdmin["status"] | "Genehmigt";
  notes?: string | null;
  createdAt?: string | null;
  source: "planned" | "long_term" | "legacy";
};

const ROLE_SORT_ORDER: Record<string, number> = {
  Primararzt: 1,
  "1. Oberarzt": 2,
  Funktionsoberarzt: 3,
  Ausbildungsoberarzt: 4,
  Oberarzt: 5,
  Oberaerztin: 5,
  Facharzt: 6,
  Assistenzarzt: 7,
  Assistenzaerztin: 7,
  Turnusarzt: 8,
  "Student (KPJ)": 9,
  "Student (Famulant)": 9,
  Sekretariat: 10,
};

const ROLE_GROUPS: Record<string, VacationVisibilityGroup | null> = {
  Primararzt: "OA",
  "1. Oberarzt": "OA",
  Funktionsoberarzt: "OA",
  Ausbildungsoberarzt: "OA",
  Oberarzt: "OA",
  Oberaerztin: "OA",
  Facharzt: "OA",
  Assistenzarzt: "ASS",
  Assistenzaerztin: "ASS",
  Turnusarzt: "TA",
  "Student (KPJ)": "TA",
  "Student (Famulant)": "TA",
  Sekretariat: "SEK",
};

type AbsenceDraft = {
  employeeId: number | null;
  reason: (typeof ABSENCE_REASONS)[number];
  startDate: string;
  endDate: string;
  notes: string;
};

const createEmptyAbsenceDraft = (employeeId: number | null): AbsenceDraft => ({
  employeeId,
  reason: "Urlaub",
  startDate: formatDateInput(new Date()),
  endDate: formatDateInput(new Date()),
  notes: "",
});

type VacationRuleDraft = {
  departmentId?: number;
  ruleType: VacationRuleInput["ruleType"];
  minCount?: number | null;
  roleGroup?: VacationRuleInput["roleGroup"];
  competencyId?: number;
  isActive?: boolean;
  notes?: string | null;
};

type ConflictEntry = {
  date: string;
  message: string;
  firstEntryBy?: string | null;
  firstEntryAt?: string | null;
};

const toDate = (value: string) => new Date(`${value}T00:00:00`);

const formatDateInput = (date: Date) => format(date, "yyyy-MM-dd");

const normalizeDateOnly = (value: string | Date | null | undefined) => {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateInput(parsed);
    }
    return null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return formatDateInput(value);
};

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return format(parsed, "dd.MM.yyyy HH:mm", { locale: de });
};

const resolveReasonStyleKey = (reason: string): keyof typeof REASON_STYLES => {
  if (reason in REASON_STYLES) {
    return reason as keyof typeof REASON_STYLES;
  }
  const normalized = reason.toLowerCase();
  if (normalized.includes("karenz") || normalized.includes("eltern"))
    return "Karenz";
  if (normalized.includes("fortbildung")) return "Fortbildung";
  if (normalized.includes("urlaub")) return "Urlaub";
  if (normalized.includes("krank")) return "Krankenstand";
  if (normalized.includes("zeit")) return "Zeitausgleich";
  return "Karenz";
};

const normalizeRole = (role?: string | null) => {
  if (!role) return "";
  const asciiRole = role
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00c4/g, "Ae")
    .replace(/\u00d6/g, "Oe")
    .replace(/\u00dc/g, "Ue");
  if (asciiRole === "Oberaerztin") return "Oberarzt";
  if (asciiRole === "Assistenzaerztin") return "Assistenzarzt";
  return asciiRole;
};

const getAdminAbsenceDisplayName = (absence: PlannedAbsenceAdmin) => {
  const lastName = (absence.employeeLastName ?? "").trim();
  const employeeName = (absence.employeeName ?? "").trim();
  if (!lastName && !employeeName) return "Unbekannt";
  if (!lastName) return employeeName;
  if (!employeeName) return lastName;

  const nameParts = employeeName.split(/\s+/).filter(Boolean);
  if (!nameParts.length) return lastName;

  const firstPart = nameParts[0]?.toLowerCase();
  const lastPart = nameParts[nameParts.length - 1]?.toLowerCase();
  const targetLast = lastName.toLowerCase();

  if (firstPart === targetLast) return employeeName;
  if (lastPart === targetLast) {
    const firstNames = nameParts.slice(0, -1).join(" ");
    return firstNames ? `${lastName} ${firstNames}` : lastName;
  }
  if (employeeName.toLowerCase() === targetLast) return lastName;

  return `${lastName} ${employeeName}`;
};

const getAdminAbsenceLastName = (absence: PlannedAbsenceAdmin) => {
  const lastName = (absence.employeeLastName ?? "").trim();
  if (lastName) return lastName;
  const employeeName = (absence.employeeName ?? "").trim();
  if (!employeeName) return "Unbekannt";
  const parts = employeeName.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || employeeName;
};

const getAbsenceRoleOverlapBucket = (role?: string | null) => {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case "Primararzt":
      return "Primarius";
    case "1. Oberarzt":
      return "Erster Oberarzt";
    case "Funktionsoberarzt":
      return "Funktionsoberarzt";
    case "Ausbildungsoberarzt":
      return "Ausbildungsoberarzt";
    case "Oberarzt":
    case "Facharzt":
      return "OA";
    case "Assistenzarzt":
      return "ASS";
    case "Turnusarzt":
    case "Student (KPJ)":
    case "Student (Famulant)":
      return "TA";
    default:
      return null;
  }
};

const getSeverityLevel = (share: number, group: "OA" | "ASS") => {
  if (share <= 0) return 0;
  if (group === "OA") {
    if (share <= 0.2) return 1;
    if (share <= 0.35) return 2;
    if (share <= 0.5) return 3;
    return 4;
  }
  if (share <= 0.25) return 1;
  if (share <= 0.4) return 2;
  if (share <= 0.55) return 3;
  return 4;
};

const getSeverityClasses = (level: number) => {
  if (level <= 0) {
    return {
      bgClass: "bg-white",
      borderClass: "border-slate-200",
    };
  }
  if (level === 1) {
    return {
      bgClass: "bg-emerald-50",
      borderClass: "border-emerald-200",
    };
  }
  if (level === 2) {
    return {
      bgClass: "bg-amber-50",
      borderClass: "border-amber-200",
    };
  }
  if (level === 3) {
    return {
      bgClass: "bg-orange-50",
      borderClass: "border-orange-200",
    };
  }
  return {
    bgClass: "bg-rose-50",
    borderClass: "border-rose-200",
  };
};

const getRoleBubbleClasses = (group: "OA" | "ASS" | "TA", variant: "chip" | "panel" = "chip") =>
  ROLE_BUBBLE_STYLES[group][variant];

export default function VacationPlanEditor({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { employee: currentUser, isAdmin, capabilities } = useAuth();
  const { toast } = useToast();
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [calendarView, setCalendarView] =
    useState<CalendarViewMode>("month");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [quarter, setQuarter] = useState(() =>
    Math.floor(new Date().getMonth() / 3),
  );
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
  const [showOnlySelf, setShowOnlySelf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [absences, setAbsences] = useState<PlannedAbsenceAdmin[]>([]);
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>(
    [],
  );
  const [rules, setRules] = useState<VacationRule[]>([]);
  const [rosterSettings, setRosterSettings] = useState<RosterSettings | null>(
    null,
  );
  const [vacationLockFrom, setVacationLockFrom] = useState<string | null>(null);
  const [vacationLockUntil, setVacationLockUntil] = useState<string | null>(
    null,
  );
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [savingLock, setSavingLock] = useState(false);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [holidayLocation, setHolidayLocation] = useState<SchoolHolidayLocation>(
    {
      country: "AT",
      state: "AT-2",
    },
  );
  const [selectedRoleGroups, setSelectedRoleGroups] = useState<
    VacationVisibilityGroup[]
  >([]);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<number[]>(
    [],
  );
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [employeeFilterQuery, setEmployeeFilterQuery] = useState("");
  const [absenceDraft, setAbsenceDraft] = useState<AbsenceDraft>(() =>
    createEmptyAbsenceDraft(currentUser?.id ?? null),
  );
  const [editingAbsence, setEditingAbsence] =
    useState<PlannedAbsenceAdmin | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<VacationRuleDraft>({
    departmentId: currentUser?.departmentId ?? undefined,
    ruleType: "role_min",
    minCount: 1,
    roleGroup: "OA",
    competencyId: undefined,
    isActive: true,
    notes: "",
  });
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const canEditRules = isAdmin || capabilities.includes("vacation.lock");
  const canApprove = isAdmin || capabilities.includes("vacation.approve");
  const canEditOthers = isAdmin || capabilities.includes("absence.create");
  const canViewRules = !embedded && (canEditRules || canApprove);
  const canOverrideLock = canApprove || canEditOthers;

  const quarterStart = useMemo(
    () => new Date(year, quarter * 3, 1),
    [year, quarter],
  );
  const quarterEnd = useMemo(
    () => endOfMonth(addMonths(quarterStart, 2)),
    [quarterStart],
  );

  useEffect(() => {
    setYear(focusDate.getFullYear());
    setQuarter(Math.floor(focusDate.getMonth() / 3));
  }, [focusDate]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: quarterStart,
        end: quarterEnd,
      }),
    [quarterStart, quarterEnd],
  );

  const monthSegments = useMemo(() => {
    return Array.from({ length: 3 }).map((_, idx) => {
      const start = addMonths(quarterStart, idx);
      return {
        label: format(start, "MMMM", { locale: de }),
        days: eachDayOfInterval({
          start: startOfMonth(start),
          end: endOfMonth(start),
        }),
      };
    });
  }, [quarterStart]);

  const monthViewStart = useMemo(() => startOfMonth(focusDate), [focusDate]);
  const monthViewEnd = useMemo(() => endOfMonth(focusDate), [focusDate]);
  const monthGridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(monthViewStart, { weekStartsOn: 1 }),
        end: endOfWeek(monthViewEnd, { weekStartsOn: 1 }),
      }),
    [monthViewEnd, monthViewStart],
  );
  const weekViewStart = useMemo(
    () => startOfWeek(focusDate, { weekStartsOn: 1 }),
    [focusDate],
  );
  const weekViewEnd = useMemo(
    () => endOfWeek(focusDate, { weekStartsOn: 1 }),
    [focusDate],
  );
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: weekViewStart,
        end: weekViewEnd,
      }),
    [weekViewEnd, weekViewStart],
  );

  const activePeriod = useMemo(() => {
    if (calendarView === "year") {
      return {
        start: startOfYear(focusDate),
        end: endOfYear(focusDate),
        label: "Jahr",
        dativeLabel: "dieses Jahr",
      };
    }
    if (calendarView === "month") {
      return {
        start: monthViewStart,
        end: monthViewEnd,
        label: "Monat",
        dativeLabel: "diesen Monat",
      };
    }
    if (calendarView === "week") {
      return {
        start: weekViewStart,
        end: weekViewEnd,
        label: "Woche",
        dativeLabel: "diese Woche",
      };
    }
    return {
      start: startOfDay(focusDate),
      end: endOfDay(focusDate),
      label: "Tag",
      dativeLabel: "diesen Tag",
    };
  }, [calendarView, focusDate, monthViewEnd, monthViewStart, weekViewEnd, weekViewStart]);
  const yearMonths = useMemo(
    () =>
      eachMonthOfInterval({
        start: startOfYear(focusDate),
        end: endOfYear(focusDate),
      }),
    [focusDate],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const yearStart = formatDateInput(new Date(year, 0, 1));
      const yearEnd = formatDateInput(new Date(year, 11, 31));
      const clinicPromise = meApi
        .get()
        .then((data) => data?.clinic ?? null)
        .catch(() => null);

      const [
        employeeData,
        competencyData,
        absenceData,
        ruleData,
        clinicData,
        longTermData,
        settingsData,
      ] = await Promise.all([
        employeeApi.getAll(),
        competencyApi.getAll(),
        plannedAbsencesAdminApi.getRange({ from: yearStart, to: yearEnd }),
        canViewRules
          ? vacationRulesApi.getAll(currentUser?.departmentId ?? undefined)
          : Promise.resolve([]),
        clinicPromise,
        longTermAbsencesApi.getByStatus("Genehmigt", yearStart, yearEnd),
        rosterSettingsApi.get(),
      ]);
      setEmployees(employeeData);
      setCompetencies(competencyData);
      setAbsences(absenceData);
      setLongTermAbsences(longTermData);
      setRules(ruleData);
      setRosterSettings(settingsData);
      setVacationLockFrom(normalizeDateOnly(settingsData.vacationLockFrom));
      setVacationLockUntil(normalizeDateOnly(settingsData.vacationLockUntil));
      if (clinicData) {
        setHolidayLocation({
          country: clinicData.country || "AT",
          state: clinicData.state || "AT-2",
        });
      }
    } catch (error: any) {
      toast({
        title: "Urlaubsplanung konnte nicht geladen werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [canViewRules, currentUser?.departmentId, toast, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setAbsenceDraft((prev) => ({
      ...prev,
      employeeId: prev.employeeId ?? currentUser?.id ?? null,
    }));
  }, [currentUser?.id]);

  const visibilityGroups = useMemo(() => {
    const prefs =
      (currentUser?.shiftPreferences as ShiftPreferences | null) || null;
    const groups = Array.isArray(prefs?.vacationVisibilityRoleGroups)
      ? prefs?.vacationVisibilityRoleGroups.filter(
          (group): group is VacationVisibilityGroup => Boolean(group),
        )
      : [];
    return groups.length ? groups : DEFAULT_VISIBILITY_GROUPS;
  }, [currentUser?.shiftPreferences]);

  useEffect(() => {
    setSelectedRoleGroups(visibilityGroups);
  }, [visibilityGroups]);

  const sortedEmployees = useMemo(() => {
    return employees
      .filter((emp) => emp.isActive !== false)
      .slice()
      .sort((a, b) => {
        const rankA = ROLE_SORT_ORDER[normalizeRole(a.role)] ?? 999;
        const rankB = ROLE_SORT_ORDER[normalizeRole(b.role)] ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        const lastA = (a.lastName || a.name || "").toLowerCase();
        const lastB = (b.lastName || b.name || "").toLowerCase();
        if (lastA !== lastB) return lastA.localeCompare(lastB);
        const firstA = (a.firstName || "").toLowerCase();
        const firstB = (b.firstName || "").toLowerCase();
        return firstA.localeCompare(firstB);
      });
  }, [employees]);

  const activeAbsences = useMemo(
    () => absences.filter((absence) => absence.status !== "Abgelehnt"),
    [absences],
  );

  const calendarAbsences = useMemo<CalendarAbsence[]>(() => {
    const entries: CalendarAbsence[] = activeAbsences.map((absence) => ({
      id: `planned-${absence.id}`,
      employeeId: absence.employeeId,
      startDate: absence.startDate,
      endDate: absence.endDate,
      reason: absence.reason,
      styleKey: resolveReasonStyleKey(absence.reason),
      status: absence.status,
      notes: absence.notes,
      createdAt: toIsoString(absence.createdAt),
      source: "planned",
    }));

    longTermAbsences
      .filter((absence) => absence.status === "Genehmigt")
      .forEach((absence) => {
        entries.push({
          id: `longterm-${absence.id}`,
          employeeId: absence.employeeId,
          startDate: absence.startDate,
          endDate: absence.endDate,
          reason: absence.reason,
          styleKey: resolveReasonStyleKey(absence.reason),
          status: "Genehmigt",
          notes: absence.approvalNotes,
          createdAt: toIsoString(absence.approvedAt ?? absence.createdAt),
          source: "long_term",
        });
      });

    employees.forEach((emp) => {
      const start = normalizeDateOnly(emp.inactiveFrom);
      const end = normalizeDateOnly(emp.inactiveUntil);
      if (!start || !end) return;
      const reasonValue = emp.inactiveReason?.trim() || "Karenz";
      entries.push({
        id: `legacy-${emp.id}`,
        employeeId: emp.id,
        startDate: start,
        endDate: end,
        reason: reasonValue,
        styleKey: resolveReasonStyleKey(reasonValue),
        status: "Genehmigt",
        createdAt: toIsoString(emp.updatedAt ?? emp.createdAt),
        source: "legacy",
      });
    });

    return entries;
  }, [activeAbsences, employees, longTermAbsences]);

  const competencyNameLookup = useMemo(() => {
    return new Map(competencies.map((comp) => [comp.id, comp.name]));
  }, [competencies]);

  const activeCompetencies = useMemo(() => {
    const used = new Set<string>();
    employees.forEach((emp) => {
      const values = Array.isArray(emp.competencies) ? emp.competencies : [];
      values.forEach((value) => used.add(value));
    });
    return competencies
      .filter((comp) => used.has(comp.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [competencies, employees]);

  const selectedCompetencyNames = useMemo(
    () =>
      selectedCompetencyIds
        .map((id) => competencyNameLookup.get(id))
        .filter((name): name is string => Boolean(name)),
    [competencyNameLookup, selectedCompetencyIds],
  );

  const employeeFilterCandidates = useMemo(() => {
    return sortedEmployees.filter((emp) => {
      const group = ROLE_GROUPS[normalizeRole(emp.role)] ?? null;
      return Boolean(group && visibilityGroups.includes(group));
    });
  }, [sortedEmployees, visibilityGroups]);

  const filteredEmployeeFilterCandidates = useMemo(() => {
    const query = employeeFilterQuery.trim().toLowerCase();
    if (!query) return employeeFilterCandidates;
    return employeeFilterCandidates.filter((emp) => {
      const name = [emp.lastName, emp.firstName, emp.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const role = (emp.role ?? "").toLowerCase();
      return name.includes(query) || role.includes(query);
    });
  }, [employeeFilterCandidates, employeeFilterQuery]);

  const visibleEmployees = useMemo(() => {
    const effectiveRoles = selectedRoleGroups.length
      ? selectedRoleGroups
      : visibilityGroups;
    return sortedEmployees.filter((emp) => {
      const group = ROLE_GROUPS[normalizeRole(emp.role)] ?? null;
      if (!group || !visibilityGroups.includes(group)) return false;
      if (effectiveRoles.length && !effectiveRoles.includes(group))
        return false;
      if (!selectedCompetencyNames.length) return true;
      const empCompetencies = Array.isArray(emp.competencies)
        ? emp.competencies
        : [];
      const competencyMatch = selectedCompetencyNames.some((name) =>
        empCompetencies.includes(name),
      );
      if (!competencyMatch) return false;
      return true;
    });
  }, [
    selectedCompetencyNames,
    selectedRoleGroups,
    sortedEmployees,
    visibilityGroups,
  ]);

  const visibleEmployeesWithSelectedPeople = useMemo(() => {
    if (!selectedEmployeeIds.length) return visibleEmployees;
    const selected = new Set(selectedEmployeeIds);
    return visibleEmployees.filter((emp) => selected.has(emp.id));
  }, [selectedEmployeeIds, visibleEmployees]);

  const displayEmployees = useMemo(() => {
    if (!embedded || !showOnlySelf) return visibleEmployeesWithSelectedPeople;
    if (!currentUser) return [];
    return visibleEmployeesWithSelectedPeople.filter((emp) => emp.id === currentUser.id);
  }, [currentUser, embedded, showOnlySelf, visibleEmployeesWithSelectedPeople]);

  const visibleEmployeeIds = useMemo(
    () => new Set(visibleEmployeesWithSelectedPeople.map((emp) => emp.id)),
    [visibleEmployeesWithSelectedPeople],
  );

  const visibleCalendarAbsences = useMemo(
    () =>
      calendarAbsences.filter((absence) =>
        visibleEmployeeIds.has(absence.employeeId),
      ),
    [calendarAbsences, visibleEmployeeIds],
  );

  const calendarAbsencesByEmployee = useMemo(() => {
    const map = new Map<number, CalendarAbsence[]>();
    visibleCalendarAbsences.forEach((absence) => {
      const list = map.get(absence.employeeId) ?? [];
      list.push(absence);
      map.set(absence.employeeId, list);
    });
    return map;
  }, [visibleCalendarAbsences]);

  const getAbsenceForEmployeeOnDate = (employeeId: number, dateStr: string) => {
    const list = calendarAbsencesByEmployee.get(employeeId) ?? [];
    return (
      list.find(
        (absence) => absence.startDate <= dateStr && absence.endDate >= dateStr,
      ) ?? null
    );
  };

  const dayAbsenceMapAll = useMemo(() => {
    const map = new Map<string, CalendarAbsence[]>();
    days.forEach((date) => {
      const key = formatDateInput(date);
      const list = calendarAbsences.filter(
        (absence) => absence.startDate <= key && absence.endDate >= key,
      );
      map.set(key, list);
    });
    return map;
  }, [calendarAbsences, days]);

  const dayAbsenceMap = useMemo(() => {
    const map = new Map<string, CalendarAbsence[]>();
    days.forEach((date) => {
      const key = formatDateInput(date);
      const list = visibleCalendarAbsences.filter(
        (absence) => absence.startDate <= key && absence.endDate >= key,
      );
      map.set(key, list);
    });
    return map;
  }, [days, visibleCalendarAbsences]);

  const yearDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfYear(new Date(year, 0, 1)),
        end: endOfYear(new Date(year, 0, 1)),
      }),
    [year],
  );

  const yearDayAbsenceMap = useMemo(() => {
    const map = new Map<string, CalendarAbsence[]>();
    yearDays.forEach((date) => {
      const key = formatDateInput(date);
      const list = visibleCalendarAbsences.filter(
        (absence) => absence.startDate <= key && absence.endDate >= key,
      );
      map.set(key, list);
    });
    return map;
  }, [visibleCalendarAbsences, yearDays]);

  const employeeRoleGroupById = useMemo(() => {
    return new Map(
      employees.map((emp) => [
        emp.id,
        ROLE_GROUPS[normalizeRole(emp.role)] ?? null,
      ]),
    );
  }, [employees]);

  const employeeNameById = useMemo(() => {
    return new Map(
      employees.map((emp) => [
        emp.id,
        [emp.lastName, emp.firstName].filter(Boolean).join(" ").trim() ||
          emp.name ||
          "Unbekannt",
      ]),
    );
  }, [employees]);

  const employeeById = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees],
  );

  const planningPool = useMemo(() => {
    const pool = {
      OA: 0,
      ASS: 0,
    };
    visibleEmployeesWithSelectedPeople.forEach((emp) => {
      if (emp.takesShifts === false) return;
      const role = normalizeRole(emp.role);
      const group = ROLE_GROUPS[role] ?? null;
      if (group === "OA") pool.OA += 1;
      if (group === "ASS") pool.ASS += 1;
    });
    return pool;
  }, [visibleEmployeesWithSelectedPeople]);

  const getDayAbsences = useCallback(
    (date: Date) => yearDayAbsenceMap.get(formatDateInput(date)) ?? [],
    [yearDayAbsenceMap],
  );

  const getAbsenceBreakdown = useCallback(
    (entries: CalendarAbsence[]) =>
      entries.reduce(
        (acc, absence) => {
          const group = employeeRoleGroupById.get(absence.employeeId);
          if (group === "OA") acc.OA += 1;
          if (group === "ASS") acc.ASS += 1;
          if (group === "TA") acc.TA += 1;
          return acc;
        },
        { OA: 0, ASS: 0, TA: 0 },
      ),
    [employeeRoleGroupById],
  );

  const handleExportAbsences = () => {
    if (!activeAbsences.length) {
      toast({
        title: "Keine Abwesenheiten",
        description: "Keine aktiven Abwesenheiten zum Exportieren.",
      });
      return;
    }

    const rows = activeAbsences.map((absence) => {
      const name = employeeNameById.get(absence.employeeId) ?? "Unbekannt";
      const notes = (absence.notes ?? "")
        .replace(/[\r\n]+/g, " ")
        .replace(/;/g, ",");
      const status = absence.status ?? "";
      return `${name};${absence.startDate};${absence.endDate};${absence.reason};${status};${notes}`;
    });

    const csvContent = ["Mitarbeiter;Von;Bis;Grund;Status;Notiz", ...rows].join(
      "\r\n",
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `urlaubsplan-${formatDateInput(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const conflicts = useMemo(() => {
    const conflictList: ConflictEntry[] = [];
    const activeRules = rules.filter((rule) => rule.isActive !== false);
    if (!activeRules.length) return conflictList;

    const competencyLookup = new Map(
      competencies.map((comp) => [comp.id, comp.name]),
    );

    days.forEach((date) => {
      const dateKey = formatDateInput(date);
      const dayAbsences = dayAbsenceMapAll.get(dateKey) ?? [];
      const firstEntry = dayAbsences
        .filter((absence) => absence.createdAt)
        .reduce<CalendarAbsence | null>((earliest, current) => {
          if (!current.createdAt) return earliest;
          const currentTime = new Date(current.createdAt).getTime();
          if (!Number.isFinite(currentTime)) return earliest;
          if (!earliest || !earliest.createdAt) return current;
          const earliestTime = new Date(earliest.createdAt).getTime();
          if (!Number.isFinite(earliestTime)) return current;
          return currentTime < earliestTime ? current : earliest;
        }, null);
      const firstEntryBy = firstEntry
        ? (employeeNameById.get(firstEntry.employeeId) ?? null)
        : null;
      const firstEntryAt = firstEntry?.createdAt ?? null;
      const absentIds = new Set(
        dayAbsences.map((absence) => absence.employeeId),
      );
      const presentEmployees = sortedEmployees.filter(
        (emp) => !absentIds.has(emp.id) && emp.takesShifts !== false,
      );

      const roleCounts: Record<string, number> = { OA: 0, ASS: 0, TA: 0 };
      presentEmployees.forEach((emp) => {
        const group = ROLE_GROUPS[normalizeRole(emp.role)] ?? null;
        if (group && Object.prototype.hasOwnProperty.call(roleCounts, group)) {
          roleCounts[group] += 1;
        }
      });

      activeRules.forEach((rule) => {
        if (rule.ruleType === "training_priority") {
          return;
        }

        if (rule.ruleType === "total_min") {
          if ((rule.minCount ?? 0) > presentEmployees.length) {
            conflictList.push({
              date: dateKey,
              message: `Gesamtbesetzung unter Mindestwert (${presentEmployees.length}/${rule.minCount})`,
              firstEntryBy,
              firstEntryAt,
            });
          }
          return;
        }

        if (rule.ruleType === "role_min" && rule.roleGroup) {
          const count = roleCounts[rule.roleGroup] ?? 0;
          if ((rule.minCount ?? 0) > count) {
            conflictList.push({
              date: dateKey,
              message: `${rule.roleGroup} unter Mindestwert (${count}/${rule.minCount})`,
              firstEntryBy,
              firstEntryAt,
            });
          }
          return;
        }

        if (rule.ruleType === "competency_min" && rule.competencyId) {
          const compName =
            competencyLookup.get(rule.competencyId) ||
            `Kompetenz ${rule.competencyId}`;
          const count = presentEmployees.filter((emp) =>
            Array.isArray(emp.competencies)
              ? emp.competencies.includes(compName)
              : false,
          ).length;
          if ((rule.minCount ?? 0) > count) {
            conflictList.push({
              date: dateKey,
              message: `${compName} unter Mindestwert (${count}/${rule.minCount})`,
              firstEntryBy,
              firstEntryAt,
            });
          }
        }
      });
    });

    return conflictList;
  }, [
    competencies,
    dayAbsenceMapAll,
    days,
    employeeNameById,
    rules,
    sortedEmployees,
  ]);

  const conflictDates = useMemo(
    () => new Set(conflicts.map((c) => c.date)),
    [conflicts],
  );

  const activePeriodAbsences = useMemo(() => {
    const start = formatDateInput(activePeriod.start);
    const end = formatDateInput(activePeriod.end);
    return absences.filter(
      (absence) =>
        absence.startDate <= end &&
        absence.endDate >= start &&
        visibleEmployeeIds.has(absence.employeeId),
    );
  }, [absences, activePeriod.end, activePeriod.start, visibleEmployeeIds]);

  const filteredAbsences = useMemo(() => {
    if (statusFilter === "all") return activePeriodAbsences;
    return activePeriodAbsences.filter((absence) => absence.status === statusFilter);
  }, [activePeriodAbsences, statusFilter]);

  const groupedAbsences = useMemo(() => {
    const groups: Record<
      "Geplant" | "Genehmigt" | "Abgelehnt",
      PlannedAbsenceAdmin[]
    > = {
      Geplant: [],
      Genehmigt: [],
      Abgelehnt: [],
    };
    filteredAbsences.forEach((absence) => {
      const status = absence.status as "Geplant" | "Genehmigt" | "Abgelehnt";
      if (groups[status]) {
        groups[status].push(absence);
      }
    });
    return groups;
  }, [filteredAbsences]);

  const overlapInfoByAbsenceId = useMemo(() => {
    const relevant = activePeriodAbsences.filter((absence) => absence.status !== "Abgelehnt");
    const roleByEmployeeId = new Map(
      employees.map((emp) => [emp.id, emp.role ?? null]),
    );
    const result = new Map<
      number,
      { bucketLabel: string; peers: Array<{ lastName: string; reason: string }> }
    >();

    relevant.forEach((absence) => {
      const ownRole = absence.employeeRole ?? roleByEmployeeId.get(absence.employeeId) ?? null;
      const bucketLabel = getAbsenceRoleOverlapBucket(ownRole);
      if (!bucketLabel) return;

      const peers = relevant
        .filter((other) => {
          if (other.id === absence.id) return false;
          if (other.employeeId === absence.employeeId) return false;
          const otherRole = other.employeeRole ?? roleByEmployeeId.get(other.employeeId) ?? null;
          if (getAbsenceRoleOverlapBucket(otherRole) !== bucketLabel) return false;
          return other.startDate <= absence.endDate && other.endDate >= absence.startDate;
        })
        .map((other) => ({
          lastName: getAdminAbsenceLastName(other),
          reason: other.reason,
        }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, "de"));

      result.set(absence.id, { bucketLabel, peers });
    });

    return result;
  }, [activePeriodAbsences, employees]);

  const countVacationDaysForEmployee = (employeeId: number) => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    return absences
      .filter(
        (absence) =>
          absence.employeeId === employeeId &&
          absence.reason === "Urlaub" &&
          absence.status !== "Abgelehnt",
      )
      .reduce((total, absence) => {
        const start = toDate(absence.startDate);
        const end = toDate(absence.endDate);
        const rangeStart = start < yearStart ? yearStart : start;
        const rangeEnd = end > yearEnd ? yearEnd : end;
        if (rangeEnd < rangeStart) return total;
        return total + differenceInCalendarDays(rangeEnd, rangeStart) + 1;
      }, 0);
  };

  const counts = useMemo(() => {
    return {
      total: activePeriodAbsences.length,
      geplant: activePeriodAbsences.filter((a) => a.status === "Geplant").length,
      genehmigt: activePeriodAbsences.filter((a) => a.status === "Genehmigt").length,
      abgelehnt: activePeriodAbsences.filter((a) => a.status === "Abgelehnt").length,
    };
  }, [activePeriodAbsences]);

  const sickCount = useMemo(
    () =>
      activePeriodAbsences.filter(
        (absence) =>
          absence.reason === "Krankenstand" && absence.status !== "Abgelehnt",
      ).length,
    [activePeriodAbsences],
  );

  const absenceSummary = useMemo(() => {
    const start = activePeriod.start;
    const end = activePeriod.end;
    const map = new Map<number, Record<string, number>>();
    visibleEmployeesWithSelectedPeople.forEach((emp) => {
      const entry: Record<string, number> = {};
      SUMMARY_REASON_KEYS.forEach((reason) => {
        entry[reason] = 0;
      });
      map.set(emp.id, entry);
    });

    visibleCalendarAbsences.forEach((absence) => {
      const startDate = toDate(absence.startDate);
      const endDate = toDate(absence.endDate);
      const overlapStart = startDate > start ? startDate : start;
      const overlapEnd = endDate < end ? endDate : end;
      if (overlapEnd < overlapStart) return;
      const days = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
      const entry = map.get(absence.employeeId);
      if (!entry) return;
      entry[absence.styleKey] = (entry[absence.styleKey] ?? 0) + days;
    });

    return visibleEmployeesWithSelectedPeople.map((emp) => ({
      employee: emp,
      counts: map.get(emp.id) ?? {},
    }));
  }, [
    activePeriod.end,
    activePeriod.start,
    visibleCalendarAbsences,
    visibleEmployeesWithSelectedPeople,
  ]);

  const getDayClass = (date: Date) => {
    const holiday = getAustrianHoliday(date);
    const schoolHoliday = getSchoolHoliday(date, holidayLocation);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if (holiday) return "bg-rose-50";
    if (schoolHoliday) return "bg-amber-50";
    if (isWeekend) return "bg-slate-50";
    return "";
  };

  const getDayInsetClass = (date: Date) => {
    const holiday = getAustrianHoliday(date);
    const schoolHoliday = getSchoolHoliday(date, holidayLocation);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if (holiday) return "border-rose-300";
    if (schoolHoliday) return "border-amber-300";
    if (isWeekend) return "border-slate-300";
    return "";
  };

  const getDayLabel = (date: Date) => {
    const holiday = getAustrianHoliday(date);
    const schoolHoliday = getSchoolHoliday(date, holidayLocation);
    if (holiday) return holiday.name;
    if (schoolHoliday) return schoolHoliday.name;
    return format(date, "EEEE", { locale: de });
  };

  const handlePrevPeriod = () => {
    setFocusDate((prev) => {
      if (calendarView === "year") return addYears(prev, -1);
      if (calendarView === "month") return addMonths(prev, -1);
      if (calendarView === "week") return addWeeks(prev, -1);
      return addDays(prev, -1);
    });
  };

  const handleNextPeriod = () => {
    setFocusDate((prev) => {
      if (calendarView === "year") return addYears(prev, 1);
      if (calendarView === "month") return addMonths(prev, 1);
      if (calendarView === "week") return addWeeks(prev, 1);
      return addDays(prev, 1);
    });
  };

  const toggleRoleFilter = (group: VacationVisibilityGroup) => {
    setSelectedRoleGroups((prev) =>
      prev.includes(group)
        ? prev.filter((item) => item !== group)
        : [...prev, group],
    );
  };

  const toggleCompetencyFilter = (competencyId: number) => {
    setSelectedCompetencyIds((prev) =>
      prev.includes(competencyId)
        ? prev.filter((item) => item !== competencyId)
        : [...prev, competencyId],
    );
  };

  const toggleEmployeeFilter = (employeeId: number) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((item) => item !== employeeId)
        : [...prev, employeeId],
    );
  };

  const resetFilters = () => {
    setSelectedRoleGroups(visibilityGroups);
    setSelectedCompetencyIds([]);
    setSelectedEmployeeIds([]);
    setEmployeeFilterQuery("");
  };

  const filterActive =
    selectedEmployeeIds.length > 0 ||
    selectedCompetencyIds.length > 0 ||
    (selectedRoleGroups.length > 0 &&
      selectedRoleGroups.length !== visibilityGroups.length);

  const hasVacationLock = Boolean(vacationLockFrom || vacationLockUntil);

  const isDateWithinLock = (dateValue: string) => {
    if (!hasVacationLock) return false;
    const date = toDate(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    const fromDate = vacationLockFrom ? toDate(vacationLockFrom) : null;
    const untilDate = vacationLockUntil ? toDate(vacationLockUntil) : null;
    if (fromDate && date < fromDate) return false;
    if (untilDate && date > untilDate) return false;
    return true;
  };

  const isRangeWithinLock = (start: string, end: string) => {
    if (!hasVacationLock) return false;
    const startDate = toDate(start);
    const endDate = toDate(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
      return false;
    const rangeStart = startDate < endDate ? startDate : endDate;
    const rangeEnd = startDate < endDate ? endDate : startDate;
    const lockStart = vacationLockFrom ? toDate(vacationLockFrom) : null;
    const lockEnd = vacationLockUntil ? toDate(vacationLockUntil) : null;
    if (lockStart && rangeEnd < lockStart) return false;
    if (lockEnd && rangeStart > lockEnd) return false;
    return true;
  };

  const openAbsenceDialog = (employeeId: number, date?: Date) => {
    setEditingAbsence(null);
    if (!date) {
      setAbsenceDraft((prev) => ({
        ...prev,
        employeeId,
      }));
    } else {
      const dateStr = formatDateInput(date);
      if (!canOverrideLock && isDateWithinLock(dateStr)) {
        toast({
          title: "Eintrag gesperrt",
          description: "Urlaube sind fuer diesen Zeitraum gesperrt.",
          variant: "destructive",
        });
        return;
      }
      setAbsenceDraft((prev) => ({
        ...prev,
        employeeId,
        startDate: dateStr,
        endDate: dateStr,
      }));
    }
    setAbsenceDialogOpen(true);
  };

  const openQuickAbsenceDialog = (date: Date) => {
    const defaultEmployeeId = currentUser?.id ?? absenceDraft.employeeId ?? null;
    if (!defaultEmployeeId) {
      toast({
        title: "Kein Mitarbeiter verfuegbar",
        description: "Bitte erneut anmelden oder einen Mitarbeiter auswaehlen.",
        variant: "destructive",
      });
      return;
    }
    openAbsenceDialog(defaultEmployeeId, date);
  };

  const openAbsenceEditDialog = (absence: PlannedAbsenceAdmin) => {
    setEditingAbsence(absence);
    setAbsenceDraft({
      employeeId: absence.employeeId,
      reason: absence.reason as (typeof ABSENCE_REASONS)[number],
      startDate: absence.startDate,
      endDate: absence.endDate,
      notes: absence.notes ?? "",
    });
    setAbsenceDialogOpen(true);
  };

  const closeAbsenceDialog = () => {
    setAbsenceDialogOpen(false);
    setEditingAbsence(null);
    setAbsenceDraft(createEmptyAbsenceDraft(currentUser?.id ?? null));
  };

  const handleAbsenceSave = async () => {
    if (!absenceDraft.employeeId) return;
    if (!absenceDraft.startDate || !absenceDraft.endDate) return;
    if (
      !canOverrideLock &&
      isRangeWithinLock(absenceDraft.startDate, absenceDraft.endDate)
    ) {
      toast({
        title: "Eintrag gesperrt",
        description: "Urlaube sind fuer diesen Zeitraum gesperrt.",
        variant: "destructive",
      });
      return;
    }
    setSavingAbsence(true);
    try {
      if (editingAbsence) {
        await plannedAbsencesAdminApi.update(editingAbsence.id, {
          startDate: absenceDraft.startDate,
          endDate: absenceDraft.endDate,
          reason: absenceDraft.reason,
          notes: absenceDraft.notes || null,
        });
      } else {
        await plannedAbsencesAdminApi.create({
          employeeId: absenceDraft.employeeId,
          startDate: absenceDraft.startDate,
          endDate: absenceDraft.endDate,
          reason: absenceDraft.reason,
          notes: absenceDraft.notes || null,
        });
      }
      toast({
        title: editingAbsence
          ? "Abwesenheit aktualisiert"
          : "Abwesenheit gespeichert",
        description: editingAbsence
          ? "Eintrag wurde aktualisiert."
          : "Eintrag wurde uebernommen.",
      });
      closeAbsenceDialog();
      await loadData();
    } catch (error: any) {
      toast({
        title: editingAbsence
          ? "Abwesenheit konnte nicht aktualisiert werden"
          : "Abwesenheit konnte nicht gespeichert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setSavingAbsence(false);
    }
  };

  const handleAbsenceDelete = async (absenceId: number) => {
    setUpdatingId(absenceId);
    try {
      await plannedAbsencesAdminApi.delete(absenceId);
      toast({
        title: "Abwesenheit geloescht",
        description: "Eintrag wurde entfernt.",
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Loeschen fehlgeschlagen",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusUpdate = async (
    absence: PlannedAbsenceAdmin,
    status: "Geplant" | "Genehmigt" | "Abgelehnt",
  ) => {
    setUpdatingId(absence.id);
    try {
      const updated = await plannedAbsencesAdminApi.updateStatus(
        absence.id,
        status,
        currentUser?.id,
      );
      setAbsences((prev) =>
        prev.map((item) =>
          item.id === absence.id ? { ...item, ...updated } : item,
        ),
      );
      toast({
        title: "Status aktualisiert",
        description: `Abwesenheit ist jetzt ${status}.`,
      });
    } catch (error: any) {
      toast({
        title: "Status konnte nicht geaendert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const vacationLockLabel = useMemo(() => {
    if (!hasVacationLock) return "Keine Eintragssperre aktiv";
    const fromLabel = vacationLockFrom
      ? format(toDate(vacationLockFrom), "dd.MM.yyyy")
      : "-";
    const untilLabel = vacationLockUntil
      ? format(toDate(vacationLockUntil), "dd.MM.yyyy")
      : "-";
    return `Eintraege fuer Benutzer gesperrt: ${fromLabel} - ${untilLabel}`;
  }, [hasVacationLock, vacationLockFrom, vacationLockUntil]);

  const selectedDraftEmployee = useMemo(
    () =>
      employees.find((emp) => emp.id === absenceDraft.employeeId) ??
      (currentUser && absenceDraft.employeeId === currentUser.id
        ? currentUser
        : null),
    [absenceDraft.employeeId, currentUser, employees],
  );

  const selectedDraftEmployeeName = useMemo(() => {
    if (!selectedDraftEmployee) return "Mitarbeiter waehlen";
    return (
      [selectedDraftEmployee.lastName, selectedDraftEmployee.firstName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      selectedDraftEmployee.name ||
      "Unbekannt"
    );
  }, [selectedDraftEmployee]);

  const selectedDraftRangeLocked = useMemo(() => {
    if (!absenceDraft.startDate || !absenceDraft.endDate) return false;
    return isRangeWithinLock(absenceDraft.startDate, absenceDraft.endDate);
  }, [absenceDraft.endDate, absenceDraft.startDate, vacationLockFrom, vacationLockUntil]);

  const selectedDraftOverlappingAbsences = useMemo(() => {
    if (!absenceDraft.startDate || !absenceDraft.endDate) return [];
    return visibleCalendarAbsences
      .filter((absence) => {
        if (absence.source !== "planned") return false;
        if (absence.status === "Abgelehnt") return false;
        if (editingAbsence && absence.id === `planned-${editingAbsence.id}`) return false;
        return (
          absence.startDate <= absenceDraft.endDate &&
          absence.endDate >= absenceDraft.startDate
        );
      })
      .slice()
      .sort((a, b) => {
        if (a.startDate !== b.startDate) {
          return a.startDate.localeCompare(b.startDate);
        }
        const rankA =
          ROLE_SORT_ORDER[normalizeRole(employeeById.get(a.employeeId)?.role)] ?? 999;
        const rankB =
          ROLE_SORT_ORDER[normalizeRole(employeeById.get(b.employeeId)?.role)] ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        const nameA = employeeNameById.get(a.employeeId) ?? "";
        const nameB = employeeNameById.get(b.employeeId) ?? "";
        return nameA.localeCompare(nameB, "de");
      });
  }, [
    absenceDraft.endDate,
    absenceDraft.startDate,
    editingAbsence,
    employeeById,
    employeeNameById,
    visibleCalendarAbsences,
  ]);

  const lockWindowLabel = useMemo(() => {
    if (!hasVacationLock) return null;
    const fromLabel = vacationLockFrom
      ? format(toDate(vacationLockFrom), "dd.MM.yyyy")
      : "offen";
    const untilLabel = vacationLockUntil
      ? format(toDate(vacationLockUntil), "dd.MM.yyyy")
      : "offen";
    return `${fromLabel} - ${untilLabel}`;
  }, [hasVacationLock, vacationLockFrom, vacationLockUntil]);

  const handleSaveVacationLock = async () => {
    if (!rosterSettings) return;
    setSavingLock(true);
    try {
      const updated = await rosterSettingsApi.update({
        lastApprovedYear: rosterSettings.lastApprovedYear,
        lastApprovedMonth: rosterSettings.lastApprovedMonth,
        updatedById: currentUser?.id,
        vacationLockFrom: vacationLockFrom ?? null,
        vacationLockUntil: vacationLockUntil ?? null,
      });
      setRosterSettings(updated);
      setVacationLockFrom(normalizeDateOnly(updated.vacationLockFrom));
      setVacationLockUntil(normalizeDateOnly(updated.vacationLockUntil));
      setLockDialogOpen(false);
      toast({
        title: "Eintragssperre aktualisiert",
        description: "Die Urlaubsplanung wurde aktualisiert.",
      });
    } catch (error: any) {
      toast({
        title: "Eintragssperre konnte nicht gespeichert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setSavingLock(false);
    }
  };

  const handleRuleSave = async () => {
    const departmentId = ruleDraft.departmentId ?? currentUser?.departmentId;
    if (!departmentId) {
      toast({
        title: "Regel konnte nicht gespeichert werden",
        description: "Keine Abteilung gefunden.",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload: VacationRuleInput = {
        departmentId,
        ruleType: ruleDraft.ruleType,
        minCount: ruleDraft.minCount ?? 0,
        roleGroup:
          ruleDraft.ruleType === "role_min"
            ? (ruleDraft.roleGroup ?? "OA")
            : null,
        competencyId:
          ruleDraft.ruleType === "competency_min"
            ? ruleDraft.competencyId
            : null,
        isActive: ruleDraft.isActive ?? true,
        notes: ruleDraft.notes ?? null,
      };
      const created = await vacationRulesApi.create(payload);
      setRules((prev) => [...prev, created]);
      setRuleDialogOpen(false);
      setRuleDraft((prev) => ({
        departmentId:
          prev.departmentId ?? currentUser?.departmentId ?? undefined,
        ruleType: "role_min",
        minCount: 1,
        roleGroup: "OA",
        competencyId: undefined,
        isActive: true,
        notes: "",
      }));
      toast({
        title: "Regel gespeichert",
        description: "Neue Regel wurde angelegt.",
      });
    } catch (error: any) {
      toast({
        title: "Regel konnte nicht gespeichert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    }
  };

  const selectedEmployeeLookup = useMemo(
    () => new Set(selectedEmployeeIds),
    [selectedEmployeeIds],
  );

  const selectedEmployeeNames = useMemo(() => {
    if (!selectedEmployeeIds.length) return [];
    return employeeFilterCandidates
      .filter((emp) => selectedEmployeeLookup.has(emp.id))
      .map((emp) =>
        [emp.lastName, emp.firstName].filter(Boolean).join(" ").trim() ||
        emp.name ||
        "Unbekannt",
      );
  }, [employeeFilterCandidates, selectedEmployeeIds, selectedEmployeeLookup]);

  const calendarPeriodLabel = useMemo(() => {
    if (calendarView === "year") {
      return format(focusDate, "yyyy");
    }
    if (calendarView === "month") {
      return format(focusDate, "MMMM yyyy", { locale: de });
    }
    if (calendarView === "week") {
      return `${format(weekViewStart, "dd.MM.", { locale: de })} - ${format(
        weekViewEnd,
        "dd.MM.yyyy",
        { locale: de },
      )}`;
    }
    return format(focusDate, "EEEE, dd.MM.yyyy", { locale: de });
  }, [calendarView, focusDate, weekViewEnd, weekViewStart]);

  const dayViewAbsences = useMemo(
    () =>
      getDayAbsences(focusDate)
        .slice()
        .sort((a, b) => {
          const rankA =
            ROLE_SORT_ORDER[
              normalizeRole(employees.find((emp) => emp.id === a.employeeId)?.role)
            ] ?? 999;
          const rankB =
            ROLE_SORT_ORDER[
              normalizeRole(employees.find((emp) => emp.id === b.employeeId)?.role)
            ] ?? 999;
          if (rankA !== rankB) return rankA - rankB;
          const nameA = employeeNameById.get(a.employeeId) ?? "";
          const nameB = employeeNameById.get(b.employeeId) ?? "";
          return nameA.localeCompare(nameB, "de");
        }),
    [employeeNameById, employees, focusDate, getDayAbsences],
  );

  const dayViewGroupedAbsences = useMemo(() => {
    const groups = new Map<string, CalendarAbsence[]>();
    dayViewAbsences.forEach((absence) => {
      const employee = employeeById.get(absence.employeeId);
      const role = normalizeRole(employee?.role);
      const key = role || "Sonstige";
      const list = groups.get(key) ?? [];
      list.push(absence);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const rankA = ROLE_SORT_ORDER[a[0]] ?? 999;
      const rankB = ROLE_SORT_ORDER[b[0]] ?? 999;
      return rankA - rankB;
    });
  }, [dayViewAbsences, employeeById]);

  const getHierarchicalAbsenceGroups = useCallback(
    (entries: CalendarAbsence[]) => {
      const groups = new Map<string, CalendarAbsence[]>();
      entries.forEach((absence) => {
        const role = normalizeRole(employeeById.get(absence.employeeId)?.role);
        const key = role || "Sonstige";
        const list = groups.get(key) ?? [];
        list.push(absence);
        groups.set(key, list);
      });

      return Array.from(groups.entries())
        .sort((a, b) => {
          const rankA = ROLE_SORT_ORDER[a[0]] ?? 999;
          const rankB = ROLE_SORT_ORDER[b[0]] ?? 999;
          return rankA - rankB;
        })
        .map(([role, items]) => [
          role,
          items.slice().sort((a, b) => {
            const nameA = employeeNameById.get(a.employeeId) ?? "";
            const nameB = employeeNameById.get(b.employeeId) ?? "";
            return nameA.localeCompare(nameB, "de");
          }),
        ] as const);
    },
    [employeeById, employeeNameById],
  );

  const getDayVisualState = useCallback(
    (date: Date) => {
      const entries = getDayAbsences(date);
      const breakdown = getAbsenceBreakdown(entries);
      const oaShare = planningPool.OA > 0 ? breakdown.OA / planningPool.OA : 0;
      const assShare =
        planningPool.ASS > 0 ? breakdown.ASS / planningPool.ASS : 0;
      const severity = Math.max(
        getSeverityLevel(oaShare, "OA"),
        getSeverityLevel(assShare, "ASS"),
      );
      const { bgClass, borderClass } = getSeverityClasses(severity);

      const primarAbsent = entries.some(
        (absence) =>
          normalizeRole(employeeById.get(absence.employeeId)?.role) ===
          "Primararzt",
      );
      const leadershipAbsent = entries.some((absence) => {
        const role = normalizeRole(employeeById.get(absence.employeeId)?.role);
        return (
          role === "1. Oberarzt" ||
          role === "Funktionsoberarzt" ||
          role === "Ausbildungsoberarzt"
        );
      });

      return {
        entries,
        breakdown,
        severity,
        bgClass,
        borderClass,
        primarAbsent,
        leadershipAbsent,
        specialRingClass: primarAbsent
          ? "ring-2 ring-violet-300"
          : leadershipAbsent
            ? "ring-2 ring-sky-300"
            : "",
      };
    },
    [employeeById, getAbsenceBreakdown, getDayAbsences, planningPool.ASS, planningPool.OA],
  );

  const renderDayTooltipContent = useCallback(
    (date: Date) => {
      const state = getDayVisualState(date);
      const tooltipEntries = state.entries.filter(
        (absence) => absence.source === "planned",
      );
      const tooltipBreakdown = getAbsenceBreakdown(tooltipEntries);
      const tooltipPrimarAbsent = tooltipEntries.some(
        (absence) =>
          normalizeRole(employeeById.get(absence.employeeId)?.role) ===
          "Primararzt",
      );
      const tooltipLeadershipAbsent = tooltipEntries.some((absence) => {
        const role = normalizeRole(employeeById.get(absence.employeeId)?.role);
        return (
          role === "1. Oberarzt" ||
          role === "Funktionsoberarzt" ||
          role === "Ausbildungsoberarzt"
        );
      });
      const groupedEntries = getHierarchicalAbsenceGroups(tooltipEntries);
      return (
        <div className="w-[280px] space-y-3 text-xs">
          <div>
            <div className="font-semibold text-slate-900">
              {format(date, "EEEE, dd.MM.yyyy", { locale: de })}
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              <span className={cn("rounded-full px-2 py-0.5", getRoleBubbleClasses("OA"))}>
                OA {tooltipBreakdown.OA}
              </span>
              <span className={cn("rounded-full px-2 py-0.5", getRoleBubbleClasses("ASS"))}>
                ASS {tooltipBreakdown.ASS}
              </span>
              <span className={cn("rounded-full px-2 py-0.5", getRoleBubbleClasses("TA"))}>
                TA {tooltipBreakdown.TA}
              </span>
              {tooltipPrimarAbsent && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">
                  Primar abwesend
                </span>
              )}
              {!tooltipPrimarAbsent && tooltipLeadershipAbsent && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
                  Leitungsfunktion abwesend
                </span>
              )}
            </div>
          </div>
          {groupedEntries.length === 0 ? (
            <div className="text-slate-500">Keine planbaren Abwesenheiten</div>
          ) : (
            groupedEntries.map(([role, entries]) => (
              <div key={`${formatDateInput(date)}-${role}`} className="space-y-1">
                <div className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {role}
                </div>
                <div className="space-y-1">
                  {entries.map((absence) => {
                    const style = REASON_STYLES[absence.styleKey];
                    return (
                      <div
                        key={absence.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                      >
                        <span className="text-slate-900">
                          {employeeNameById.get(absence.employeeId) ?? "Unbekannt"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-800",
                            style?.bg || "bg-slate-200",
                          )}
                        >
                          {absence.reason}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      );
    },
    [employeeById, employeeNameById, getAbsenceBreakdown, getDayVisualState, getHierarchicalAbsenceGroups],
  );

  const renderQuickAddButton = useCallback(
    (date: Date, iconClassName = "rounded-full") => {
      if (!currentUser) return null;
      const locked = hasVacationLock && !canOverrideLock && isDateWithinLock(formatDateInput(date));
      const trigger = (
        <span className="inline-flex">
          <button
            type="button"
            disabled={locked}
            onClick={(event) => {
              event.stopPropagation();
              openQuickAbsenceDialog(date);
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center border border-white/80 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white",
              iconClassName,
              locked && "cursor-not-allowed border-slate-200 bg-white/70 text-slate-400",
            )}
            aria-label={`Abwesenheit fuer ${format(date, "dd.MM.yyyy")} eintragen`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </span>
      );

      if (!locked) return trigger;

      return (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent className="max-w-[220px] bg-white text-foreground border border-border shadow-md">
            Bitte an den Ersten Oberarzt oder Primarius wenden.
          </TooltipContent>
        </Tooltip>
      );
    },
    [canOverrideLock, currentUser, hasVacationLock, openQuickAbsenceDialog],
  );

  const handleRuleToggle = async (rule: VacationRule, value: boolean) => {
    try {
      const updated = await vacationRulesApi.update(rule.id, {
        isActive: value,
      });
      setRules((prev) =>
        prev.map((item) =>
          item.id === rule.id ? { ...item, ...updated } : item,
        ),
      );
    } catch (error: any) {
      toast({
        title: "Regel konnte nicht aktualisiert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    }
  };

  const handleRuleDelete = async (ruleId: number) => {
    try {
      await vacationRulesApi.delete(ruleId);
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      toast({
        title: "Regel geloescht",
        description: "Regel wurde entfernt.",
      });
    } catch (error: any) {
      toast({
        title: "Regel konnte nicht geloescht werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive",
      });
    }
  };

  const quarterLabel = `${format(quarterStart, "MMMM", { locale: de })} - ${format(quarterEnd, "MMMM yyyy", { locale: de })}`;

  const content = (
    <div className="space-y-6">
      <Card className="border-none kabeg-shadow">
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Planungszeitraum
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl bg-white"
                      onClick={handlePrevPeriod}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div>
                      <div className="text-2xl font-semibold tracking-tight text-slate-900">
                        {calendarPeriodLabel}
                      </div>
                      <div className="text-sm text-slate-500">
                        {calendarView === "year"
                          ? "Jahresuebersicht mit verdichteten Engpaessen"
                          : calendarView === "month"
                            ? "Monatskalender fuer die operative Planung"
                            : calendarView === "week"
                              ? "Wochenfokus fuer die Teamabstimmung"
                              : "Tagesdetails fuer Freigabe und Bearbeitung"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl bg-white"
                      onClick={handleNextPeriod}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
                    <Label
                      htmlFor="vacation-year"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Jahr
                    </Label>
                    <Input
                      id="vacation-year"
                      type="number"
                      value={year}
                      onChange={(e) => {
                        const nextYear = Number(e.target.value);
                        if (!Number.isFinite(nextYear)) return;
                        setYear(nextYear);
                        setFocusDate(
                          new Date(nextYear, focusDate.getMonth(), focusDate.getDate()),
                        );
                      }}
                      className="h-10 rounded-xl border-slate-200 bg-white"
                    />
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Ansicht
                    </div>
                    <Tabs
                      value={calendarView}
                      onValueChange={(value) =>
                        setCalendarView(value as CalendarViewMode)
                      }
                    >
                      <TabsList className="grid h-10 w-full grid-cols-4 rounded-xl bg-slate-100">
                        <TabsTrigger value="year" className="rounded-lg px-2">
                          Jahr
                        </TabsTrigger>
                        <TabsTrigger value="month" className="rounded-lg px-2">
                          Monat
                        </TabsTrigger>
                        <TabsTrigger value="week" className="rounded-lg px-2">
                          Woche
                        </TabsTrigger>
                        <TabsTrigger value="day" className="rounded-lg px-2">
                          Tag
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Aktionen
                  </div>
                  <div className="text-sm text-slate-500">
                    Filter, Export und neue Eintraege
                  </div>
                </div>
                {filterActive && (
                  <Badge variant="secondary" className="rounded-full">
                    Filter aktiv
                  </Badge>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-11 justify-start gap-2 rounded-xl border-slate-300"
                    >
                      <Filter className="w-4 h-4" />
                      Filter
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">
                        Rollen
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                        {visibilityGroups.map((group) => (
                          <div key={group} className="flex items-center gap-2">
                            <Checkbox
                              id={`filter-role-${group}`}
                              checked={selectedRoleGroups.includes(group)}
                              onCheckedChange={() => toggleRoleFilter(group)}
                            />
                            <Label
                              htmlFor={`filter-role-${group}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {VISIBILITY_GROUP_LABELS[group]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
                          Mitarbeiter
                        </div>
                        {selectedEmployeeIds.length > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            {selectedEmployeeIds.length} gewaehlt
                          </span>
                        )}
                      </div>
                      <Input
                        value={employeeFilterQuery}
                        onChange={(e) => setEmployeeFilterQuery(e.target.value)}
                        placeholder="Mitarbeiter suchen..."
                        className="h-8"
                      />
                      <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                        {filteredEmployeeFilterCandidates.map((emp) => {
                          const label =
                            [emp.lastName, emp.firstName]
                              .filter(Boolean)
                              .join(" ")
                              .trim() || emp.name || "Unbekannt";
                          return (
                            <div
                              key={`filter-emp-${emp.id}`}
                              className="flex items-start gap-2"
                            >
                              <Checkbox
                                id={`filter-emp-${emp.id}`}
                                checked={selectedEmployeeIds.includes(emp.id)}
                                onCheckedChange={() => toggleEmployeeFilter(emp.id)}
                              />
                              <Label
                                htmlFor={`filter-emp-${emp.id}`}
                                className="text-sm font-normal cursor-pointer leading-tight"
                              >
                                <div>{label}</div>
                                {emp.role ? (
                                  <div className="text-[11px] text-muted-foreground">
                                    {emp.role}
                                  </div>
                                ) : null}
                              </Label>
                            </div>
                          );
                        })}
                        {!filteredEmployeeFilterCandidates.length && (
                          <p className="text-xs text-muted-foreground">
                            Keine passenden Mitarbeiter
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">
                        Kompetenzen
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                        {activeCompetencies.map((comp) => (
                          <div
                            key={comp.id}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={`filter-comp-${comp.id}`}
                              checked={selectedCompetencyIds.includes(comp.id)}
                              onCheckedChange={() =>
                                toggleCompetencyFilter(comp.id)
                              }
                            />
                            <Label
                              htmlFor={`filter-comp-${comp.id}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {comp.name}
                            </Label>
                          </div>
                        ))}
                        {!activeCompetencies.length && (
                          <p className="text-xs text-muted-foreground">
                            Keine Kompetenzen vorhanden
                          </p>
                        )}
                      </div>
                    </div>
                      <Button variant="ghost" size="sm" onClick={resetFilters}>
                        Zuruecksetzen
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  className="h-11 justify-start gap-2 rounded-xl border-slate-300"
                  onClick={handleExportAbsences}
                  disabled={activeAbsences.length === 0}
                >
                  <CalendarDays className="h-4 w-4" />
                  CSV exportieren
                </Button>
                {embedded && currentUser ? (
                  <div className="flex h-11 items-center gap-3 rounded-xl border border-slate-300 px-3 sm:col-span-2">
                    <Switch
                      id="vacation-only-self"
                      checked={showOnlySelf}
                      onCheckedChange={setShowOnlySelf}
                    />
                    <Label
                      htmlFor="vacation-only-self"
                      className="text-sm font-normal"
                    >
                      Nur meine Zeile
                    </Label>
                  </div>
                ) : (
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as any)}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-white sm:col-span-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Dialog
                  open={absenceDialogOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      setAbsenceDialogOpen(true);
                      return;
                    }
                    closeAbsenceDialog();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      className="h-11 justify-start gap-2 rounded-xl sm:col-span-2"
                      disabled={!currentUser}
                    >
                      <Plus className="w-4 h-4" />
                      Abwesenheit erfassen
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>
                      {editingAbsence
                        ? "Abwesenheit bearbeiten"
                        : "Abwesenheit eintragen"}
                    </DialogTitle>
                  </DialogHeader>
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Eintrag
                            </div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {selectedDraftEmployeeName}
                            </div>
                            <div className="text-sm text-slate-500">
                              {selectedDraftEmployee?.role || "Rolle wird nach Auswahl angezeigt"}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                            {editingAbsence ? "Bestehenden Eintrag bearbeiten" : "Neuen Eintrag erfassen"}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Mitarbeiter</Label>
                          {canEditOthers ? (
                            <Select
                              value={
                                absenceDraft.employeeId
                                  ? String(absenceDraft.employeeId)
                                  : ""
                              }
                              disabled={Boolean(editingAbsence)}
                              onValueChange={(value) =>
                                setAbsenceDraft((prev) => ({
                                  ...prev,
                                  employeeId: Number(value),
                                }))
                              }
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Mitarbeiter waehlen" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {visibleEmployees.map((emp) => (
                                  <SelectItem key={emp.id} value={String(emp.id)}>
                                    {emp.lastName} {emp.firstName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={`${currentUser?.lastName ?? ""} ${currentUser?.firstName ?? ""}`}
                              disabled
                              className="rounded-xl"
                            />
                          )}
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
                            <SelectTrigger className="rounded-xl">
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
                          {absenceDraft.reason === "Urlaub" && (
                            <p className="text-xs text-muted-foreground">
                              Urlaub wird gegen den Anspruch gerechnet. Fortbildung ist ausgenommen.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-slate-500" />
                          <div className="text-sm font-semibold text-slate-800">
                            Zeitraum
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Von</Label>
                            <Input
                              type="date"
                              className="rounded-xl"
                              value={absenceDraft.startDate}
                              onChange={(e) =>
                                setAbsenceDraft((prev) => ({
                                  ...prev,
                                  startDate: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Bis</Label>
                            <Input
                              type="date"
                              className="rounded-xl"
                              value={absenceDraft.endDate}
                              onChange={(e) =>
                                setAbsenceDraft((prev) => ({
                                  ...prev,
                                  endDate: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                        {hasVacationLock && (
                          <div
                            className={cn(
                              "mt-3 rounded-xl border px-3 py-2 text-sm",
                              selectedDraftRangeLocked && !canOverrideLock
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-slate-200 bg-slate-50 text-slate-600",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                              <div>
                                <div className="font-medium">
                                  {selectedDraftRangeLocked && !canOverrideLock
                                    ? "Selbststaendige Eintragung in diesem Zeitraum gesperrt"
                                    : "Aktive Eintragssperre vorhanden"}
                                </div>
                                {lockWindowLabel ? (
                                  <div className="text-xs">
                                    Sperrfenster: {lockWindowLabel}
                                  </div>
                                ) : null}
                                {selectedDraftRangeLocked && !canOverrideLock ? (
                                  <div className="mt-1 text-xs">
                                    Bitte an den Ersten Oberarzt oder Primarius wenden.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-800">
                              Bereits eingetragen im Zeitraum
                            </div>
                            <div className="text-xs text-slate-500">
                              Planbare Abwesenheiten im gewaehlten Zeitraum.
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                            {selectedDraftOverlappingAbsences.length} Eintraege
                          </div>
                        </div>
                        {selectedDraftOverlappingAbsences.length === 0 ? (
                          <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                            Keine bestehenden Abwesenheiten im gewaehlten Zeitraum.
                          </div>
                        ) : (
                          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                            {selectedDraftOverlappingAbsences.map((absence) => {
                              const style = REASON_STYLES[absence.styleKey];
                              const overlapStart =
                                absence.startDate > absenceDraft.startDate
                                  ? absence.startDate
                                  : absenceDraft.startDate;
                              const overlapEnd =
                                absence.endDate < absenceDraft.endDate
                                  ? absence.endDate
                                  : absenceDraft.endDate;
                              const employee = employeeById.get(absence.employeeId);
                              return (
                                <div
                                  key={`draft-overlap-${absence.id}`}
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="font-medium text-slate-900">
                                        {employeeNameById.get(absence.employeeId) ?? "Unbekannt"}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {employee?.role || "Ohne Rolle"} ·{" "}
                                        {format(toDate(overlapStart), "dd.MM.yyyy")} -{" "}
                                        {format(toDate(overlapEnd), "dd.MM.yyyy")}
                                      </div>
                                    </div>
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-800",
                                        style?.bg || "bg-slate-200",
                                      )}
                                    >
                                      {absence.reason}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Hinweise</Label>
                        <Textarea
                          value={absenceDraft.notes}
                          onChange={(e) =>
                            setAbsenceDraft((prev) => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                          }
                          placeholder="Optional"
                          className="min-h-24 rounded-xl"
                        />
                      </div>

                      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                        <Button variant="outline" onClick={closeAbsenceDialog}>
                          Abbrechen
                        </Button>
                        <Button
                          onClick={handleAbsenceSave}
                          disabled={savingAbsence || !absenceDraft.employeeId}
                        >
                          {savingAbsence && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          {editingAbsence ? "Aktualisieren" : "Speichern"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
          {(hasVacationLock || canEditRules) && (
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 shadow-sm",
                hasVacationLock
                  ? "border-amber-200 bg-[linear-gradient(135deg,#fff9eb_0%,#fffdf6_100%)]"
                  : "border-emerald-200 bg-[linear-gradient(135deg,#f3fff8_0%,#fcfffd_100%)]",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3 text-sm">
                  <div
                    className={cn(
                      "mt-0.5 rounded-full p-2",
                      hasVacationLock ? "bg-amber-100" : "bg-emerald-100",
                    )}
                  >
                    {hasVacationLock ? (
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Eintragssperre
                    </div>
                    <div className="font-medium text-slate-900">
                      {vacationLockLabel}
                    </div>
                    <div className="text-xs text-slate-500">
                      Schraffierte Kalendertage zeigen den Zeitraum, in dem Benutzer selbst keinen Urlaub mehr eintragen koennen.
                    </div>
                  </div>
                </div>
              {canEditRules && (
                <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Eintragssperre verwalten
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle>Eintragssperre festlegen</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Von</Label>
                        <Input
                          type="date"
                          value={vacationLockFrom ?? ""}
                          onChange={(e) =>
                            setVacationLockFrom(e.target.value || null)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Bis</Label>
                        <Input
                          type="date"
                          value={vacationLockUntil ?? ""}
                          onChange={(e) =>
                            setVacationLockUntil(e.target.value || null)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setVacationLockFrom(null);
                            setVacationLockUntil(null);
                          }}
                        >
                          Sperre aufheben
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setLockDialogOpen(false)}
                          >
                            Abbrechen
                          </Button>
                          <Button
                            onClick={handleSaveVacationLock}
                            disabled={savingLock}
                          >
                            {savingLock && (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            Speichern
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Eintraege
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {counts.total}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Geplant
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">
                {counts.geplant}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Genehmigt
              </div>
              <div className="mt-1 text-2xl font-semibold text-emerald-800">
                {counts.genehmigt}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                Abgelehnt
              </div>
              <div className="mt-1 text-2xl font-semibold text-rose-800">
                {counts.abgelehnt}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Aktive Filter
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                {selectedEmployeeIds.length > 0
                  ? `${selectedEmployeeIds.length} Mitarbeiter`
                  : filterActive
                    ? "Eingeschraenkt"
                    : "Keine"}
              </div>
            </div>
          </div>
          {selectedEmployeeNames.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedEmployeeNames.slice(0, 6).map((name) => (
                <Badge key={name} variant="outline" className="text-[11px] px-2 py-0">
                  {name}
                </Badge>
              ))}
              {selectedEmployeeNames.length > 6 && (
                <Badge variant="outline" className="text-[11px] px-2 py-0">
                  +{selectedEmployeeNames.length - 6} weitere
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none kabeg-shadow">
        <CardHeader>
          <CardTitle className="text-lg">Konflikte & Hinweise</CardTitle>
          <CardDescription>
            Konflikte werden markiert, Eintraege bleiben dennoch moeglich.
          </CardDescription>
        </CardHeader>
          <CardContent className="space-y-3">
          {conflicts.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Keine Konflikte fuer {activePeriod.dativeLabel}.
            </div>
          ) : (
            <div className="space-y-2">
              {conflicts.slice(0, 6).map((conflict, idx) => (
                <div
                  key={`${conflict.date}-${idx}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {format(toDate(conflict.date), "dd.MM.yyyy")}
                      </span>
                      <span className="text-muted-foreground">
                        {conflict.message}
                      </span>
                    </div>
                    {conflict.firstEntryBy && conflict.firstEntryAt && (
                      <div className="text-xs text-muted-foreground">
                        Erst eingetragen: {conflict.firstEntryBy} (
                        {format(
                          new Date(conflict.firstEntryAt),
                          "dd.MM.yyyy HH:mm",
                        )}
                        )
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {conflicts.length > 6 && (
                <div className="text-xs text-muted-foreground">
                  +{conflicts.length - 6} weitere Konflikte
                </div>
              )}
            </div>
          )}
          {sickCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle className="w-4 h-4" />
              Krankenstand aktiv: {sickCount}
            </div>
          )}
          {rules.some(
            (rule) =>
              rule.ruleType === "training_priority" && rule.isActive !== false,
          ) && (
            <div className="text-xs text-muted-foreground">
              Regel aktiv: Fortbildung hat Vorrang vor Urlaub.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none kabeg-shadow">
        <CardHeader>
          <CardTitle className="text-lg">Kalender</CardTitle>
          <CardDescription>
            Klassische Kalenderansicht mit umschaltbarem Detailgrad fuer Jahr, Monat, Woche und Tag.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Daten werden geladen...
            </div>
          ) : (
            <TooltipProvider delayDuration={120}>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Aktiver Zeitraum
                  </div>
                  <div className="text-sm font-medium text-slate-900">
                    {calendarPeriodLabel}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />
                    Normal
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-50" />
                    Feiertag / Ferien / Wochenende
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="relative inline-flex h-2.5 w-2.5 overflow-hidden rounded-sm border border-slate-300 bg-white">
                      <span className="absolute inset-0" style={LOCKED_DAY_OVERLAY_STYLE} />
                    </span>
                    Gesperrt
                  </span>
                </div>
              </div>

              {calendarView === "year" && (
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {yearMonths.map((monthDate) => {
                    const miniMonthDays = eachDayOfInterval({
                      start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
                      end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
                    });
                    return (
                      <div
                        key={format(monthDate, "yyyy-MM")}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <button
                            type="button"
                            className="text-left text-base font-semibold text-slate-900"
                            onClick={() => {
                              setFocusDate(monthDate);
                              setCalendarView("month");
                            }}
                          >
                            {format(monthDate, "MMMM", { locale: de })}
                          </button>
                          <span className="text-xs text-slate-500">
                            {format(monthDate, "yyyy")}
                          </span>
                        </div>
                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
                            <div key={label}>{label}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {miniMonthDays.map((date) => {
                            const dayState = getDayVisualState(date);
                            const breakdown = dayState.breakdown;
                            const inMonth = isSameMonth(date, monthDate);
                            const locked = isDateWithinLock(formatDateInput(date));
                            return (
                              <Tooltip key={formatDateInput(date)}>
                                <TooltipTrigger asChild>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      setFocusDate(date);
                                      setCalendarView("day");
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setFocusDate(date);
                                        setCalendarView("day");
                                      }
                                    }}
                                    className={cn(
                                      "relative min-h-[58px] rounded-xl border p-1 text-left transition-colors",
                                      inMonth
                                        ? cn(
                                            dayState.borderClass,
                                            dayState.bgClass,
                                            "hover:bg-slate-50",
                                          )
                                        : "border-transparent bg-slate-50/60 text-slate-300",
                                      isSameDay(date, focusDate) && "ring-2 ring-blue-200",
                                      isToday(date) && "border-blue-300",
                                      inMonth && dayState.specialRingClass,
                                    )}
                                  >
                                    {locked && inMonth && (
                                      <span
                                        className="pointer-events-none absolute inset-0 rounded-xl"
                                        style={LOCKED_DAY_OVERLAY_STYLE}
                                      />
                                    )}
                                    <div className="relative z-[1]">
                                      <div className="text-[11px] font-semibold">{format(date, "d")}</div>
                                      {inMonth && (
                                        <div className="mt-1 space-y-0.5 text-[9px] text-slate-600">
                                          {breakdown.OA > 0 && (
                                            <div
                                              className={cn(
                                                "inline-flex rounded-full px-1.5 py-0.5 font-medium",
                                                getRoleBubbleClasses("OA"),
                                              )}
                                            >
                                              OA {breakdown.OA}
                                            </div>
                                          )}
                                          {breakdown.ASS > 0 && (
                                            <div
                                              className={cn(
                                                "inline-flex rounded-full px-1.5 py-0.5 font-medium",
                                                getRoleBubbleClasses("ASS"),
                                              )}
                                            >
                                              ASS {breakdown.ASS}
                                            </div>
                                          )}
                                          {breakdown.TA > 0 && (
                                            <div
                                              className={cn(
                                                "inline-flex rounded-full px-1.5 py-0.5 font-medium",
                                                getRoleBubbleClasses("TA"),
                                              )}
                                            >
                                              TA {breakdown.TA}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {inMonth && (
                                      <div className="absolute bottom-1 right-1 z-[2]">
                                        {renderQuickAddButton(date, "rounded-lg")}
                                      </div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-white text-foreground border border-border shadow-md">
                                  {renderDayTooltipContent(date)}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {calendarView === "month" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].map((label) => (
                      <div key={label} className="truncate">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {monthGridDays.map((date) => {
                      const dayState = getDayVisualState(date);
                      const absencesForDay = dayState.entries;
                      const breakdown = dayState.breakdown;
                      const inMonth = isSameMonth(date, monthViewStart);
                      const locked = isDateWithinLock(formatDateInput(date));
                      return (
                        <Tooltip key={formatDateInput(date)}>
                          <TooltipTrigger asChild>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setFocusDate(date)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setFocusDate(date);
                                }
                              }}
                              className={cn(
                                "relative min-h-[132px] rounded-2xl border p-3 text-left transition-colors",
                                inMonth
                                  ? cn(
                                      dayState.borderClass,
                                      dayState.bgClass,
                                      "hover:bg-slate-50",
                                    )
                                  : "border-transparent bg-slate-50/60 text-slate-400",
                                isSameDay(date, focusDate) && "ring-2 ring-blue-200",
                                isToday(date) && "border-blue-300",
                                inMonth && dayState.specialRingClass,
                              )}
                            >
                              {locked && inMonth && (
                                <span
                                  className="pointer-events-none absolute inset-0 rounded-2xl"
                                  style={LOCKED_DAY_OVERLAY_STYLE}
                                />
                              )}
                              <div className="relative z-[1]">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-sm font-semibold">{format(date, "d")}</span>
                                  {(getAustrianHoliday(date) || getSchoolHoliday(date, holidayLocation)) && (
                                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-slate-500">
                                      Marker
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-1 text-[11px] text-slate-700">
                                  <div className="flex flex-col items-start gap-1">
                                    {breakdown.OA > 0 && (
                                      <span
                                        className={cn(
                                          "rounded-full px-1.5 py-0.5 font-medium",
                                          getRoleBubbleClasses("OA"),
                                        )}
                                      >
                                        OA {breakdown.OA}
                                      </span>
                                    )}
                                    {breakdown.ASS > 0 && (
                                      <span
                                        className={cn(
                                          "rounded-full px-1.5 py-0.5 font-medium",
                                          getRoleBubbleClasses("ASS"),
                                        )}
                                      >
                                        ASS {breakdown.ASS}
                                      </span>
                                    )}
                                    {breakdown.TA > 0 && (
                                      <span
                                        className={cn(
                                          "rounded-full px-1.5 py-0.5 font-medium",
                                          getRoleBubbleClasses("TA"),
                                        )}
                                      >
                                        TA {breakdown.TA}
                                      </span>
                                    )}
                                  </div>
                                  {absencesForDay.length > 0 && (
                                    <div className="pt-1 text-xs font-medium text-slate-500">
                                      {absencesForDay.length}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {inMonth && (
                                <div className="absolute bottom-2 right-2 z-[2]">
                                  {renderQuickAddButton(date)}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white text-foreground border border-border shadow-md">
                            {renderDayTooltipContent(date)}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              )}

              {calendarView === "week" && (
                <div className="grid gap-3 xl:grid-cols-7">
                  {weekDays.map((date) => {
                    const dayState = getDayVisualState(date);
                    const absencesForDay = dayState.entries;
                    const breakdown = dayState.breakdown;
                    const groupedAbsencesForDay =
                      getHierarchicalAbsenceGroups(absencesForDay);
                    const locked = isDateWithinLock(formatDateInput(date));
                    const totalAbsences = absencesForDay.length;
                    return (
                      <Tooltip key={formatDateInput(date)}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "relative rounded-2xl border p-4 shadow-sm",
                              dayState.borderClass,
                              dayState.bgClass,
                              isSameDay(date, focusDate) && "ring-2 ring-blue-200",
                              dayState.specialRingClass,
                            )}
                          >
                            {locked && (
                              <span
                                className="pointer-events-none absolute inset-0 rounded-2xl"
                                style={LOCKED_DAY_OVERLAY_STYLE}
                              />
                            )}
                            <div className="relative z-[1]">
                          <button
                            type="button"
                            className="mb-4 flex w-full items-start justify-between gap-3 text-left"
                            onClick={() => {
                              setFocusDate(date);
                              setCalendarView("day");
                            }}
                          >
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {format(date, "EEEE", { locale: de })}
                              </div>
                              <div className="mt-1 text-2xl font-semibold text-slate-900">
                                {format(date, "dd.MM.")}
                              </div>
                            </div>
                            <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                              {totalAbsences} abwesend
                            </div>
                          </button>

                          <div className="mb-4 grid grid-cols-3 gap-2 text-[11px]">
                            {[
                              { label: "OA", value: breakdown.OA, group: "OA" as const },
                              { label: "ASS", value: breakdown.ASS, group: "ASS" as const },
                              { label: "TA", value: breakdown.TA, group: "TA" as const },
                            ].map((item) => (
                              <div
                                key={`${formatDateInput(date)}-${item.label}`}
                                className={cn(
                                  "rounded-xl px-2 py-2 text-center",
                                  getRoleBubbleClasses(item.group, "panel"),
                                )}
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  {item.label}
                                </div>
                                <div className="mt-1 text-base font-semibold text-slate-900">
                                  {item.value}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                            {absencesForDay.length === 0 ? (
                              <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-400">
                                Keine Abwesenheiten
                              </div>
                            ) : (
                              groupedAbsencesForDay.map(([role, entries]) => (
                                <div key={`${formatDateInput(date)}-${role}`} className="space-y-2">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {role}
                                  </div>
                                  {entries.map((absence) => (
                                    <div
                                      key={absence.id}
                                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <div className="font-medium text-slate-900">
                                            {employeeNameById.get(absence.employeeId) ?? "Unbekannt"}
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {absence.reason}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))
                            )}
                          </div>
                              <div className="absolute bottom-3 right-3 z-[2]">
                                {renderQuickAddButton(date)}
                              </div>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-white text-foreground border border-border shadow-md">
                          {renderDayTooltipContent(date)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}

              {calendarView === "day" && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div
                    className={cn(
                      "relative rounded-2xl border p-4 shadow-sm",
                      getDayVisualState(focusDate).borderClass,
                      getDayVisualState(focusDate).bgClass,
                      getDayVisualState(focusDate).specialRingClass,
                    )}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Tagesstatus
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {format(focusDate, "EEEE, dd.MM.yyyy", { locale: de })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      {(() => {
                        const breakdown = getAbsenceBreakdown(dayViewAbsences);
                        return (
                          <>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 font-medium",
                                getRoleBubbleClasses("OA"),
                              )}
                            >
                              OA {breakdown.OA}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 font-medium",
                                getRoleBubbleClasses("ASS"),
                              )}
                            >
                              ASS {breakdown.ASS}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 font-medium",
                                getRoleBubbleClasses("TA"),
                              )}
                            >
                              TA {breakdown.TA}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                    {hasVacationLock && isDateWithinLock(formatDateInput(focusDate)) && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Dieser Tag liegt im gesperrten Selbstservice-Zeitraum.
                      </div>
                    )}
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div>Feiertag/Info: {getDayLabel(focusDate)}</div>
                      <div>Eintraege: {dayViewAbsences.length}</div>
                    </div>
                    <div className="absolute bottom-4 right-4">
                      {renderQuickAddButton(focusDate)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Abwesenheiten
                    </div>
                    <div className="space-y-4">
                      {dayViewGroupedAbsences.length === 0 ? (
                        <div className="text-sm text-slate-400">Keine Abwesenheiten fuer diesen Tag.</div>
                      ) : (
                        dayViewGroupedAbsences.map(([role, entries]) => (
                          <div key={role} className="rounded-2xl border border-slate-200 p-3">
                            <div className="mb-2 text-sm font-semibold text-slate-900">
                              {role}
                            </div>
                            <div className="space-y-2">
                              {entries.map((absence) => (
                                <div
                                  key={absence.id}
                                  className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                                >
                                  <div>
                                    <div className="font-medium text-slate-900">
                                      {employeeNameById.get(absence.employeeId) ?? "Unbekannt"}
                                    </div>
                                    <div className="text-slate-500">{absence.reason}</div>
                                  </div>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                                    {absence.status ?? "Genehmigt"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TooltipProvider>
          )}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {Object.entries(REASON_STYLES).map(([reason, style]) => (
              <div key={reason} className="flex items-center gap-1.5">
                <span
                  className={cn("inline-flex h-2.5 w-2.5 rounded-sm", style.bg)}
                />
                <span>{reason}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-2.5 w-2.5 rounded-sm bg-rose-50 border border-rose-200" />
              <span>Feiertag</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-2.5 w-2.5 rounded-sm bg-amber-50 border border-amber-200" />
              <span>Schulferien</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-2.5 w-2.5 rounded-sm bg-slate-50 border border-slate-200" />
              <span>Wochenende</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {!embedded && (
        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle className="text-lg">Antraege & Status</CardTitle>
            <CardDescription>
              Uebersicht fuer den gewaehlten {activePeriod.label.toLowerCase()} mit Statusverwaltung.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredAbsences.length === 0 ? (
              <div className="text-muted-foreground text-center py-6">
                Keine Eintraege fuer {activePeriod.dativeLabel}.
              </div>
            ) : (
              <div className="space-y-3">
                {(["Geplant", "Abgelehnt", "Genehmigt"] as const).map(
                  (status) => {
                    const items = groupedAbsences[status];
                    if (!items.length) return null;
                    const statusClass =
                      STATUS_STYLES[status] ?? STATUS_STYLES.Geplant;
                    const isOpenByDefault = status !== "Genehmigt";
                    return (
                      <details
                        key={status}
                        open={isOpenByDefault}
                        className="rounded-lg border border-border bg-white"
                      >
                        <summary className="flex items-center justify-between px-3 py-2 text-sm font-medium cursor-pointer list-none">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={statusClass}>
                              {status}
                            </Badge>
                            <span>
                              {items.length}{" "}
                              {items.length === 1 ? "Eintrag" : "Eintraege"}
                            </span>
                          </div>
                        </summary>
                        <div className="overflow-x-auto px-3 pb-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Mitarbeiter</TableHead>
                                <TableHead>Zeitraum</TableHead>
                                <TableHead>Grund</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Anmerkung</TableHead>
                                <TableHead className="text-right">
                                  Aktion
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((absence) => {
                                const displayName =
                                  getAdminAbsenceDisplayName(absence);
                                const rowStatusClass =
                                  STATUS_STYLES[absence.status] ??
                                  STATUS_STYLES.Geplant;
                                const overlapInfo =
                                  overlapInfoByAbsenceId.get(absence.id) ?? null;
                                const overlapPeers = overlapInfo?.peers ?? [];
                                const overlapPreview = overlapPeers.slice(0, 3);
                                const isRowLocked =
                                  !canOverrideLock &&
                                  isRangeWithinLock(
                                    absence.startDate,
                                    absence.endDate,
                                  );
                                const canEditRow =
                                  (canApprove ||
                                    canEditOthers ||
                                    absence.employeeId === currentUser?.id) &&
                                  !isRowLocked;
                                return (
                                  <TableRow key={absence.id}>
                                    <TableCell className="font-medium">
                                      {displayName || "Unbekannt"}
                                      {absence.employeeRole ? (
                                        <div className="text-xs text-muted-foreground">
                                          {absence.employeeRole}
                                        </div>
                                      ) : null}
                                    </TableCell>
                                    <TableCell>
                                      {format(
                                        toDate(absence.startDate),
                                        "dd.MM.yyyy",
                                        { locale: de },
                                      )}{" "}
                                      -{" "}
                                      {format(
                                        toDate(absence.endDate),
                                        "dd.MM.yyyy",
                                        { locale: de },
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline">
                                        {absence.reason}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={rowStatusClass}
                                      >
                                        {absence.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      <div className="space-y-1">
                                        <div>{absence.notes || "-"}</div>
                                        {overlapInfo && overlapPeers.length > 0 && (
                                          <div className="text-xs text-muted-foreground">
                                            <span className="font-medium">
                                              {overlapInfo.bucketLabel} parallel ({overlapPeers.length}):
                                            </span>{" "}
                                            {overlapPreview
                                              .map(
                                                (peer) =>
                                                  `${peer.lastName} - ${peer.reason}`,
                                              )
                                              .join(", ")}
                                            {overlapPeers.length >
                                              overlapPreview.length &&
                                              ` +${overlapPeers.length - overlapPreview.length} weitere`}
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2 flex-wrap">
                                        {canApprove && (
                                          <>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                handleStatusUpdate(
                                                  absence,
                                                  "Geplant",
                                                )
                                              }
                                              disabled={
                                                updatingId === absence.id ||
                                                absence.status === "Geplant"
                                              }
                                            >
                                              <RotateCcw className="w-4 h-4 mr-1" />
                                              Geplant
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                handleStatusUpdate(
                                                  absence,
                                                  "Genehmigt",
                                                )
                                              }
                                              disabled={
                                                updatingId === absence.id ||
                                                absence.status === "Genehmigt"
                                              }
                                            >
                                              <CheckCircle2 className="w-4 h-4 mr-1" />
                                              Genehmigen
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                handleStatusUpdate(
                                                  absence,
                                                  "Abgelehnt",
                                                )
                                              }
                                              disabled={
                                                updatingId === absence.id ||
                                                absence.status === "Abgelehnt"
                                              }
                                            >
                                              <XCircle className="w-4 h-4 mr-1" />
                                              Ablehnen
                                            </Button>
                                          </>
                                        )}
                                        {canEditRow && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              openAbsenceEditDialog(absence)
                                            }
                                            disabled={updatingId === absence.id}
                                          >
                                            <Pencil className="w-4 h-4 mr-1" />
                                            Bearbeiten
                                          </Button>
                                        )}
                                        {canEditRow && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              handleAbsenceDelete(absence.id)
                                            }
                                            disabled={updatingId === absence.id}
                                          >
                                            <Trash2 className="w-4 h-4 mr-1" />
                                            Loeschen
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    );
                  },
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!embedded && canApprove && (
        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle className="text-lg">
              Abwesenheiten nach Kategorie
            </CardTitle>
            <CardDescription>
              Tagesanzahl pro Mitarbeiter und Kategorie fuer den gewaehlten {activePeriod.label.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {absenceSummary.length === 0 ? (
              <div className="text-muted-foreground text-center py-6">
                Keine Daten fuer {activePeriod.dativeLabel}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mitarbeiter</TableHead>
                      {SUMMARY_REASON_KEYS.map((reason) => (
                        <TableHead key={reason} className="text-center">
                          {reason}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absenceSummary.map((entry) => (
                      <TableRow key={entry.employee.id}>
                        <TableCell className="font-medium">
                          {entry.employee.lastName} {entry.employee.firstName}
                        </TableCell>
                        {SUMMARY_REASON_KEYS.map((reason) => {
                          const count = entry.counts[reason] ?? 0;
                          return (
                            <TableCell
                              key={`${entry.employee.id}-${reason}`}
                              className="text-center"
                            >
                              {count > 0 ? count : "-"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canViewRules && (
        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle className="text-lg">Konfliktregeln</CardTitle>
            <CardDescription>
              Regeln fuer Mindestbesetzung und Prioritaeten. Nur
              Admins/Urlaubsfreigabe koennen Regeln bearbeiten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {rules.length} Regel(n) hinterlegt
              </span>
              <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={!canEditRules}>
                    <Plus className="w-4 h-4" />
                    Neue Regel
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Neue Regel</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Regeltyp</Label>
                      <Select
                        value={ruleDraft.ruleType}
                        onValueChange={(value) =>
                          setRuleDraft((prev) => ({
                            ...prev,
                            ruleType: value as VacationRuleInput["ruleType"],
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role_min">
                            Mindestbesetzung Rolle
                          </SelectItem>
                          <SelectItem value="competency_min">
                            Mindestbesetzung Kompetenz
                          </SelectItem>
                          <SelectItem value="total_min">
                            Mindestbesetzung Gesamt
                          </SelectItem>
                          <SelectItem value="training_priority">
                            Fortbildung vor Urlaub
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {ruleDraft.ruleType === "role_min" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Rollen-Gruppe</Label>
                          <Select
                            value={ruleDraft.roleGroup ?? "OA"}
                            onValueChange={(value) =>
                              setRuleDraft((prev) => ({
                                ...prev,
                                roleGroup:
                                  value as VacationRuleInput["roleGroup"],
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OA">OA</SelectItem>
                              <SelectItem value="ASS">ASS</SelectItem>
                              <SelectItem value="TA">TA</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Mindestanzahl</Label>
                          <Input
                            type="number"
                            min={0}
                            value={ruleDraft.minCount ?? 0}
                            onChange={(e) =>
                              setRuleDraft((prev) => ({
                                ...prev,
                                minCount: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}
                    {ruleDraft.ruleType === "competency_min" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Kompetenz</Label>
                          <Select
                            value={
                              ruleDraft.competencyId
                                ? String(ruleDraft.competencyId)
                                : ""
                            }
                            onValueChange={(value) =>
                              setRuleDraft((prev) => ({
                                ...prev,
                                competencyId: Number(value),
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Kompetenz waehlen" />
                            </SelectTrigger>
                            <SelectContent>
                              {competencies.map((comp) => (
                                <SelectItem
                                  key={comp.id}
                                  value={String(comp.id)}
                                >
                                  {comp.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Mindestanzahl</Label>
                          <Input
                            type="number"
                            min={0}
                            value={ruleDraft.minCount ?? 0}
                            onChange={(e) =>
                              setRuleDraft((prev) => ({
                                ...prev,
                                minCount: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}
                    {ruleDraft.ruleType === "total_min" && (
                      <div className="space-y-2">
                        <Label>Mindestanzahl gesamt</Label>
                        <Input
                          type="number"
                          min={0}
                          value={ruleDraft.minCount ?? 0}
                          onChange={(e) =>
                            setRuleDraft((prev) => ({
                              ...prev,
                              minCount: Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Notiz</Label>
                      <Textarea
                        value={ruleDraft.notes ?? ""}
                        onChange={(e) =>
                          setRuleDraft((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Regel aktiv
                      </div>
                      <Switch
                        checked={ruleDraft.isActive ?? true}
                        onCheckedChange={(checked) =>
                          setRuleDraft((prev) => ({
                            ...prev,
                            isActive: Boolean(checked),
                          }))
                        }
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setRuleDialogOpen(false)}
                      >
                        Abbrechen
                      </Button>
                      <Button onClick={handleRuleSave} disabled={!canEditRules}>
                        Speichern
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {rules.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Noch keine Regeln hinterlegt.
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => {
                  const competency = rule.competencyId
                    ? competencies.find((comp) => comp.id === rule.competencyId)
                        ?.name
                    : null;
                  const ruleLabel =
                    rule.ruleType === "role_min"
                      ? `Rolle ${rule.roleGroup} >= ${rule.minCount}`
                      : rule.ruleType === "competency_min"
                        ? `Kompetenz ${competency ?? ""} >= ${rule.minCount}`
                        : rule.ruleType === "total_min"
                          ? `Gesamt >= ${rule.minCount}`
                          : "Fortbildung vor Urlaub";
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <div className="font-medium">{ruleLabel}</div>
                        {rule.notes && (
                          <div className="text-xs text-muted-foreground">
                            {rule.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.isActive !== false}
                          onCheckedChange={(checked) =>
                            handleRuleToggle(rule, Boolean(checked))
                          }
                          disabled={!canEditRules}
                        />
                        {canEditRules && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRuleDelete(rule.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return <Layout title="Urlaubsplan-Editor">{content}</Layout>;
}
