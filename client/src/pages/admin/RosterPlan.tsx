import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Download, ArrowLeft, ArrowRight, Info, Loader2, Sparkles, CheckCircle2, AlertTriangle, Brain, Pencil, Calendar } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { employeeApi, rosterApi, absenceApi, longTermAbsencesApi, dutyPlansApi, rosterSettingsApi, serviceLinesApi, type NextPlanningMonth } from "@/lib/api";
import type { Employee, RosterShift, Absence, LongTermAbsence, DutyPlan, ServiceLine } from "@shared/schema";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getServiceTypesForEmployee, employeeDoesShifts, type ServiceType } from "@shared/shiftTypes";
import { getAustrianHoliday } from "@/lib/holidays";

interface GeneratedShift {
  date: string;
  serviceType: string;
  employeeId: number;
  employeeName: string;
}

const SERVICE_LINE_PALETTE = [
  {
    header: "bg-pink-50/50 border-pink-100 text-pink-900",
    cell: "bg-pink-100 text-pink-800 border-pink-200",
    stat: "bg-pink-50/20 text-pink-900"
  },
  {
    header: "bg-blue-50/50 border-blue-100 text-blue-900",
    cell: "bg-blue-100 text-blue-800 border-blue-200",
    stat: "bg-blue-50/20 text-blue-900"
  },
  {
    header: "bg-emerald-50/50 border-emerald-100 text-emerald-900",
    cell: "bg-emerald-100 text-emerald-800 border-emerald-200",
    stat: "bg-emerald-50/20 text-emerald-900"
  },
  {
    header: "bg-violet-50/50 border-violet-100 text-violet-900",
    cell: "bg-violet-100 text-violet-800 border-violet-200",
    stat: "bg-violet-50/20 text-violet-900"
  },
  {
    header: "bg-amber-50/50 border-amber-100 text-amber-900",
    cell: "bg-amber-100 text-amber-800 border-amber-200",
    stat: "bg-amber-50/20 text-amber-900"
  },
  {
    header: "bg-sky-50/50 border-sky-100 text-sky-900",
    cell: "bg-sky-100 text-sky-800 border-sky-200",
    stat: "bg-sky-50/20 text-sky-900"
  }
];

const FALLBACK_SERVICE_LINES = [
  { key: "kreiszimmer", label: "Kreißzimmer (Ass.)", roleGroup: "ASS", sortOrder: 1, isActive: true },
  { key: "gyn", label: "Gynäkologie (OA)", roleGroup: "OA", sortOrder: 2, isActive: true },
  { key: "turnus", label: "Turnus (Ass./TA)", roleGroup: "TURNUS", sortOrder: 3, isActive: true },
  { key: "overduty", label: "Überdienst (Ruf)", roleGroup: "OA", sortOrder: 4, isActive: true }
];

const PLAN_STATUS_LABELS: Record<DutyPlan["status"], string> = {
  Entwurf: "Bearbeitung",
  Vorläufig: "Vorschau",
  Freigegeben: "Freigabe"
};

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

const ROLE_SORT_ORDER: Record<string, number> = {
  "Primararzt": 1,
  "1. Oberarzt": 2,
  "Funktionsoberarzt": 3,
  "Ausbildungsoberarzt": 4,
  "Oberarzt": 5,
  "Oberärztin": 5,
  "Facharzt": 6,
  "Assistenzarzt": 7,
  "Assistenzärztin": 7,
  "Turnusarzt": 8,
  "Student (KPJ)": 9,
  "Student (Famulant)": 9
};

const normalizeRoleValue = (role?: string | null) => {
  if (!role) return "";
  if (role === "Oberärztin") return "Oberarzt";
  if (role === "Assistenzärztin") return "Assistenzarzt";
  return role;
};

const getRoleSortRank = (role?: string | null) => ROLE_SORT_ORDER[normalizeRoleValue(role)] ?? 999;

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

