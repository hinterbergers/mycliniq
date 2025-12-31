import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth
} from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Filter,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  XCircle
} from "lucide-react";

import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  absenceApi,
  competencyApi,
  employeeApi,
  longTermAbsencesApi,
  meApi,
  plannedAbsencesAdminApi,
  vacationRulesApi,
  type PlannedAbsenceAdmin,
  type VacationRuleInput
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getAustrianHoliday } from "@/lib/holidays";
import { getSchoolHoliday, type SchoolHolidayLocation } from "@/lib/schoolHolidays";
import { cn } from "@/lib/utils";
import type { Competency, Employee, LongTermAbsence, VacationRule } from "@shared/schema";
import * as XLSX from "xlsx";

const STATUS_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "Geplant", label: "Geplant" },
  { value: "Genehmigt", label: "Genehmigt" },
  { value: "Abgelehnt", label: "Abgelehnt" }
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
  "Ruhezeit"
] as const;

const STATUS_STYLES: Record<string, string> = {
  Geplant: "bg-slate-50 text-slate-700 border-slate-200",
  Genehmigt: "bg-green-50 text-green-700 border-green-200",
  Abgelehnt: "bg-red-50 text-red-700 border-red-200"
};

const REASON_STYLES: Record<string, { bg: string; label: string }> = {
  Urlaub: { bg: "bg-emerald-200", label: "U" },
  Fortbildung: { bg: "bg-indigo-200", label: "F" },
  Karenz: { bg: "bg-violet-200", label: "K" },
  Krankenstand: { bg: "bg-red-200", label: "S" },
  Zeitausgleich: { bg: "bg-amber-200", label: "Z" },
  Pflegeurlaub: { bg: "bg-orange-200", label: "P" },
  Geb\u00fchrenurlaub: { bg: "bg-lime-200", label: "G" },
  Sonderurlaub: { bg: "bg-teal-200", label: "S" },
  Zusatzurlaub: { bg: "bg-cyan-200", label: "Z" },
  Quarant\u00e4ne: { bg: "bg-fuchsia-200", label: "Q" },
  Ruhezeit: { bg: "bg-slate-200", label: "R" }
};

const SUMMARY_REASON_KEYS = Object.keys(REASON_STYLES) as Array<keyof typeof REASON_STYLES>;

type VacationVisibilityGroup = "OA" | "ASS" | "TA" | "SEK";

const DEFAULT_VISIBILITY_GROUPS: VacationVisibilityGroup[] = ["OA", "ASS", "TA", "SEK"];

const VISIBILITY_GROUP_LABELS: Record<VacationVisibilityGroup, string> = {
  OA: "Oberaerzte & Fachaerzte",
  ASS: "Assistenz",
  TA: "Turnus & Studierende",
  SEK: "Sekretariat"
};

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
  source: "planned" | "longTerm" | "legacy";
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
  Sekretariat: 10
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
  Sekretariat: "SEK"
};

