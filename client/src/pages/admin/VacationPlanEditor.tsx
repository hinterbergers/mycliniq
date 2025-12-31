import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  absenceApi,
  competencyApi,
  employeeApi,
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
import type { Competency, Employee, VacationRule } from "@shared/schema";

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
  Krankenstand: { bg: "bg-red-200", label: "K" },
  Zeitausgleich: { bg: "bg-amber-200", label: "Z" },
  Pflegeurlaub: { bg: "bg-orange-200", label: "P" },
  Geb\u00fchrenurlaub: { bg: "bg-lime-200", label: "G" },
  Sonderurlaub: { bg: "bg-teal-200", label: "S" },
  Zusatzurlaub: { bg: "bg-cyan-200", label: "Z" },
  Quarant\u00e4ne: { bg: "bg-fuchsia-200", label: "Q" },
  Ruhezeit: { bg: "bg-slate-200", label: "R" }
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

const ROLE_GROUPS: Record<string, "OA" | "ASS" | "TA" | null> = {
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
  Sekretariat: null
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

export default function VacationPlanEditor() {
  const { employee: currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [quarter, setQuarter] = useState(() => Math.floor(new Date().getMonth() / 3));
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
  const [loading, setLoading] = useState(true);
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [absences, setAbsences] = useState<PlannedAbsenceAdmin[]>([]);
  const [rules, setRules] = useState<VacationRule[]>([]);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [holidayLocation, setHolidayLocation] = useState<SchoolHolidayLocation>({
    country: "AT",
    state: "AT-2"
  });
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

      const [employeeData, competencyData, absenceData, ruleData, clinicData] = await Promise.all([
        employeeApi.getAll(),
        competencyApi.getAll(),
        plannedAbsencesAdminApi.getRange({ from: yearStart, to: yearEnd }),
        vacationRulesApi.getAll(currentUser?.departmentId ?? undefined),
        clinicPromise
      ]);
      setEmployees(employeeData);
      setCompetencies(competencyData);
      setAbsences(absenceData);
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

  const absencesByEmployee = useMemo(() => {
    const map = new Map<number, PlannedAbsenceAdmin[]>();
    activeAbsences.forEach((absence) => {
      const list = map.get(absence.employeeId) ?? [];
      list.push(absence);
      map.set(absence.employeeId, list);
    });
    return map;
  }, [activeAbsences]);

  const getAbsenceForEmployeeOnDate = (employeeId: number, dateStr: string) => {
    const list = absencesByEmployee.get(employeeId) ?? [];
    return list.find((absence) => absence.startDate <= dateStr && absence.endDate >= dateStr) ?? null;
  };

  const dayAbsenceMap = useMemo(() => {
    const map = new Map<string, PlannedAbsenceAdmin[]>();
    days.forEach((date) => {
      const key = formatDateInput(date);
      const list = activeAbsences.filter(
        (absence) => absence.startDate <= key && absence.endDate >= key
      );
      map.set(key, list);
    });
    return map;
  }, [activeAbsences, days]);

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
      const dayAbsences = dayAbsenceMap.get(dateKey) ?? [];
      const absentIds = new Set(dayAbsences.map((absence) => absence.employeeId));
      const presentEmployees = sortedEmployees.filter(
        (emp) => !absentIds.has(emp.id) && emp.takesShifts !== false
      );

      const roleCounts: Record<string, number> = { OA: 0, ASS: 0, TA: 0 };
      presentEmployees.forEach((emp) => {
        const group = ROLE_GROUPS[normalizeRole(emp.role)] ?? null;
        if (group) {
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
  }, [competencies, dayAbsenceMap, days, rules, sortedEmployees]);

  const conflictDates = useMemo(() => new Set(conflicts.map((c) => c.date)), [conflicts]);

  const quarterAbsences = useMemo(() => {
    const start = formatDateInput(quarterStart);
    const end = formatDateInput(quarterEnd);
    return absences.filter((absence) => absence.startDate <= end && absence.endDate >= start);
  }, [absences, quarterStart, quarterEnd]);

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

  return (
    <Layout title="Urlaubsplan-Editor">
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
                              {sortedEmployees.map((emp) => (
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
                    {sortedEmployees.map((emp) => {
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
      </div>
    </Layout>
  );
}