export default function RosterPlan() {
  const { employee: currentUser, capabilities, isAdmin, isTechnicalAdmin, token } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>([]);
  const [dutyPlan, setDutyPlan] = useState<DutyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [generatedShifts, setGeneratedShifts] = useState<GeneratedShift[]>([]);
  const [generationReasoning, setGenerationReasoning] = useState("");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(null);
  const [wishDialogOpen, setWishDialogOpen] = useState(false);
  const [wishMonth, setWishMonth] = useState<number>(currentDate.getMonth() + 1);
  const [wishYear, setWishYear] = useState<number>(currentDate.getFullYear());
  const [wishSaving, setWishSaving] = useState(false);
  const planStatus = dutyPlan?.status ?? "Entwurf";
  const planStatusLabel = PLAN_STATUS_LABELS[planStatus];

  const serviceLineDisplay = useMemo(() => {
    const lines = serviceLines.length ? serviceLines : FALLBACK_SERVICE_LINES;
    const shiftKeys = new Set(shifts.map((shift) => shift.serviceType));
    const knownKeys = new Set(lines.map((line) => line.key));
    const extras = [...shiftKeys]
      .filter((key) => !knownKeys.has(key))
      .map((key) => ({ key, label: key, sortOrder: 999, isActive: true }));
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
        roleGroup: line.roleGroup,
        style: SERVICE_LINE_PALETTE[index % SERVICE_LINE_PALETTE.length]
      }));
  }, [serviceLines, shifts]);

  const serviceLineMeta = useMemo(
    () => serviceLineDisplay.map((line) => ({ key: line.key, roleGroup: line.roleGroup })),
    [serviceLineDisplay]
  );

  const serviceLineLookup = useMemo(() => {
    return new Map(serviceLineDisplay.map((line) => [line.key, line]));
  }, [serviceLineDisplay]);

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

  const yearOptions = useMemo(() => {
    const baseYear = currentDate.getFullYear();
    return [baseYear, baseYear + 1, baseYear + 2];
  }, [currentDate]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  const getShiftForDay = (date: Date, type: ServiceType) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.find((s) => s.date === dateStr && s.serviceType === type);
  };

  const getEmployeeById = (id?: number | null) => {
    if (!id) return null;
    return employees.find((e) => e.id === id) || null;
  };

  const getConflictReasons = (employee: Employee | null, dateStr: string, type: ServiceType) => {
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
    const hasAbsence = absences.some(
      (absence) =>
        absence.employeeId === employee.id &&
        absence.startDate <= dateStr &&
        absence.endDate >= dateStr
    );
    if (hasAbsence) {
      reasons.push("Abwesenheit eingetragen");
    }
    const hasLongTermAbsence = longTermAbsences.some(
      (absence) =>
        absence.employeeId === employee.id &&
        absence.startDate <= dateStr &&
        absence.endDate >= dateStr
    );
    if (hasLongTermAbsence) {
      reasons.push("Langzeit-Abwesenheit genehmigt");
    }
    if (employee.inactiveFrom || employee.inactiveUntil) {
      const from = employee.inactiveFrom ? new Date(employee.inactiveFrom) : null;
      const until = employee.inactiveUntil ? new Date(employee.inactiveUntil) : null;
      const target = new Date(dateStr);
      if ((from && target >= from) || (until && target <= until)) {
        if (!from || !until || (from && until && target >= from && target <= until)) {
          reasons.push("Langzeit-Deaktivierung (Legacy)");
        }
      }
    }
    return reasons;
  };

  const isPublished = planStatus === "Freigegeben";

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');
      
      const [empData, shiftData, absenceData, plan] = await Promise.all([
        employeeApi.getAll(),
        rosterApi.getByMonth(year, month),
        absenceApi.getByDateRange(startDate, endDate),
        dutyPlansApi.getByMonth(year, month)
      ]);
      let serviceLineData: ServiceLine[] = [];
      try {
        serviceLineData = await serviceLinesApi.getAll();
      } catch {
        serviceLineData = [];
      }

      let longTermAbsenceData: LongTermAbsence[] = [];
      try {
        longTermAbsenceData = await longTermAbsencesApi.getByStatus("Genehmigt", startDate, endDate);
      } catch {
        longTermAbsenceData = [];
      }
      
      setEmployees(empData);
      setServiceLines(serviceLineData);
      setShifts(shiftData);
      setAbsences(absenceData);
      setLongTermAbsences(longTermAbsenceData);
      setDutyPlan(plan);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({ title: "Fehler beim Laden", description: "Daten konnten nicht geladen werden", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, toast]);

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

  const getAbsences = (date: Date): { empId: number; name: string; reason: string }[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return absences
      .filter(a => a.startDate <= dateStr && a.endDate >= dateStr)
      .map(a => {
        const emp = employees.find(e => e.id === a.employeeId);
        return { empId: a.employeeId, name: emp?.name || 'Unbekannt', reason: a.reason };
      });
  };

  const renderAssignmentCell = (
    date: Date,
    line: {
      key: ServiceType;
      label: string;
      style: { cell: string };
    }
  ) => {
    const type = line.key;
    const shift = getShiftForDay(date, type);
    const employee = shift ? getEmployeeById(shift.employeeId) : null;
    const freeText = shift?.assigneeFreeText?.trim() || "";
    const dateStr = format(date, "yyyy-MM-dd");
    const conflictReasons = employee ? getConflictReasons(employee, dateStr, type) : [];
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
        return (
          <div className={`relative ${hasConflict ? "border border-red-300 bg-red-50/60" : ""} rounded`}>
            <div
              className={`text-sm px-2 py-1.5 rounded font-medium text-center border shadow-sm ${
                employee ? line.style.cell : "bg-slate-100 text-slate-700 border-slate-200 italic"
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
      .filter((emp) => getServiceTypesForEmployee(emp, serviceLineMeta).includes(type))
      .sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name));
    const draftValue = manualDrafts[cellKey];
    const currentLabel = draftValue ?? employee?.name ?? freeText ?? "";
    const isActive = activeCellKey === cellKey;
    const normalizedInput = currentLabel.trim().toLowerCase();
    const suggestions = normalizedInput
      ? allowedEmployees.filter((emp) => {
          const last = (emp.lastName || "").toLowerCase();
          const full = emp.name.toLowerCase();
          return last.includes(normalizedInput) || full.includes(normalizedInput);
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
                    (emp.name.toLowerCase() === normalized || emp.lastName?.toLowerCase() === normalized)
                );
                if (blockedMatch) {
                  toast({
                    title: "Nicht einsetzbar",
                    description: `${blockedMatch.name} ist im Dienstplan deaktiviert.`,
                    variant: "destructive"
                  });
                  clearManualDraft(cellKey);
                  setActiveCellKey(null);
                  return;
                }
                const exactMatch = allowedEmployees.find(
                  (emp) => emp.name.toLowerCase() === normalized || emp.lastName?.toLowerCase() === normalized
                );
                if (exactMatch) {
                  handleManualAssign(date, type, exactMatch.id, null);
                  setActiveCellKey(null);
                  return;
                }

                const matches = allowedEmployees.filter((emp) => {
                  const last = (emp.lastName || "").toLowerCase();
                  const full = emp.name.toLowerCase();
                  return last.startsWith(normalized) || full.startsWith(normalized);
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
                <span className="ml-2 text-[10px] text-muted-foreground">{emp.role}</span>
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
        const empAbsences = absences.filter((a) => a.employeeId === emp.id);
        const byService = serviceKeys.reduce<Record<string, number>>((acc, key) => {
          acc[key] = empShifts.filter((s) => s.serviceType === key).length;
          return acc;
        }, {});
        return {
          ...emp,
          stats: {
            byService,
            sum: empShifts.length,
            abw: empAbsences.length
          }
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
  }, [employees, shifts, absences, serviceLineDisplay, serviceLineMeta]);

  const statsRows = useMemo(() => {
    const rows: Array<{ type: "separator" } | { type: "data"; emp: typeof stats[number] }> = [];
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
        description: "Bitte melden Sie sich erneut an, um den Dienstplan zu exportieren.",
        variant: "destructive"
      });
      return;
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setExporting(true);
    try {
      const response = await fetch(`/api/roster/export?year=${year}&month=${month}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error("Export fehlgeschlagen");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dienstplan-${year}-${String(month).padStart(2, "0")}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Export fehlgeschlagen",
        description: error.message || "Bitte versuchen Sie es erneut.",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    toast({ title: "KI-Generierung", description: "Dienstplan wird automatisch erstellt..." });
    
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      
      const result = await rosterApi.generate(year, month);
      
      if (result.success) {
        setGeneratedShifts(result.shifts);
        setGenerationReasoning(result.reasoning);
        setGenerationWarnings(result.warnings);
        setGenerationDialogOpen(true);
        toast({ 
          title: "Generierung erfolgreich", 
          description: `${result.generatedShifts} Dienste wurden erstellt` 
        });
      }
    } catch (error: any) {
      console.error("Generation failed:", error);
      toast({ 
        title: "Generierung fehlgeschlagen", 
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyGenerated = async () => {
    setIsApplying(true);
    
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      
      const result = await rosterApi.applyGenerated(year, month, generatedShifts, true);
      
      if (result.success) {
        toast({ 
          title: "Dienstplan übernommen", 
          description: result.message 
        });
        setGenerationDialogOpen(false);
        loadData();
      }
    } catch (error: any) {
      toast({ 
        title: "Übernahme fehlgeschlagen", 
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive"
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleManualAssign = async (
    date: Date,
    type: ServiceType,
    nextEmployeeId?: number | null,
    assigneeFreeText?: string | null
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
        if (shift) {
          const updated = await rosterApi.update(shift.id, {
            employeeId,
            assigneeFreeText: employeeId ? null : trimmedFreeText
          });
          setShifts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
          clearManualDraft(cellKey);
        } else {
          const created = await rosterApi.create({
            employeeId,
            assigneeFreeText: employeeId ? null : trimmedFreeText,
            date: dateStr,
            serviceType: type
          });
          setShifts((prev) => [...prev, created]);
          clearManualDraft(cellKey);
        }
      }
    } catch (error: any) {
      toast({
        title: "Speichern fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive"
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
            generatedById: currentUser.id
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
        nextStatus === "Freigegeben" ? currentUser.id : null
      );
      setDutyPlan(updated);
      toast({
        title: "Status aktualisiert",
        description: `Dienstplan ist jetzt ${PLAN_STATUS_LABELS[updated.status]}.`
      });
    } catch (error: any) {
      toast({
        title: "Status-Update fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive"
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
        description: `Dienstwünsche sind jetzt für ${MONTH_NAMES[wishMonth - 1]} ${wishYear} geöffnet.`
      });
      setWishDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Freischaltung fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive"
      });
    } finally {
      setWishSaving(false);
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
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="font-bold w-40 text-center text-lg">{format(currentDate, 'MMMM yyyy', { locale: de })}</span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
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
            {canEdit && (
              <Button
                variant={manualEditMode ? "default" : "outline"}
                className="gap-2"
                onClick={() => setManualEditMode((prev) => !prev)}
                data-testid="button-manual-edit"
              >
                <Pencil className="w-4 h-4" />
                {manualEditMode ? "Manuelle Eingabe aktiv" : "Manuell bearbeiten"}
              </Button>
            )}
            {canEdit && (
              <Button
                className="gap-2"
                onClick={handleAutoGenerate}
                disabled={isGenerating}
                data-testid="button-auto-generate"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Auto-Generieren
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
                {isStatusUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
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
                {isStatusUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
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
                {isStatusUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                Bearbeitung
              </Button>
            )}
            {canPublish && (
              <Button
                variant={isPublished ? "outline" : "default"}
                className="gap-2"
                onClick={() => handleUpdatePlanStatus("Freigegeben")}
                disabled={isPublished || planStatus !== "Vorläufig" || isStatusUpdating}
                data-testid="button-publish-roster"
              >
                {isStatusUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
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
                Legt den Monat fest, für den Dienstwünsche eingegeben werden können.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {planningMonth && (
                <div className="text-sm text-muted-foreground">
                  Aktuell freigeschaltet: {MONTH_NAMES[planningMonth.month - 1]} {planningMonth.year}
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
              <Button variant="outline" onClick={() => setWishDialogOpen(false)} disabled={wishSaving}>
                Abbrechen
              </Button>
              <Button onClick={handleSetWishMonth} disabled={wishSaving}>
                {wishSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Freigeben
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main Roster Table */}
        <Card className="border-none kabeg-shadow overflow-hidden">
          {manualEditMode && canEdit && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Manuelle Eingabe aktiv. Konflikte werden markiert, Speicherung bleibt erlaubt.
            </div>
          )}
          <div className="overflow-x-auto overflow-y-visible">
            <Table className="border-collapse w-full min-w-[1400px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 text-center border-r border-border font-bold">KW</TableHead>
                  <TableHead className="w-12 text-center border-r border-border font-bold">Tag</TableHead>
                  <TableHead className="w-24 border-r border-border font-bold">Datum</TableHead>
                  
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
                  <TableHead className="min-w-[300px] bg-slate-50/50 text-slate-700 font-bold text-center">
                    Abwesenheiten / Info
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day) => {
                  const isWeekendDay = isWeekend(day);
                  const holiday = getAustrianHoliday(day);
                  const isHoliday = Boolean(holiday);
                  
                  // @ts-ignore
                  const absences = getAbsences(day);

                  return (
                    <TableRow key={day.toISOString()} className={`
                      ${isWeekendDay || isHoliday ? 'bg-amber-50/60' : 'bg-white'} 
                      hover:bg-slate-100/80 transition-colors border-b border-border/60
                    `}>
                      <TableCell className="text-center text-xs text-muted-foreground border-r border-border">
                        {format(day, 'w')}
                      </TableCell>
                      <TableCell className={`text-center font-medium border-r border-border ${isWeekendDay || isHoliday ? 'text-rose-600' : ''}`}>
                        {format(day, 'EEE', { locale: de })}.
                      </TableCell>
                      <TableCell className={`border-r border-border ${isWeekendDay || isHoliday ? 'text-rose-600 font-bold' : ''}`}>
                        {format(day, 'dd.MM.')}
                      </TableCell>

                      {serviceLineDisplay.map((line) => (
                        <TableCell key={line.key} className="border-r border-border p-1">
                          {renderAssignmentCell(day, line)}
                        </TableCell>
                      ))}

                      {/* Absences & Info */}
                      <TableCell className="p-1 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {isHoliday && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 mr-2">
                              {holiday?.name}
                            </Badge>
                          )}
                          {/* @ts-ignore */}
                          {absences.map((ab, idx) => (
                            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="font-bold mr-1">{ab.name.substring(0, 2).toUpperCase()}</span>
                              <span className="opacity-70">{ab.reason}</span>
                            </span>
                          ))}
                        </div>
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
            <CardTitle className="text-lg">Dienststatistik Jänner 2026</CardTitle>
            <CardDescription>Übersicht der Dienste und Abwesenheiten pro Mitarbeiter</CardDescription>
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
                    <TableHead className="text-center font-bold">Summe</TableHead>
                    <TableHead className="text-center text-slate-500 bg-slate-50/50">Abwesend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsRows.map((row, index) => {
                    if (row.type === "separator") {
                      return (
                        <TableRow key={`sep-${index}`} className="bg-transparent">
                          <TableCell colSpan={statsColumnCount} className="p-0">
                            <div className="border-t border-slate-200" />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const emp = row.emp;
                    return (
                      <TableRow key={emp.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {emp.name.split(' ').pop()?.substring(0, 2).toUpperCase()}
                        </TableCell>
                        {serviceLineDisplay.map((line) => (
                          <TableCell key={line.key} className={`text-center ${line.style.stat}`}>
                            {emp.stats.byService[line.key] ?? 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold">{emp.stats.sum}</TableCell>
                        <TableCell className="text-center text-slate-500 bg-slate-50/20">{emp.stats.abw}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* AI Generation Results Dialog */}
        <Dialog open={generationDialogOpen} onOpenChange={setGenerationDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                KI-generierter Dienstplan - {format(currentDate, 'MMMM yyyy', { locale: de })}
              </DialogTitle>
              <DialogDescription>
                Überprüfen Sie den generierten Plan und übernehmen Sie ihn in den Dienstplan
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
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

              {/* Generated Shifts Preview */}
              <div className="border rounded-lg">
                <div className="p-3 bg-muted/30 border-b flex justify-between items-center">
                  <span className="font-medium">Generierte Dienste</span>
                  <Badge variant="secondary">{generatedShifts.length} Dienste</Badge>
                </div>
                <ScrollArea className="h-[300px]">
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
                        const badgeClass = line?.style.cell || "bg-slate-100 text-slate-700 border-slate-200";
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
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setGenerationDialogOpen(false)}>
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
    </Layout>
  );
}
