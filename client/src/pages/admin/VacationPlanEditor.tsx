import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
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

const COMPACT_DAY_CELL_PX = 28;

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

export default function VacationPlanEditor({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { employee: currentUser, isAdmin, capabilities } = useAuth();
  const { toast } = useToast();
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
  const [absenceDraft, setAbsenceDraft] = useState<AbsenceDraft>({
    employeeId: currentUser?.id ?? null,
    reason: "Urlaub",
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
    notes: "",
  });
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
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyEmployeeHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const [visibleMonthLabel, setVisibleMonthLabel] = useState("");
  const [visibleMonthKey, setVisibleMonthKey] = useState("");

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

  const quarterAbsences = useMemo(() => {
    const start = formatDateInput(quarterStart);
    const end = formatDateInput(quarterEnd);
    return absences.filter(
      (absence) =>
        absence.startDate <= end &&
        absence.endDate >= start &&
        visibleEmployeeIds.has(absence.employeeId),
    );
  }, [absences, quarterStart, quarterEnd, visibleEmployeeIds]);

  const filteredAbsences = useMemo(() => {
    if (statusFilter === "all") return quarterAbsences;
    return quarterAbsences.filter((absence) => absence.status === statusFilter);
  }, [quarterAbsences, statusFilter]);

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
      total: quarterAbsences.length,
      geplant: quarterAbsences.filter((a) => a.status === "Geplant").length,
      genehmigt: quarterAbsences.filter((a) => a.status === "Genehmigt").length,
      abgelehnt: quarterAbsences.filter((a) => a.status === "Abgelehnt").length,
    };
  }, [quarterAbsences]);

  const sickCount = useMemo(
    () =>
      quarterAbsences.filter(
        (absence) =>
          absence.reason === "Krankenstand" && absence.status !== "Abgelehnt",
      ).length,
    [quarterAbsences],
  );

  const absenceSummary = useMemo(() => {
    const start = quarterStart;
    const end = quarterEnd;
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
    quarterEnd,
    quarterStart,
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

  const handlePrevQuarter = () => {
    setQuarter((prev) => {
      if (prev === 0) {
        setYear((yearValue) => yearValue - 1);
        return 3;
      }
      return prev - 1;
    });
  };

  const handleNextQuarter = () => {
    setQuarter((prev) => {
      if (prev === 3) {
        setYear((yearValue) => yearValue + 1);
        return 0;
      }
      return prev + 1;
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

  useEffect(() => {
    const container = gridScrollRef.current;
    if (!container || !days.length) return;

    const updateVisibleMonth = () => {
      const firstColWidth = stickyEmployeeHeaderRef.current?.offsetWidth ?? 220;
      const dayOffset = Math.max(0, container.scrollLeft - firstColWidth);
      const dayIndex = Math.max(
        0,
        Math.min(days.length - 1, Math.floor(dayOffset / COMPACT_DAY_CELL_PX)),
      );
      const activeDate = days[dayIndex] ?? days[0];
      setVisibleMonthLabel(format(activeDate, "MMMM yyyy", { locale: de }));
      setVisibleMonthKey(format(activeDate, "yyyy-MM"));
    };

    updateVisibleMonth();
    container.addEventListener("scroll", updateVisibleMonth, { passive: true });
    window.addEventListener("resize", updateVisibleMonth);
    return () => {
      container.removeEventListener("scroll", updateVisibleMonth);
      window.removeEventListener("resize", updateVisibleMonth);
    };
  }, [days]);

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
      await plannedAbsencesAdminApi.create({
        employeeId: absenceDraft.employeeId,
        startDate: absenceDraft.startDate,
        endDate: absenceDraft.endDate,
        reason: absenceDraft.reason,
        notes: absenceDraft.notes || null,
      });
      toast({
        title: "Abwesenheit gespeichert",
        description: "Eintrag wurde uebernommen.",
      });
      setAbsenceDialogOpen(false);
      setAbsenceDraft((prev) => ({
        ...prev,
        notes: "",
      }));
      await loadData();
    } catch (error: any) {
      toast({
        title: "Abwesenheit konnte nicht gespeichert werden",
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
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevQuarter}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Quartal</span>
                <span className="font-semibold">{quarterLabel}</span>
              </div>
              <Button variant="outline" size="icon" onClick={handleNextQuarter}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="vacation-year"
                  className="text-xs text-muted-foreground"
                >
                  Jahr
                </Label>
                <Input
                  id="vacation-year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-24"
                />
              </div>
              {!embedded && (
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as any)}
                >
                  <SelectTrigger className="w-[180px]">
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
              {embedded && currentUser && (
                <div className="flex items-center gap-2">
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
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filter
                    {filterActive && (
                      <Badge variant="secondary" className="ml-1">
                        aktiv
                      </Badge>
                    )}
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
                className="gap-2"
                onClick={handleExportAbsences}
                disabled={activeAbsences.length === 0}
              >
                CSV exportieren
              </Button>
              <Dialog
                open={absenceDialogOpen}
                onOpenChange={setAbsenceDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={!currentUser}>
                    <Plus className="w-4 h-4" />
                    Abwesenheit erfassen
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Abwesenheit eintragen</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Mitarbeiter</Label>
                      {canEditOthers ? (
                        <Select
                          value={
                            absenceDraft.employeeId
                              ? String(absenceDraft.employeeId)
                              : ""
                          }
                          onValueChange={(value) =>
                            setAbsenceDraft((prev) => ({
                              ...prev,
                              employeeId: Number(value),
                            }))
                          }
                        >
                          <SelectTrigger>
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
                      {absenceDraft.reason === "Urlaub" && (
                        <p className="text-xs text-muted-foreground">
                          Urlaub wird gegen den Anspruch gerechnet. Fortbildung
                          ist ausgenommen.
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Von</Label>
                        <Input
                          type="date"
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
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setAbsenceDialogOpen(false)}
                      >
                        Abbrechen
                      </Button>
                      <Button
                        onClick={handleAbsenceSave}
                        disabled={savingAbsence || !absenceDraft.employeeId}
                      >
                        {savingAbsence && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Speichern
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {(hasVacationLock || canEditRules) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {hasVacationLock ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                <span>{vacationLockLabel}</span>
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
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Gesamt: {counts.total}</Badge>
            <Badge variant="outline" className={STATUS_STYLES.Geplant}>
              Geplant: {counts.geplant}
            </Badge>
            <Badge variant="outline" className={STATUS_STYLES.Genehmigt}>
              Genehmigt: {counts.genehmigt}
            </Badge>
            <Badge variant="outline" className={STATUS_STYLES.Abgelehnt}>
              Abgelehnt: {counts.abgelehnt}
            </Badge>
            {selectedEmployeeIds.length > 0 && (
              <Badge variant="secondary">
                Mitarbeiter: {selectedEmployeeIds.length}
              </Badge>
            )}
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
              Keine Konflikte fuer dieses Quartal.
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
          <CardTitle className="text-lg">Jahresplanung (Quartal)</CardTitle>
          <CardDescription>
            Wochenenden, Feiertage und Schulferien sind markiert. Klicken Sie
            auf ein Feld, um eine Abwesenheit einzutragen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Daten werden geladen...
            </div>
          ) : (
            <TooltipProvider delayDuration={120}>
              <div
                ref={gridScrollRef}
                className="max-h-[70vh] overflow-auto border border-border rounded-xl"
              >
                <table className="min-w-max border-collapse text-xs">
                  <thead>
                    <tr>
                      <th
                        ref={stickyEmployeeHeaderRef}
                        className="sticky left-0 top-0 z-40 bg-white border border-border px-2 py-2 text-left min-w-[190px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>Mitarbeiter</span>
                          <span className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                            {visibleMonthLabel || quarterLabel}
                          </span>
                        </div>
                      </th>
                      {monthSegments.map((segment) => {
                        const segmentKey = format(segment.days[0], "yyyy-MM");
                        const isVisibleMonth = visibleMonthKey === segmentKey;
                        return (
                          <th
                            key={segment.label}
                            colSpan={segment.days.length}
                            className={cn(
                              "sticky top-0 z-30 border border-border px-2 py-1 text-center font-semibold",
                              isVisibleMonth
                                ? "bg-blue-50 text-blue-800"
                                : "bg-slate-50",
                            )}
                          >
                            {segment.label}
                          </th>
                        );
                      })}
                    </tr>
                    <tr>
                      <th className="sticky left-0 top-[32px] z-30 bg-white border border-border px-2 py-2 text-left">
                        Tag
                      </th>
                      {days.map((date) => {
                        const dayKey = formatDateInput(date);
                        const dayLabel = getDayLabel(date);
                        return (
                          <th
                            key={dayKey}
                            title={dayLabel}
                            className={cn(
                              "sticky top-[32px] z-20 border border-border p-0 text-center font-normal bg-white w-7 min-w-7",
                              getDayClass(date),
                              conflictDates.has(dayKey) ? "bg-amber-100" : "",
                            )}
                          >
                            <div className="py-0.5">
                              <div className="text-[9px] leading-none">
                                {format(date, "EE", { locale: de })}
                              </div>
                              <div className="font-semibold leading-tight">
                                {format(date, "d")}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                    <tr>
                      <th className="sticky left-0 top-[64px] z-20 bg-white border border-border px-2 py-2 text-left">
                        Fehlt (gesamt)
                      </th>
                      {days.map((date) => {
                        const dayKey = formatDateInput(date);
                        const count = dayAbsenceMap.get(dayKey)?.length ?? 0;
                        const breakdown = (
                          dayAbsenceMap.get(dayKey) ?? []
                        ).reduce(
                          (acc, absence) => {
                            const group = employeeRoleGroupById.get(
                              absence.employeeId,
                            );
                            if (group === "OA") acc.OA += 1;
                            if (group === "ASS") acc.ASS += 1;
                            if (group === "TA") acc.TA += 1;
                            return acc;
                          },
                          { OA: 0, ASS: 0, TA: 0 },
                        );

                        const breakdownPanel = (
                          <div className="text-xs leading-relaxed">
                            <div className="font-semibold">Fehlend:</div>
                            <div>Oberaerzte: {breakdown.OA}</div>
                            <div>Assistenzaerzte: {breakdown.ASS}</div>
                            <div>Turnusaerzte: {breakdown.TA}</div>
                          </div>
                        );

                        return (
                          <th
                            key={`count-${dayKey}`}
                            className={cn(
                              "sticky top-[64px] z-10 border border-border p-0 text-center bg-white w-7 min-w-7",
                              getDayClass(date),
                            )}
                          >
                            <Popover>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="flex h-7 w-full items-center justify-center text-[10px] font-semibold"
                                      aria-label={`Fehlend am ${format(date, "dd.MM.yyyy")}: ${count}`}
                                    >
                                      {count > 0 ? count : ""}
                                    </button>
                                  </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent className="bg-white text-foreground border border-border shadow-md">
                                  {breakdownPanel}
                                </TooltipContent>
                              </Tooltip>
                              <PopoverContent align="center" className="w-auto p-3">
                                {breakdownPanel}
                              </PopoverContent>
                            </Popover>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {displayEmployees.map((emp) => {
                      const entitlement = emp.vacationEntitlement;
                      const usedDays = countVacationDaysForEmployee(emp.id);
                      const entitlementExceeded =
                        typeof entitlement === "number" && usedDays > entitlement;
                      const canEditRow =
                        emp.id === currentUser?.id || canEditOthers;
                      const employeeName =
                        [emp.lastName, emp.firstName].filter(Boolean).join(" ").trim() ||
                        emp.name ||
                        "Unbekannt";

                      const employeeInfoPanel = (
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold">{employeeName}</div>
                          <div className="text-muted-foreground">
                            {emp.role || "-"}
                          </div>
                          <div
                            className={cn(
                              entitlementExceeded
                                ? "text-red-600"
                                : "text-muted-foreground",
                            )}
                          >
                            Urlaub: {usedDays} / {entitlement ?? "-"}
                          </div>
                        </div>
                      );

                      return (
                        <tr
                          key={emp.id}
                          className={
                            emp.id === currentUser?.id ? "bg-blue-50/40" : ""
                          }
                        >
                          <td
                            className={cn(
                              "sticky left-0 z-10 border border-border px-2 py-1 text-left",
                              emp.id === currentUser?.id ? "bg-blue-50/70" : "bg-white",
                            )}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <Popover>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="truncate text-left font-medium text-xs hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded-sm"
                                      >
                                        {employeeName}
                                      </button>
                                    </PopoverTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-white text-foreground border border-border shadow-md">
                                    {employeeInfoPanel}
                                  </TooltipContent>
                                </Tooltip>
                                <PopoverContent align="start" className="w-56 p-3">
                                  {employeeInfoPanel}
                                </PopoverContent>
                              </Popover>
                              {canEditRow && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  onClick={() => openAbsenceDialog(emp.id)}
                                  title="Abwesenheit erfassen"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                          {days.map((date) => {
                            const dayKey = formatDateInput(date);
                            const absence = getAbsenceForEmployeeOnDate(
                              emp.id,
                              dayKey,
                            );
                            const reasonStyle = absence
                              ? REASON_STYLES[absence.styleKey]
                              : null;
                            const cellClass = getDayClass(date);
                            const insetClass = getDayInsetClass(date);
                            const isRejected = absence?.status === "Abgelehnt";
                            const isCellLocked =
                              !canOverrideLock && isDateWithinLock(dayKey);
                            const canEditCell = canEditRow && !isCellLocked;
                            const cellTitle = absence
                              ? `${absence.reason} (${absence.status ?? "Geplant"})`
                              : getDayLabel(date);
                            return (
                              <td
                                key={`${emp.id}-${dayKey}`}
                                title={cellTitle}
                                className={cn(
                                  "border border-border p-0 text-center",
                                  canEditCell ? "cursor-pointer" : "",
                                )}
                                onClick={() => {
                                  if (!canEditCell) return;
                                  openAbsenceDialog(emp.id, date);
                                }}
                              >
                                <div
                                  className={cn(
                                    "relative h-6 w-7",
                                    cellClass,
                                    isCellLocked ? "opacity-70" : "",
                                  )}
                                >
                                  {absence && (
                                    <>
                                      <div
                                        className={cn(
                                          "absolute inset-0",
                                          reasonStyle?.bg || "bg-slate-200",
                                          isRejected ? "opacity-40" : "",
                                        )}
                                      />
                                      <div
                                        className={cn(
                                          "absolute right-0 top-0 min-w-[10px] rounded-bl-[3px] bg-white/85 px-0.5 text-[8px] font-semibold leading-[10px] text-slate-700",
                                          isRejected ? "opacity-60" : "",
                                        )}
                                      >
                                        {reasonStyle?.label ?? ""}
                                      </div>
                                    </>
                                  )}
                                  {insetClass && (
                                    <div
                                      className={cn(
                                        "pointer-events-none absolute inset-[1px] rounded-[2px] border",
                                        insetClass,
                                      )}
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
              Uebersicht fuer das aktuelle Quartal mit Statusverwaltung.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredAbsences.length === 0 ? (
              <div className="text-muted-foreground text-center py-6">
                Keine Eintraege fuer dieses Quartal.
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
                                const displayName = [
                                  absence.employeeLastName,
                                  absence.employeeName,
                                ]
                                  .filter(Boolean)
                                  .join(" ");
                                const rowStatusClass =
                                  STATUS_STYLES[absence.status] ??
                                  STATUS_STYLES.Geplant;
                                const isRowLocked =
                                  !canOverrideLock &&
                                  isRangeWithinLock(
                                    absence.startDate,
                                    absence.endDate,
                                  );
                                const canEditRow =
                                  (canApprove ||
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
                                      {absence.notes || "-"}
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
              Tagesanzahl pro Mitarbeiter und Kategorie fuer dieses Quartal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {absenceSummary.length === 0 ? (
              <div className="text-muted-foreground text-center py-6">
                Keine Daten fuer dieses Quartal.
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
