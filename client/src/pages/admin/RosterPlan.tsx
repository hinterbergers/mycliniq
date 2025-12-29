import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Printer, ArrowLeft, ArrowRight, Info, Loader2, Sparkles, ArrowRightLeft, CheckCircle2, AlertTriangle, Brain, Pencil } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { employeeApi, rosterApi, absenceApi, rosterSettingsApi } from "@/lib/api";
import type { Employee, RosterShift, Absence, RosterSettings } from "@shared/schema";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ShiftSwapDialog } from "@/components/ShiftSwapDialog";
import { getServiceTypesForEmployee, type ServiceType } from "@shared/shiftTypes";

interface GeneratedShift {
  date: string;
  serviceType: string;
  employeeId: number;
  employeeName: string;
}

const SERVICE_TYPES: Array<{ id: ServiceType; label: string; requiredRole: string[]; color: string }> = [
  { id: "gyn", label: "Gynäkologie", requiredRole: ["Primararzt", "1. Oberarzt", "Funktionsoberarzt", "Ausbildungsoberarzt", "Oberarzt", "Oberärztin"], color: "bg-primary/10 text-primary border-primary/20" },
  { id: "kreiszimmer", label: "Kreißzimmer", requiredRole: ["Assistenzarzt", "Assistenzärztin"], color: "bg-pink-100 text-pink-700 border-pink-200" },
  { id: "turnus", label: "Turnus", requiredRole: ["Assistenzarzt", "Assistenzärztin", "Turnusarzt"], color: "bg-emerald-100 text-emerald-700 border-emerald-200" }
];