type AbsenceDraft = {
  employeeId: number | null;
  reason: typeof ABSENCE_REASONS[number];
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

const resolveReasonStyleKey = (reason: string): keyof typeof REASON_STYLES => {
  if (reason in REASON_STYLES) {
    return reason as keyof typeof REASON_STYLES;
  }
  const normalized = reason.toLowerCase();
  if (normalized.includes("karenz") || normalized.includes("eltern")) return "Karenz";
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

export default function VacationPlanEditor({ embedded = false }: { embedded?: boolean } = {}) {
  const { employee: currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [quarter, setQuarter] = useState(() => Math.floor(new Date().getMonth() / 3));
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
  const [loading, setLoading] = useState(true);
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [absences, setAbsences] = useState<PlannedAbsenceAdmin[]>([]);
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>([]);
  const [rules, setRules] = useState<VacationRule[]>([]);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [holidayLocation, setHolidayLocation] = useState<SchoolHolidayLocation>({
    country: "AT",
    state: "AT-2"
  });
  const [selectedRoleGroups, setSelectedRoleGroups] = useState<VacationVisibilityGroup[]>([]);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<number[]>([]);
  const [absenceDraft, setAbsenceDraft] = useState<AbsenceDraft>({
    employeeId: currentUser?.id ?? null,
    reason: "Urlaub",
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
    notes: ""
  });
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<VacationRuleDraft>({
    departmentId: currentUser?.departmentId ?? undefined,
    ruleType: "role_min",
    minCount: 1,
    roleGroup: "OA",
    competencyId: undefined,
    isActive: true,
    notes: ""
  });
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const canEditRules = isAdmin || (currentUser?.capabilities?.includes("vacation.lock") ?? false);
  const canApprove = isAdmin || (currentUser?.capabilities?.includes("vacation.approve") ?? false);
  const canEditOthers = isAdmin || (currentUser?.capabilities?.includes("absence.create") ?? false);

  const quarterStart = useMemo(() => new Date(year, quarter * 3, 1), [year, quarter]);
  const quarterEnd = useMemo(() => endOfMonth(addMonths(quarterStart, 2)), [quarterStart]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: quarterStart,
        end: quarterEnd
      }),
    [quarterStart, quarterEnd]
  );

  const monthSegments = useMemo(() => {
    return Array.from({ length: 3 }).map((_, idx) => {
      const start = addMonths(quarterStart, idx);
      return {
        label: format(start, "MMMM", { locale: de }),
        days: eachDayOfInterval({
          start: startOfMonth(start),
          end: endOfMonth(start)
        })
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

      const [employeeData, competencyData, absenceData, ruleData, clinicData, longTermData] = await Promise.all([
        employeeApi.getAll(),
        competencyApi.getAll(),
        plannedAbsencesAdminApi.getRange({ from: yearStart, to: yearEnd }),
        vacationRulesApi.getAll(currentUser?.departmentId ?? undefined),
        clinicPromise,
        longTermAbsencesApi.getByStatus("Genehmigt", yearStart, yearEnd)
      ]);
      setEmployees(employeeData);
      setCompetencies(competencyData);
      setAbsences(absenceData);
      setLongTermAbsences(longTermData);
      setRules(ruleData);
      if (clinicData) {
        setHolidayLocation({
          country: clinicData.country || "AT",
          state: clinicData.state || "AT-2"
        });
      }
    } catch (error: any) {
      toast({
        title: "Urlaubsplanung konnte nicht geladen werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.departmentId, toast, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setAbsenceDraft((prev) => ({
      ...prev,
      employeeId: prev.employeeId ?? currentUser?.id ?? null
    }));
  }, [currentUser?.id]);

  const visibilityGroups = useMemo(() => {
    const prefs = (currentUser?.shiftPreferences as ShiftPreferences | null) || null;
    const groups = Array.isArray(prefs?.vacationVisibilityRoleGroups)
      ? prefs?.vacationVisibilityRoleGroups.filter((group): group is VacationVisibilityGroup => Boolean(group))
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
    [absences]
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
      source: "planned"
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
          source: "longTerm"
        });
      });

    employees.forEach((emp) => {
      const start = normalizeDateOnly(emp.inactiveFrom);
      const end = normalizeDateOnly(emp.inactiveUntil);
      if (!start || !end) return;
      entries.push({
        id: `legacy-${emp.id}`,
        employeeId: emp.id,
        startDate: start,
        endDate: end,
        reason: "Karenz",
        styleKey: "Karenz",
        status: "Genehmigt",
        source: "legacy"
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
    [competencyNameLookup, selectedCompetencyIds]
  );

  const visibleEmployees = useMemo(() => {
    const effectiveRoles = selectedRoleGroups.length ? selectedRoleGroups : visibilityGroups;
    return sortedEmployees.filter((emp) => {
      const group = ROLE_GROUPS[normalizeRole(emp.role)] ?? null;
      if (!group || !visibilityGroups.includes(group)) return false;
      if (effectiveRoles.length && !effectiveRoles.includes(group)) return false;
      if (!selectedCompetencyNames.length) return true;
      const empCompetencies = Array.isArray(emp.competencies) ? emp.competencies : [];
      return selectedCompetencyNames.some((name) => empCompetencies.includes(name));
    });
  }, [selectedCompetencyNames, selectedRoleGroups, sortedEmployees, visibilityGroups]);

  const visibleEmployeeIds = useMemo(
    () => new Set(visibleEmployees.map((emp) => emp.id)),
    [visibleEmployees]
  );

  const visibleCalendarAbsences = useMemo(
    () => calendarAbsences.filter((absence) => visibleEmployeeIds.has(absence.employeeId)),
    [calendarAbsences, visibleEmployeeIds]
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
    return list.find((absence) => absence.startDate <= dateStr && absence.endDate >= dateStr) ?? null;
  };

  const dayAbsenceMapAll = useMemo(() => {
    const map = new Map<string, CalendarAbsence[]>();
    days.forEach((date) => {
      const key = formatDateInput(date);
      const list = calendarAbsences.filter(
        (absence) => absence.startDate <= key && absence.endDate >= key
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
        (absence) => absence.startDate <= key && absence.endDate >= key
      );
      map.set(key, list);
    });
    return map;
  }, [days, visibleCalendarAbsences]);

  const employeeRoleGroupById = useMemo(() => {
    return new Map(
      employees.map((emp) => [emp.id, ROLE_GROUPS[normalizeRole(emp.role)] ?? null])
    );
  }, [employees]);

  const conflicts = useMemo(() => {
    const conflictList: ConflictEntry[] = [];
    const activeRules = rules.filter((rule) => rule.isActive !== false);
    if (!activeRules.length) return conflictList;

    const competencyLookup = new Map(competencies.map((comp) => [comp.id, comp.name]));

    days.forEach((date) => {
      const dateKey = formatDateInput(date);
      const dayAbsences = dayAbsenceMapAll.get(dateKey) ?? [];
      const absentIds = new Set(dayAbsences.map((absence) => absence.employeeId));
      const presentEmployees = sortedEmployees.filter(
        (emp) => !absentIds.has(emp.id) && emp.takesShifts !== false
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
              message: `Gesamtbesetzung unter Mindestwert (${presentEmployees.length}/${rule.minCount})`
            });
          }
          return;
        }

        if (rule.ruleType === "role_min" && rule.roleGroup) {
          const count = roleCounts[rule.roleGroup] ?? 0;
          if ((rule.minCount ?? 0) > count) {
            conflictList.push({
              date: dateKey,
              message: `${rule.roleGroup} unter Mindestwert (${count}/${rule.minCount})`
            });
          }
          return;
        }

        if (rule.ruleType === "competency_min" && rule.competencyId) {
          const compName = competencyLookup.get(rule.competencyId) || `Kompetenz ${rule.competencyId}`;
          const count = presentEmployees.filter((emp) =>
            Array.isArray(emp.competencies) ? emp.competencies.includes(compName) : false
          ).length;
          if ((rule.minCount ?? 0) > count) {
            conflictList.push({
              date: dateKey,
              message: `${compName} unter Mindestwert (${count}/${rule.minCount})`
            });
          }
        }
      });
    });

    return conflictList;
  }, [competencies, dayAbsenceMapAll, days, rules, sortedEmployees]);

  const conflictDates = useMemo(() => new Set(conflicts.map((c) => c.date)), [conflicts]);

  const quarterAbsences = useMemo(() => {
    const start = formatDateInput(quarterStart);
    const end = formatDateInput(quarterEnd);
    return absences.filter(
      (absence) =>
        absence.startDate <= end &&
        absence.endDate >= start &&
        visibleEmployeeIds.has(absence.employeeId)
    );
  }, [absences, quarterStart, quarterEnd, visibleEmployeeIds]);

  const filteredAbsences = useMemo(() => {
    if (statusFilter === "all") return quarterAbsences;
    return quarterAbsences.filter((absence) => absence.status === statusFilter);
  }, [quarterAbsences, statusFilter]);

  const countVacationDaysForEmployee = (employeeId: number) => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    return absences
      .filter(
        (absence) =>
          absence.employeeId === employeeId &&
          absence.reason === "Urlaub" &&
          absence.status !== "Abgelehnt"
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
      abgelehnt: quarterAbsences.filter((a) => a.status === "Abgelehnt").length
    };
  }, [quarterAbsences]);

  const sickCount = useMemo(
    () =>
      quarterAbsences.filter(
        (absence) => absence.reason === "Krankenstand" && absence.status !== "Abgelehnt"
      ).length,
    [quarterAbsences]
  );

  const absenceSummary = useMemo(() => {
    const start = quarterStart;
    const end = quarterEnd;
    const map = new Map<number, Record<string, number>>();
    visibleEmployees.forEach((emp) => {
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

    return visibleEmployees.map((emp) => ({
      employee: emp,
      counts: map.get(emp.id) ?? {}
    }));
  }, [quarterEnd, quarterStart, visibleCalendarAbsences, visibleEmployees]);

  const getDayClass = (date: Date) => {
    const holiday = getAustrianHoliday(date);
    const schoolHoliday = getSchoolHoliday(date, holidayLocation);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if (holiday) return "bg-rose-50";
    if (schoolHoliday) return "bg-amber-50";
    if (isWeekend) return "bg-slate-50";
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
      prev.includes(group) ? prev.filter((item) => item !== group) : [...prev, group]
    );
  };

  const toggleCompetencyFilter = (competencyId: number) => {
    setSelectedCompetencyIds((prev) =>
      prev.includes(competencyId)
        ? prev.filter((item) => item !== competencyId)
        : [...prev, competencyId]
    );
  };

  const resetFilters = () => {
    setSelectedRoleGroups(visibilityGroups);
    setSelectedCompetencyIds([]);
  };

  const filterActive =
    selectedCompetencyIds.length > 0 ||
    (selectedRoleGroups.length > 0 && selectedRoleGroups.length !== visibilityGroups.length);

  const openAbsenceDialog = (employeeId: number, date?: Date) => {
    if (!date) {
      setAbsenceDraft((prev) => ({
        ...prev,
        employeeId
      }));
    } else {
      const dateStr = formatDateInput(date);
      setAbsenceDraft((prev) => ({
        ...prev,
        employeeId,
        startDate: dateStr,
        endDate: dateStr
      }));
    }
    setAbsenceDialogOpen(true);
  };

  const handleAbsenceSave = async () => {
    if (!absenceDraft.employeeId) return;
    if (!absenceDraft.startDate || !absenceDraft.endDate) return;
    setSavingAbsence(true);
    try {
      await absenceApi.create({
        employeeId: absenceDraft.employeeId,
        startDate: absenceDraft.startDate,
        endDate: absenceDraft.endDate,
        reason: absenceDraft.reason,
        notes: absenceDraft.notes || null
      } as any);
      toast({
        title: "Abwesenheit gespeichert",
        description: "Eintrag wurde uebernommen."
      });
      setAbsenceDialogOpen(false);
      setAbsenceDraft((prev) => ({
        ...prev,
        notes: ""
      }));
      await loadData();
    } catch (error: any) {
      toast({
        title: "Abwesenheit konnte nicht gespeichert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    } finally {
      setSavingAbsence(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAdmin) {
      toast({
        title: "Kein Zugriff",
        description: "Nur Admins koennen Excel-Importe durchfuehren.",
        variant: "destructive"
      });
      return;
    }

    const normalizeText = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\u00e4/g, "ae")
        .replace(/\u00f6/g, "oe")
        .replace(/\u00fc/g, "ue")
        .replace(/\u00df/g, "ss")
        .replace(/\s+/g, " ");

    const monthLookup: Record<string, number> = {
      jaenner: 1,
      januar: 1,
      februar: 2,
      maerz: 3,
      marz: 3,
      april: 4,
      mai: 5,
      juni: 6,
      juli: 7,
      august: 8,
      september: 9,
      oktober: 10,
      november: 11,
      dezember: 12
    };

    const parseDay = (value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text) return null;
      const match = text.match(/(\d{1,2})/);
      if (!match) return null;
      const day = Number(match[1]);
      if (!Number.isFinite(day) || day < 1 || day > 31) return null;
      return day;
    };

    const buildDate = (yearValue: number, month: number, day: number) => {
      const date = new Date(yearValue, month - 1, day);
      return formatDateInput(date);
    };

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const employeeMap = new Map<string, Employee>();
      employees.forEach((emp) => {
        const lastName = normalizeText(emp.lastName || "");
        const fullName = normalizeText(`${emp.firstName || ""} ${emp.lastName || ""}`);
        const name = normalizeText(emp.name || "");
        if (lastName) employeeMap.set(lastName, emp);
        if (fullName) employeeMap.set(fullName, emp);
        if (name) employeeMap.set(name, emp);
      });

      const calendarAbsenceIndex = calendarAbsences.filter((absence) =>
        ["Urlaub", "Fortbildung"].includes(absence.styleKey)
      );

      const created: Array<{
        employeeId: number;
        startDate: string;
        endDate: string;
        reason: "Urlaub" | "Fortbildung";
      }> = [];
      let skipped = 0;
      let unmatched = 0;

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<unknown[]>;
        if (!rows.length) return;

        const yearValue =
          rows
            .flat()
            .map((cell) => Number(String(cell ?? "").trim()))
            .find((value) => Number.isFinite(value) && value >= 2000 && value <= 2100) ||
          year;

        let nameColumnIndex = -1;
        rows.some((row) => {
          const idx = row.findIndex((cell) => normalizeText(cell) === "namen" || normalizeText(cell) === "name");
          if (idx >= 0) {
            nameColumnIndex = idx;
            return true;
          }
          return false;
        });

        const headerRowIndex = rows.findIndex((row) =>
          row.some((cell) => normalizeText(cell) in monthLookup)
        );
        if (headerRowIndex < 0) return;

        const headerRow = rows[headerRowIndex] || [];
        const monthStarts: Array<{ month: number; col: number }> = [];
        headerRow.forEach((cell, colIndex) => {
          const key = normalizeText(cell);
          if (key in monthLookup) {
            monthStarts.push({ month: monthLookup[key], col: colIndex });
          }
        });
        monthStarts.sort((a, b) => a.col - b.col);
        if (!monthStarts.length) return;

        const monthSegments = monthStarts.map((entry, idx) => ({
          month: entry.month,
          start: entry.col,
          end: (monthStarts[idx + 1]?.col ?? headerRow.length) - 1
        }));

        const dayRowIndex = rows
          .slice(headerRowIndex + 1, headerRowIndex + 8)
          .findIndex((row) => row.filter((cell) => parseDay(cell) !== null).length > 10);
        if (dayRowIndex < 0) return;
        const resolvedDayRowIndex = headerRowIndex + 1 + dayRowIndex;
        const dayRow = rows[resolvedDayRowIndex] || [];

        const dayByCol = new Map<number, number>();
        monthSegments.forEach((segment) => {
          for (let col = segment.start; col <= segment.end; col += 1) {
            const day = parseDay(dayRow[col]);
            if (day) {
              dayByCol.set(col, day);
            }
          }
        });

        for (let rowIndex = resolvedDayRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex] || [];
          const candidateCells = [];
          if (nameColumnIndex >= 0) candidateCells.push(row[nameColumnIndex]);
          row.forEach((cell) => {
            if (typeof cell === "string") candidateCells.push(cell);
          });
          const employee = candidateCells
            .map((cell) => employeeMap.get(normalizeText(cell)))
            .find(Boolean);
          if (!employee) {
            const hasEntries = monthSegments.some((segment) => {
              for (let col = segment.start; col <= segment.end; col += 1) {
                const symbol = normalizeText(row[col]);
                if (symbol === "u" || symbol === "f") return true;
              }
              return false;
            });
            if (hasEntries) unmatched += 1;
            continue;
          }

          monthSegments.forEach((segment) => {
            for (let col = segment.start; col <= segment.end; col += 1) {
              const day = dayByCol.get(col);
              if (!day) continue;
              const symbol = normalizeText(row[col]);
              if (!symbol) continue;
              if (symbol === "k") continue;
              if (symbol !== "u" && symbol !== "f") continue;
              const reason = symbol === "u" ? "Urlaub" : "Fortbildung";
              const date = buildDate(yearValue, segment.month, day);
              created.push({
                employeeId: employee.id,
                startDate: date,
                endDate: date,
                reason
              });
            }
          });
        }
      });

      const grouped = new Map<string, { employeeId: number; reason: "Urlaub" | "Fortbildung"; dates: string[] }>();
      created.forEach((entry) => {
        const key = `${entry.employeeId}-${entry.reason}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.dates.push(entry.startDate);
        } else {
          grouped.set(key, { employeeId: entry.employeeId, reason: entry.reason, dates: [entry.startDate] });
        }
      });

      const ranges: Array<{ employeeId: number; reason: "Urlaub" | "Fortbildung"; startDate: string; endDate: string }> = [];
      grouped.forEach((group) => {
        const sortedDates = Array.from(new Set(group.dates)).sort();
        let start = sortedDates[0];
        let prev = sortedDates[0];
        for (let i = 1; i <= sortedDates.length; i += 1) {
          const current = sortedDates[i];
          const prevDate = new Date(`${prev}T00:00:00`);
          const expectedNext = formatDateInput(new Date(prevDate.getTime() + 86400000));
          if (current && current === expectedNext) {
            prev = current;
            continue;
          }
          ranges.push({
            employeeId: group.employeeId,
            reason: group.reason,
            startDate: start,
            endDate: prev
          });
          start = current;
          prev = current;
        }
      });

      for (const range of ranges) {
        const overlap = calendarAbsenceIndex.some(
          (absence) =>
            absence.employeeId === range.employeeId &&
            absence.styleKey === range.reason &&
            !(absence.endDate < range.startDate || absence.startDate > range.endDate)
        );
        if (overlap) {
          skipped += 1;
          continue;
        }
        await absenceApi.create({
          employeeId: range.employeeId,
          startDate: range.startDate,
          endDate: range.endDate,
          reason: range.reason,
          notes: "Import (Excel)"
        } as any);
      }

      if (!ranges.length) {
        toast({
          title: "Kein Import",
          description: "Keine passenden Eintraege (u/f) im Excel gefunden."
        });
      } else {
        toast({
          title: "Import abgeschlossen",
          description: `Importiert: ${ranges.length - skipped}, uebersprungen: ${skipped}, unzugeordnet: ${unmatched}`
        });
      }
      await loadData();
    } catch (error: any) {
      toast({
        title: "Import fehlgeschlagen",
        description: error.message || "Excel konnte nicht verarbeitet werden.",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  const handleAbsenceDelete = async (absenceId: number) => {
    setUpdatingId(absenceId);
    try {
      await absenceApi.delete(absenceId);
      toast({
        title: "Abwesenheit geloescht",
        description: "Eintrag wurde entfernt."
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Loeschen fehlgeschlagen",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusUpdate = async (absence: PlannedAbsenceAdmin, status: "Geplant" | "Genehmigt" | "Abgelehnt") => {
    setUpdatingId(absence.id);
    try {
      const updated = await plannedAbsencesAdminApi.updateStatus(absence.id, status, currentUser?.id);
      setAbsences((prev) => prev.map((item) => (item.id === absence.id ? { ...item, ...updated } : item)));
      toast({
        title: "Status aktualisiert",
        description: `Abwesenheit ist jetzt ${status}.`
      });
    } catch (error: any) {
      toast({
        title: "Status konnte nicht geaendert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRuleSave = async () => {
    const departmentId = ruleDraft.departmentId ?? currentUser?.departmentId;
    if (!departmentId) {
      toast({
        title: "Regel konnte nicht gespeichert werden",
        description: "Keine Abteilung gefunden.",
        variant: "destructive"
      });
      return;
    }

    try {
      const payload: VacationRuleInput = {
        departmentId,
        ruleType: ruleDraft.ruleType,
        minCount: ruleDraft.ruleType === "training_priority" ? null : ruleDraft.minCount ?? 0,
        roleGroup: ruleDraft.ruleType === "role_min" ? ruleDraft.roleGroup ?? "OA" : null,
        competencyId: ruleDraft.ruleType === "competency_min" ? ruleDraft.competencyId : null,
        isActive: ruleDraft.isActive ?? true,
        notes: ruleDraft.notes ?? null
      };
      const created = await vacationRulesApi.create(payload);
      setRules((prev) => [...prev, created]);
      setRuleDialogOpen(false);
      setRuleDraft((prev) => ({
        departmentId: prev.departmentId ?? currentUser?.departmentId ?? undefined,
        ruleType: "role_min",
        minCount: 1,
        roleGroup: "OA",
        competencyId: undefined,
        isActive: true,
        notes: ""
      }));
      toast({
        title: "Regel gespeichert",
        description: "Neue Regel wurde angelegt."
      });
    } catch (error: any) {
      toast({
        title: "Regel konnte nicht gespeichert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    }
  };

  const handleRuleToggle = async (rule: VacationRule, value: boolean) => {
    try {
      const updated = await vacationRulesApi.update(rule.id, { isActive: value });
      setRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, ...updated } : item)));
    } catch (error: any) {
      toast({
        title: "Regel konnte nicht aktualisiert werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    }
  };

  const handleRuleDelete = async (ruleId: number) => {
    try {
      await vacationRulesApi.delete(ruleId);
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      toast({
        title: "Regel geloescht",
        description: "Regel wurde entfernt."
      });
    } catch (error: any) {
      toast({
        title: "Regel konnte nicht geloescht werden",
        description: error.message || "Bitte spaeter erneut versuchen.",
        variant: "destructive"
      });
    }
  };

  const quarterLabel = `${format(quarterStart, "MMMM", { locale: de })} - ${format(quarterEnd, "MMMM yyyy", { locale: de })}`;

  const content = (
    <div className="space-y-6">
        <Card className="border-none kabeg-shadow">
          <CardContent className="p-4 space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImport}
            />
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
                  <Label htmlFor="vacation-year" className="text-xs text-muted-foreground">
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
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
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
                        <div className="text-xs font-semibold uppercase text-muted-foreground">Rollen</div>
                        <div className="space-y-2">
                          {visibilityGroups.map((group) => (
                            <div key={group} className="flex items-center gap-2">
                              <Checkbox
                                id={`filter-role-${group}`}
                                checked={selectedRoleGroups.includes(group)}
                                onCheckedChange={() => toggleRoleFilter(group)}
                              />
                              <Label htmlFor={`filter-role-${group}`} className="text-sm font-normal cursor-pointer">
                                {VISIBILITY_GROUP_LABELS[group]}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">Kompetenzen</div>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                          {activeCompetencies.map((comp) => (
                            <div key={comp.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`filter-comp-${comp.id}`}
                                checked={selectedCompetencyIds.includes(comp.id)}
                                onCheckedChange={() => toggleCompetencyFilter(comp.id)}
                              />
                              <Label htmlFor={`filter-comp-${comp.id}`} className="text-sm font-normal cursor-pointer">
                                {comp.name}
                              </Label>
                            </div>
                          ))}
                          {!activeCompetencies.length && (
                            <p className="text-xs text-muted-foreground">Keine Kompetenzen vorhanden</p>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={resetFilters}>
                        Zuruecksetzen
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {isAdmin && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileUp className="w-4 h-4" />
                    )}
                    Excel importieren
                  </Button>
                )}
                <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
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
                            value={absenceDraft.employeeId ? String(absenceDraft.employeeId) : ""}
                            onValueChange={(value) =>
                              setAbsenceDraft((prev) => ({
                                ...prev,
                                employeeId: Number(value)
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Mitarbeiter waehlen" />
                            </SelectTrigger>
                            <SelectContent>
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
                              reason: value as typeof ABSENCE_REASONS[number]
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
                            Urlaub wird gegen den Anspruch gerechnet. Fortbildung ist ausgenommen.
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
                                startDate: e.target.value
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
                                endDate: e.target.value
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
                              notes: e.target.value
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
                          {savingAbsence && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Speichern
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
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
            </div>
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
              <div className="text-sm text-muted-foreground">Keine Konflikte fuer dieses Quartal.</div>
            ) : (
              <div className="space-y-2">
                {conflicts.slice(0, 6).map((conflict, idx) => (
                  <div key={`${conflict.date}-${idx}`} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="font-medium">{format(toDate(conflict.date), "dd.MM.yyyy")}</span>
                    <span className="text-muted-foreground">{conflict.message}</span>
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
            {rules.some((rule) => rule.ruleType === "training_priority" && rule.isActive !== false) && (
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
              Wochenenden, Feiertage und Schulferien sind markiert. Klicken Sie auf ein Feld, um eine
              Abwesenheit einzutragen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Daten werden geladen...
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="min-w-max border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-white border border-border px-3 py-2 text-left min-w-[220px]">
                        Mitarbeiter
                      </th>
                      {monthSegments.map((segment) => (
                        <th
                          key={segment.label}
                          colSpan={segment.days.length}
                          className="border border-border bg-slate-50 px-2 py-1 text-center font-semibold"
                        >
                          {segment.label}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="sticky left-0 z-20 bg-white border border-border px-3 py-2 text-left">
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
                              "border border-border px-1 py-1 text-center font-normal",
                              getDayClass(date),
                              conflictDates.has(dayKey) ? "bg-amber-100" : ""
                            )}
                          >
                            <div className="text-[10px]">{format(date, "EE", { locale: de })}</div>
                            <div className="font-semibold">{format(date, "d")}</div>
                          </th>
                        );
                      })}
                    </tr>
                    <tr>
                      <th className="sticky left-0 z-20 bg-white border border-border px-3 py-2 text-left">
                        Fehlt (gesamt)
                      </th>
                      {days.map((date) => {
                        const dayKey = formatDateInput(date);
                        const count = dayAbsenceMap.get(dayKey)?.length ?? 0;
                        const breakdown = (dayAbsenceMap.get(dayKey) ?? []).reduce(
                          (acc, absence) => {
                            const group = employeeRoleGroupById.get(absence.employeeId);
                            if (group === "OA") acc.OA += 1;
                            if (group === "ASS") acc.ASS += 1;
                            if (group === "TA") acc.TA += 1;
                            return acc;
                          },
                          { OA: 0, ASS: 0, TA: 0 }
                        );
                        const breakdownLabel = `ASS: ${breakdown.ASS} | OA: ${breakdown.OA} | TA: ${breakdown.TA}`;
                        return (
                          <th
                            key={`count-${dayKey}`}
                            title={breakdownLabel}
                            className={cn("border border-border px-1 py-1 text-center", getDayClass(date))}
                          >
                            {count > 0 && (
                              <div className="space-y-0.5">
                                <div className="text-[10px] font-semibold">{count}</div>
                                <div className="text-[9px] text-muted-foreground">
                                  A:{breakdown.ASS} O:{breakdown.OA} T:{breakdown.TA}
                                </div>
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmployees.map((emp) => {
                      const entitlement = emp.vacationEntitlement;
                      const usedDays = countVacationDaysForEmployee(emp.id);
                      const entitlementExceeded =
                        typeof entitlement === "number" && usedDays > entitlement;
                      const canEditRow = emp.id === currentUser?.id || canEditOthers;
                      return (
                        <tr key={emp.id} className={emp.id === currentUser?.id ? "bg-blue-50/40" : ""}>
                          <td className="sticky left-0 z-10 bg-white border border-border px-3 py-2 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="font-medium">
                                  {emp.lastName} {emp.firstName}
                                </div>
                                <div className="text-[11px] text-muted-foreground">{emp.role}</div>
                                <div
                                  className={cn(
                                    "text-[11px]",
                                    entitlementExceeded ? "text-red-600" : "text-muted-foreground"
                                  )}
                                >
                                  Urlaub: {usedDays} / {entitlement ?? "-"}
                                </div>
                              </div>
                              {canEditRow && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openAbsenceDialog(emp.id)}
                                  title="Abwesenheit erfassen"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                          {days.map((date) => {
                            const dayKey = formatDateInput(date);
                            const absence = getAbsenceForEmployeeOnDate(emp.id, dayKey);
                            const reasonStyle = absence ? REASON_STYLES[absence.reason] : null;
                            const cellClass = getDayClass(date);
                            const isRejected = absence?.status === "Abgelehnt";
                            return (
                              <td
                                key={`${emp.id}-${dayKey}`}
                                className={cn(
                                  "border border-border px-1 py-1 text-center",
                                  cellClass,
                                  canEditRow ? "cursor-pointer" : ""
                                )}
                                onClick={() => {
                                  if (!canEditRow) return;
                                  openAbsenceDialog(emp.id, date);
                                }}
                              >
                                {absence && (
                                  <div
                                    className={cn(
                                      "mx-auto h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold",
                                      reasonStyle?.bg || "bg-slate-200",
                                      isRejected ? "opacity-40" : ""
                                    )}
                                    title={`${absence.reason} (${absence.status})`}
                                  >
                                    {reasonStyle?.label ?? ""}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4 text-xs text-muted-foreground">
              {Object.entries(REASON_STYLES).map(([reason, style]) => (
                <div key={reason} className="flex items-center gap-2">
                  <span className={cn("inline-flex h-3 w-3 rounded-full", style.bg)} />
                  <span>{reason}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="inline-flex h-3 w-3 rounded-full bg-rose-50 border border-rose-200" />
                <span>Feiertag</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-3 w-3 rounded-full bg-amber-50 border border-amber-200" />
                <span>Schulferien</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-3 w-3 rounded-full bg-slate-50 border border-slate-200" />
                <span>Wochenende</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {!embedded && (
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Antraege & Status</CardTitle>
              <CardDescription>Uebersicht fuer das aktuelle Quartal mit Statusverwaltung.</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredAbsences.length === 0 ? (
                <div className="text-muted-foreground text-center py-6">
                  Keine Eintraege fuer dieses Quartal.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mitarbeiter</TableHead>
                        <TableHead>Zeitraum</TableHead>
                        <TableHead>Grund</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Anmerkung</TableHead>
                        <TableHead className="text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAbsences.map((absence) => {
                        const displayName = [absence.employeeLastName, absence.employeeName]
                          .filter(Boolean)
                          .join(" ");
                        const statusClass = STATUS_STYLES[absence.status] ?? STATUS_STYLES.Geplant;
                        const canEditRow = canApprove || absence.employeeId === currentUser?.id;
                        return (
                          <TableRow key={absence.id}>
                            <TableCell className="font-medium">
                              {displayName || "Unbekannt"}
                              {absence.employeeRole ? (
                                <div className="text-xs text-muted-foreground">{absence.employeeRole}</div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {format(toDate(absence.startDate), "dd.MM.yyyy", { locale: de })} -{" "}
                              {format(toDate(absence.endDate), "dd.MM.yyyy", { locale: de })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{absence.reason}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusClass}>
                                {absence.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{absence.notes || "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 flex-wrap">
                                {canApprove && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleStatusUpdate(absence, "Geplant")}
                                      disabled={updatingId === absence.id || absence.status === "Geplant"}
                                    >
                                      <RotateCcw className="w-4 h-4 mr-1" />
                                      Geplant
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleStatusUpdate(absence, "Genehmigt")}
                                      disabled={updatingId === absence.id || absence.status === "Genehmigt"}
                                    >
                                      <CheckCircle2 className="w-4 h-4 mr-1" />
                                      Genehmigen
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleStatusUpdate(absence, "Abgelehnt")}
                                      disabled={updatingId === absence.id || absence.status === "Abgelehnt"}
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
                                    onClick={() => handleAbsenceDelete(absence.id)}
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
              )}
            </CardContent>
          </Card>
        )}

        {!embedded && canApprove && (
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Abwesenheiten nach Kategorie</CardTitle>
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
                              <TableCell key={`${entry.employee.id}-${reason}`} className="text-center">
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

        {!embedded && (
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Konfliktregeln</CardTitle>
              <CardDescription>
                Regeln fuer Mindestbesetzung und Prioritaeten. Nur Admins/Urlaubsfreigabe koennen Regeln
                bearbeiten.
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
                              ruleType: value as VacationRuleInput["ruleType"]
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="role_min">Mindestbesetzung Rolle</SelectItem>
                            <SelectItem value="competency_min">Mindestbesetzung Kompetenz</SelectItem>
                            <SelectItem value="total_min">Mindestbesetzung Gesamt</SelectItem>
                            <SelectItem value="training_priority">Fortbildung vor Urlaub</SelectItem>
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
                                  roleGroup: value as VacationRuleInput["roleGroup"]
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
                                  minCount: Number(e.target.value)
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
                              value={ruleDraft.competencyId ? String(ruleDraft.competencyId) : ""}
                              onValueChange={(value) =>
                                setRuleDraft((prev) => ({
                                  ...prev,
                                  competencyId: Number(value)
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Kompetenz waehlen" />
                              </SelectTrigger>
                              <SelectContent>
                                {competencies.map((comp) => (
                                  <SelectItem key={comp.id} value={String(comp.id)}>
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
                                  minCount: Number(e.target.value)
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
                                minCount: Number(e.target.value)
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
                              notes: e.target.value
                            }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">Regel aktiv</div>
                        <Switch
                          checked={ruleDraft.isActive ?? true}
                          onCheckedChange={(checked) =>
                            setRuleDraft((prev) => ({
                              ...prev,
                              isActive: Boolean(checked)
                            }))
                          }
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
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
                <div className="text-sm text-muted-foreground">Noch keine Regeln hinterlegt.</div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => {
                    const competency = rule.competencyId
                      ? competencies.find((comp) => comp.id === rule.competencyId)?.name
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
                      <div key={rule.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <div className="font-medium">{ruleLabel}</div>
                          {rule.notes && (
                            <div className="text-xs text-muted-foreground">{rule.notes}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.isActive !== false}
                            onCheckedChange={(checked) => handleRuleToggle(rule, Boolean(checked))}
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

  return (
    <Layout title="Urlaubsplan-Editor">
      {content}
    </Layout>
  );
}