export default function RosterPlan() {
  const { employee: currentUser, capabilities, isAdmin, isTechnicalAdmin } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [rosterSettings, setRosterSettings] = useState<RosterSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedShiftForSwap, setSelectedShiftForSwap] = useState<RosterShift | null>(null);
  
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [generatedShifts, setGeneratedShifts] = useState<GeneratedShift[]>([]);
  const [generationReasoning, setGenerationReasoning] = useState("");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});

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
    const allowedTypes = getServiceTypesForEmployee(employee);
    if (!allowedTypes.includes(type)) {
      reasons.push("Nicht für diesen Dienst einsetzbar");
    }
    if (employee.takesShifts === false) {
      reasons.push("Dienstplan berücksichtigen ist deaktiviert");
    }
    if (employee.isActive === false) {
      reasons.push("Mitarbeiter ist deaktiviert");
    }
    if (employee.inactiveFrom || employee.inactiveUntil) {
      const from = employee.inactiveFrom ? new Date(employee.inactiveFrom) : null;
      const until = employee.inactiveUntil ? new Date(employee.inactiveUntil) : null;
      const target = new Date(dateStr);
      if ((from && target >= from) || (until && target <= until)) {
        if (!from || !until || (from && until && target >= from && target <= until)) {
          reasons.push("Langzeit-Deaktivierung aktiv");
        }
      }
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
    return reasons;
  };

  const isPublished = useMemo(() => {
    if (!rosterSettings) return false;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    if (year < rosterSettings.lastApprovedYear) return true;
    if (year > rosterSettings.lastApprovedYear) return false;
    return month <= rosterSettings.lastApprovedMonth;
  }, [rosterSettings, currentDate]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');
      
      const [empData, shiftData, absenceData, settings] = await Promise.all([
        employeeApi.getAll(),
        rosterApi.getByMonth(year, month),
        absenceApi.getByDateRange(startDate, endDate),
        rosterSettingsApi.get()
      ]);
      
      setEmployees(empData);
      setShifts(shiftData);
      setAbsences(absenceData);
      setRosterSettings(settings);
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
    if (!manualEditMode) {
      setManualDrafts({});
    }
  }, [manualEditMode]);

  useEffect(() => {
    setManualDrafts({});
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

  const renderAssignmentCell = (date: Date, type: ServiceType, tone: "blue" | "pink" | "emerald") => {
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
        const label = employee ? employee.name.split(" ").pop() : freeText;
        return (
          <div className={`relative ${hasConflict ? "border border-red-300 bg-red-50/60" : ""} rounded`}>
            <div
              className={`text-sm px-2 py-1.5 rounded font-medium text-center border shadow-sm ${
                employee
                  ? tone === "pink"
                    ? "bg-pink-100 text-pink-800 border-pink-200"
                    : tone === "blue"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : "bg-emerald-100 text-emerald-800 border-emerald-200"
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
      .filter((emp) => getServiceTypesForEmployee(emp).includes(type))
      .sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name));
    const listId = `manual-assign-${type}`;
    const draftValue = manualDrafts[cellKey];
    const currentLabel = draftValue ?? employee?.name ?? freeText ?? "";

    return (
      <div className="relative">
        <Input
          value={currentLabel}
          onChange={(event) => {
            const nextValue = event.target.value;
            setManualDrafts((prev) => {
              if (!nextValue) {
                if (!prev[cellKey]) return prev;
                const next = { ...prev };
                delete next[cellKey];
                return next;
              }
              return { ...prev, [cellKey]: nextValue };
            });
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (!value) {
              handleManualAssign(date, type, null, null);
              return;
            }

            const normalized = value.toLowerCase();
            const exactMatch = allowedEmployees.find(
              (emp) => emp.name.toLowerCase() === normalized || emp.lastName?.toLowerCase() === normalized
            );
            if (exactMatch) {
              handleManualAssign(date, type, exactMatch.id, null);
              return;
            }

            const matches = allowedEmployees.filter((emp) => {
              const last = (emp.lastName || "").toLowerCase();
              const full = emp.name.toLowerCase();
              return last.startsWith(normalized) || full.startsWith(normalized);
            });

            if (matches.length === 1) {
              handleManualAssign(date, type, matches[0].id, null);
              return;
            }

            handleManualAssign(date, type, null, value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          list={listId}
          placeholder="+"
          className={`h-8 text-xs w-full min-w-0 ${hasConflict ? "border-red-400" : ""}`}
          disabled={isSaving}
        />
        <datalist id={listId}>
          {allowedEmployees.map((emp) => (
            <option key={emp.id} value={emp.name} />
          ))}
        </datalist>
        {hasConflict && (
          <div className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1">
            <AlertTriangle className="w-3 h-3" />
          </div>
        )}
      </div>
    );
  };
  
  const stats = useMemo(() => {
    return employees.map(emp => {
      const empShifts = shifts.filter(s => s.employeeId === emp.id);
      const empAbsences = absences.filter(a => a.employeeId === emp.id);
      return {
        ...emp,
        stats: {
          gyn: empShifts.filter(s => s.serviceType === 'gyn').length,
          geb: empShifts.filter(s => s.serviceType === 'kreiszimmer').length,
          tu: empShifts.filter(s => s.serviceType === 'turnus').length,
          sum: empShifts.length,
          abw: empAbsences.length
        }
      };
    });
  }, [employees, shifts, absences]);

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

  const handlePublish = async () => {
    if (!currentUser) return;
    setIsPublishing(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const updated = await rosterSettingsApi.update({
        lastApprovedYear: year,
        lastApprovedMonth: month,
        updatedById: currentUser.id
      });
      setRosterSettings(updated);
      toast({
        title: "Dienstplan freigegeben",
        description: `Der Dienstplan für ${format(currentDate, 'MMMM yyyy', { locale: de })} wurde veröffentlicht.`
      });
    } catch (error: any) {
      toast({
        title: "Freigabe fehlgeschlagen",
        description: error.message || "Bitte später erneut versuchen",
        variant: "destructive"
      });
    } finally {
      setIsPublishing(false);
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-xl kabeg-shadow">
          <div className="flex items-center gap-4">
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
              className={`hidden md:flex gap-1 ${isPublished ? "bg-green-50 text-green-700 border-green-200" : "bg-primary/10 text-primary border-primary/20"}`}
            >
              <Info className="w-3 h-3" />
              <span>Planungsstatus: {isPublished ? "Freigegeben" : "Entwurf"}</span>
            </Badge>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Button 
              variant="outline" 
              className="gap-2 flex-1 md:flex-none" 
              onClick={() => setSwapDialogOpen(true)}
              data-testid="button-swap-dialog"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Diensttausch
            </Button>
            <Button variant="outline" className="gap-2 flex-1 md:flex-none" data-testid="button-print">
              <Printer className="w-4 h-4" />
              Drucken
            </Button>
            <Button variant="outline" className="gap-2 flex-1 md:flex-none" data-testid="button-export-pdf">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            {canEdit && (
              <Button
                variant={manualEditMode ? "default" : "outline"}
                className="gap-2 flex-1 md:flex-none"
                onClick={() => setManualEditMode((prev) => !prev)}
                data-testid="button-manual-edit"
              >
                <Pencil className="w-4 h-4" />
                {manualEditMode ? "Manuelle Eingabe aktiv" : "Manuell bearbeiten"}
              </Button>
            )}
            {canEdit && (
              <Button 
                className="gap-2 flex-1 md:flex-none" 
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
            {canPublish && (
              <Button
                variant={isPublished ? "outline" : "default"}
                className="gap-2 flex-1 md:flex-none"
                onClick={handlePublish}
                disabled={isPublished || isPublishing}
                data-testid="button-publish-roster"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isPublished ? "Freigegeben" : "Freigeben"}
              </Button>
            )}
          </div>
        </div>

        {/* Main Roster Table */}
        <Card className="border-none kabeg-shadow overflow-hidden">
          {manualEditMode && canEdit && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Manuelle Eingabe aktiv. Konflikte werden markiert, Speicherung bleibt erlaubt.
            </div>
          )}
          <div className="overflow-x-auto">
            <Table className="border-collapse w-full min-w-[1200px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 text-center border-r border-border font-bold">KW</TableHead>
                  <TableHead className="w-12 text-center border-r border-border font-bold">Tag</TableHead>
                  <TableHead className="w-24 border-r border-border font-bold">Datum</TableHead>
                  
                  {/* Service Columns */}
                  <TableHead className="w-48 bg-pink-50/50 border-r border-pink-100 text-pink-900 font-bold text-center">
                    Kreißzimmer (Ass.)
                  </TableHead>
                  <TableHead className="w-48 bg-blue-50/50 border-r border-blue-100 text-blue-900 font-bold text-center">
                    Gynäkologie (OA)
                  </TableHead>
                  <TableHead className="w-48 bg-emerald-50/50 border-r border-emerald-100 text-emerald-900 font-bold text-center">
                    Turnus (Ass./TA)
                  </TableHead>
                  
                  {/* Absence Column */}
                  <TableHead className="min-w-[300px] bg-slate-50/50 text-slate-700 font-bold text-center">
                    Abwesenheiten / Info
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day) => {
                  const isWeekendDay = isWeekend(day);
                  const isHoliday = format(day, 'dd.MM') === '01.01' || format(day, 'dd.MM') === '06.01';
                  
                  // @ts-ignore
                  const absences = getAbsences(day);

                  return (
                    <TableRow key={day.toISOString()} className={`
                      ${isWeekendDay || isHoliday ? 'bg-slate-50/60' : 'bg-white'} 
                      hover:bg-slate-100/80 transition-colors border-b border-border/60
                    `}>
                      <TableCell className="text-center text-xs text-muted-foreground border-r border-border">
                        {format(day, 'w')}
                      </TableCell>
                      <TableCell className={`text-center font-medium border-r border-border ${isWeekendDay || isHoliday ? 'text-red-500' : ''}`}>
                        {format(day, 'EEE', { locale: de })}.
                      </TableCell>
                      <TableCell className={`border-r border-border ${isWeekendDay || isHoliday ? 'text-red-500 font-bold' : ''}`}>
                        {format(day, 'dd.MM.')}
                      </TableCell>

                      {/* Kreißzimmer Slot */}
                      <TableCell className="border-r border-border p-1">
                        {renderAssignmentCell(day, "kreiszimmer", "pink")}
                      </TableCell>

                      {/* Gyn Slot */}
                      <TableCell className="border-r border-border p-1">
                        {renderAssignmentCell(day, "gyn", "blue")}
                      </TableCell>

                      {/* Turnus Slot */}
                      <TableCell className="border-r border-border p-1">
                        {renderAssignmentCell(day, "turnus", "emerald")}
                      </TableCell>

                      {/* Absences & Info */}
                      <TableCell className="p-1 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {isHoliday && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 mr-2">
                              {format(day, 'dd.MM') === '01.01' ? 'Neujahr' : 'Hl. 3 Könige'}
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
                    <TableHead className="text-center text-blue-700 bg-blue-50/50">Gyn</TableHead>
                    <TableHead className="text-center text-pink-700 bg-pink-50/50">Geb</TableHead>
                    <TableHead className="text-center text-emerald-700 bg-emerald-50/50">Turnus</TableHead>
                    <TableHead className="text-center font-bold">Summe</TableHead>
                    <TableHead className="text-center text-slate-500 bg-slate-50/50">Abwesend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.slice(0, 10).map(emp => (
                    <TableRow key={emp.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {emp.name.split(' ').pop()?.substring(0, 2).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/20">{emp.stats.gyn}</TableCell>
                      <TableCell className="text-center bg-pink-50/20">{emp.stats.geb}</TableCell>
                      <TableCell className="text-center bg-emerald-50/20">{emp.stats.tu}</TableCell>
                      <TableCell className="text-center font-bold">{emp.stats.sum}</TableCell>
                      <TableCell className="text-center text-slate-500 bg-slate-50/20">{emp.stats.abw}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <ShiftSwapDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          sourceShift={selectedShiftForSwap}
          onSwapComplete={() => {
            loadData();
            setSelectedShiftForSwap(null);
          }}
        />

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
                      {generatedShifts.map((shift, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">
                            {shift.date}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={
                                shift.serviceType === 'gyn' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                shift.serviceType === 'kreiszimmer' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                                'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }
                            >
                              {shift.serviceType === 'gyn' ? 'Gynäkologie' :
                               shift.serviceType === 'kreiszimmer' ? 'Kreißzimmer' : 'Turnus'}
                            </Badge>
                          </TableCell>
                          <TableCell>{shift.employeeName}</TableCell>
                        </TableRow>
                      ))}
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
