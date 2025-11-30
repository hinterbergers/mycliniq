import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Download, Printer, Edit2, Lock, Loader2, Check } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, eachDayOfInterval, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { employeeApi, weeklyAssignmentApi } from "@/lib/api";
import type { Employee, WeeklyAssignment, InsertWeeklyAssignment } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { useAuth } from "@/lib/auth";

const WEEK_DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const EDIT_ALLOWED_ROLES = ["Primararzt", "1. Oberarzt", "Sekretariat"];
const EDIT_ALLOWED_APP_ROLES = ["Admin", "Editor"];

interface SlotDef {
  id: string;
  label: string;
  roleFilter: string[];
}

interface AreaDef {
  name: string;
  slots: SlotDef[];
}

interface SectionDef {
  section: string;
  areas: AreaDef[];
}

const WEEK_STRUCTURE: SectionDef[] = [
  {
    section: "Stationen",
    areas: [
      {
        name: "Geburtshilfl. Bettenstation - Kreißsaal",
        slots: [
          { id: "geb-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt"] },
          { id: "geb-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "geb-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      },
      {
        name: "Gynäkologische Bettenstation",
        slots: [
          { id: "gyn-station-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt"] },
          { id: "gyn-station-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "gyn-station-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      }
    ]
  },
  {
    section: "Schwangerenambulanz",
    areas: [
      { name: "Risikoambulanz 1", slots: [{ id: "risk1", label: "", roleFilter: ["Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "Risikoambulanz 2", slots: [{ id: "risk2", label: "", roleFilter: ["Oberarzt", "Oberärztin"] }] },
      { name: "Schwangerensprechstunde", slots: [{ id: "schwanger", label: "", roleFilter: ["Assistenzarzt", "Assistenzärztin"] }] }
    ]
  },
  {
    section: "Gynäkologische Ambulanz",
    areas: [
      { name: "GYN 1 (Vulva, Dysplasie, Chef)", slots: [{ id: "gyn1", label: "OA / Ass", roleFilter: ["Primararzt", "Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "GYN 2 (Bestell-/Notfallambulanz, TNS)", slots: [{ id: "gyn2", label: "OA / Ass", roleFilter: ["Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "GYN 3 (Bestell-/Notfallambulanz, Uro)", slots: [{ id: "gyn3", label: "", roleFilter: ["Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "TU / KPJ", slots: [{ id: "gyn-tu", label: "", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }] },
      { name: "Mamma", slots: [{ id: "mamma", label: "", roleFilter: ["Oberarzt", "Oberärztin"] }] }
    ]
  },
  {
    section: "OP",
    areas: [
      {
        name: "OP 1 TCH",
        slots: [
          { id: "op1-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt", "Primararzt"] },
          { id: "op1-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "op1-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      },
      {
        name: "OP 2",
        slots: [
          { id: "op2-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt", "Primararzt"] },
          { id: "op2-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "op2-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      }
    ]
  },
  {
    section: "Verwaltung / Organisation",
    areas: [
      { name: "Teamleitung", slots: [{ id: "teamleitung", label: "", roleFilter: ["1. Oberarzt", "Primararzt"] }] },
      { name: "OP-Koordination", slots: [{ id: "op-koord", label: "", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt"] }] },
      { name: "Qualitätsmanagement", slots: [{ id: "qm", label: "", roleFilter: ["Oberarzt", "Oberärztin"] }] }
    ]
  },
  {
    section: "Abwesenheiten",
    areas: [
      { name: "Urlaub", slots: [{ id: "urlaub", label: "", roleFilter: [] }] },
      { name: "RZ (Ruhezeit)", slots: [{ id: "rz", label: "", roleFilter: [] }] },
      { name: "ZA (Zeitausgleich)", slots: [{ id: "za", label: "", roleFilter: [] }] },
      { name: "FB (Fortbildung)", slots: [{ id: "fb", label: "", roleFilter: [] }] }
    ]
  },
  {
    section: "Dienstfrei",
    areas: [
      {
        name: "Frei nach Dienst",
        slots: [
          { id: "frei-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt", "Primararzt"] },
          { id: "frei-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "frei-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      }
    ]
  }
];

type AssignmentMap = Record<string, Record<string, { employeeId: number | null; notes: string; isClosed: boolean }>>;

const KEY_DELIMITER = "|||";
const makeKey = (section: string, area: string, slot: string) => `${section}${KEY_DELIMITER}${area}${KEY_DELIMITER}${slot}`;
const parseKey = (key: string) => {
  const parts = key.split(KEY_DELIMITER);
  return { section: parts[0], area: parts[1], slot: parts[2] };
};

export default function WeeklyPlan() {
  const { employee: currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<AssignmentMap>({});
  const [originalAssignments, setOriginalAssignments] = useState<AssignmentMap>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    return EDIT_ALLOWED_ROLES.includes(currentUser.role) || 
           EDIT_ALLOWED_APP_ROLES.includes(currentUser.appRole);
  }, [currentUser]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNumber = getWeek(currentDate, { weekStartsOn: 1 });
  const weekYear = getYear(weekStart);
  
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [empData, assignmentData] = await Promise.all([
        employeeApi.getAll(),
        weeklyAssignmentApi.getByWeek(weekYear, weekNumber)
      ]);
      
      setEmployees(empData);
      
      const assignmentMap: AssignmentMap = {};
      assignmentData.forEach((a: WeeklyAssignment) => {
        const key = makeKey(a.area, a.subArea, a.roleSlot);
        if (!assignmentMap[key]) assignmentMap[key] = {};
        assignmentMap[key][a.dayOfWeek.toString()] = {
          employeeId: a.employeeId,
          notes: a.notes || "",
          isClosed: a.isClosed
        };
      });
      
      setAssignments(assignmentMap);
      setOriginalAssignments(JSON.parse(JSON.stringify(assignmentMap)));
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({ title: "Fehler beim Laden", description: "Daten konnten nicht geladen werden", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [weekYear, weekNumber, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getAssignment = (slotId: string, sectionName: string, areaName: string, dayIndex: number) => {
    const key = makeKey(sectionName, areaName, slotId);
    return assignments[key]?.[dayIndex.toString()];
  };

  const setAssignment = (slotId: string, sectionName: string, areaName: string, dayIndex: number, value: { employeeId: number | null; notes: string; isClosed: boolean }) => {
    const key = makeKey(sectionName, areaName, slotId);
    setAssignments(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [dayIndex.toString()]: value
      }
    }));
  };

  const getDisplayValue = (slotId: string, sectionName: string, areaName: string, dayIndex: number): string => {
    const assignment = getAssignment(slotId, sectionName, areaName, dayIndex);
    if (!assignment) return "";
    if (assignment.isClosed) return "geschlossen";
    if (assignment.notes) return assignment.notes;
    if (assignment.employeeId) {
      const emp = employees.find(e => e.id === assignment.employeeId);
      return emp ? emp.name.split(" ").pop() || emp.name : "";
    }
    return "";
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const assignmentsToSave: InsertWeeklyAssignment[] = [];
      
      Object.entries(assignments).forEach(([key, dayAssignments]) => {
        const { section, area, slot } = parseKey(key);
        Object.entries(dayAssignments).forEach(([dayStr, value]) => {
          assignmentsToSave.push({
            weekYear,
            weekNumber,
            dayOfWeek: parseInt(dayStr),
            area: section,
            subArea: area,
            roleSlot: slot,
            employeeId: value.employeeId,
            notes: value.notes || null,
            isClosed: value.isClosed
          });
        });
      });

      await weeklyAssignmentApi.bulkSave(assignmentsToSave);
      setOriginalAssignments(JSON.parse(JSON.stringify(assignments)));
      setIsEditing(false);
      toast({ title: "Gespeichert", description: "Wochenplan wurde erfolgreich gespeichert" });
    } catch (error) {
      console.error("Failed to save:", error);
      toast({ title: "Fehler beim Speichern", description: "Änderungen konnten nicht gespeichert werden", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setAssignments(JSON.parse(JSON.stringify(originalAssignments)));
    setIsEditing(false);
    setEditingCell(null);
  };

  const getCellStyle = (value: string) => {
    if (value === "geschlossen") return "bg-gray-100 text-gray-500 italic";
    if (value.includes("Sectio")) return "bg-pink-50 text-pink-700 font-medium";
    return "";
  };

  const handleCellSelect = (slotId: string, sectionName: string, areaName: string, dayIndex: number, value: string, slot: SlotDef) => {
    if (value === "empty") {
      setAssignment(slotId, sectionName, areaName, dayIndex, { employeeId: null, notes: "", isClosed: false });
    } else if (value === "closed") {
      setAssignment(slotId, sectionName, areaName, dayIndex, { employeeId: null, notes: "", isClosed: true });
    } else {
      const empId = parseInt(value);
      setAssignment(slotId, sectionName, areaName, dayIndex, { employeeId: empId, notes: "", isClosed: false });
    }
    setEditingCell(null);
  };

  if (isLoading) {
    return (
      <Layout title="Einsatzplanung">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Einsatzplanung">
      <div className="space-y-4">
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card p-4 rounded-xl kabeg-shadow">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))} data-testid="button-prev-week">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-56 text-center">
                <span className="font-bold text-lg" data-testid="text-week-number">KW {weekNumber}</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {format(weekStart, "dd.MM.", { locale: de })} - {format(weekEnd, "dd.MM.yyyy", { locale: de })}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))} data-testid="button-next-week">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Abteilung Frauenheilkunde und Geburtshilfe
            </Badge>
          </div>

          <div className="flex gap-2 w-full lg:w-auto">
            {isEditing ? (
              <>
                <Button 
                  variant="outline" 
                  className="gap-2 flex-1 lg:flex-none"
                  onClick={handleCancel}
                  disabled={isSaving}
                  data-testid="button-cancel"
                >
                  Abbrechen
                </Button>
                <Button 
                  className="gap-2 flex-1 lg:flex-none"
                  onClick={handleSave}
                  disabled={isSaving}
                  data-testid="button-save"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Speichern
                </Button>
              </>
            ) : (
              <>
                {canEdit ? (
                  <Button 
                    variant="outline" 
                    className="gap-2 flex-1 lg:flex-none"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit"
                  >
                    <Edit2 className="w-4 h-4" />
                    Bearbeiten
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="gap-2 flex-1 lg:flex-none opacity-50 cursor-not-allowed"
                        disabled
                        data-testid="button-edit-disabled"
                      >
                        <Edit2 className="w-4 h-4" />
                        Bearbeiten
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Nur Primar, 1. Oberarzt und Sekretariat können bearbeiten</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button variant="outline" className="gap-2 flex-1 lg:flex-none" data-testid="button-print">
                  <Printer className="w-4 h-4" />
                  Drucken
                </Button>
                <Button variant="outline" className="gap-2 flex-1 lg:flex-none" data-testid="button-pdf">
                  <Download className="w-4 h-4" />
                  PDF
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="border-none kabeg-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="bg-primary text-white">
                  <th className="p-2 text-left font-medium w-48 border-r border-primary/30" colSpan={2}>Bereich</th>
                  {days.map((day, i) => (
                    <th 
                      key={i} 
                      className={cn(
                        "p-2 text-center font-medium border-r border-primary/30 min-w-[100px]",
                        isWeekend(day) && "bg-primary/80"
                      )}
                    >
                      <div>{WEEK_DAYS[i]}</div>
                      <div className="text-xs font-normal opacity-80">{format(day, "dd.MM.", { locale: de })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEK_STRUCTURE.map((section, sectionIdx) => (
                  <>
                    <tr key={`section-${sectionIdx}`} className="bg-primary/10">
                      <td colSpan={9} className="p-2 font-bold text-primary border-b border-border">
                        {section.section}
                      </td>
                    </tr>
                    {section.areas.map((area, areaIdx) => (
                      area.slots.map((slot, slotIdx) => (
                        <tr key={`${sectionIdx}-${areaIdx}-${slotIdx}`} className="border-b border-border hover:bg-muted/30">
                          {slotIdx === 0 && (
                            <td 
                              className="p-2 font-medium text-foreground border-r border-border bg-muted/20 align-top"
                              rowSpan={area.slots.length}
                            >
                              {area.name}
                            </td>
                          )}
                          <td className="p-2 text-xs text-muted-foreground border-r border-border w-16 text-center bg-muted/10">
                            {slot.label}
                          </td>
                          {days.map((day, dayIdx) => {
                            const displayValue = getDisplayValue(slot.id, section.section, area.name, dayIdx);
                            const cellKey = `${slot.id}-${section.section}-${area.name}-${dayIdx}`;
                            const isEditingThisCell = editingCell === cellKey;
                            
                            return (
                              <td 
                                key={dayIdx}
                                className={cn(
                                  "p-1.5 border-r border-border text-center min-w-[100px]",
                                  isWeekend(day) && "bg-muted/30",
                                  getCellStyle(displayValue),
                                  isEditing && !isEditingThisCell && "cursor-pointer hover:bg-primary/5"
                                )}
                                onClick={() => isEditing && !isEditingThisCell && setEditingCell(cellKey)}
                                data-testid={`cell-${slot.id}-${dayIdx}`}
                              >
                                {isEditingThisCell ? (
                                  <Select 
                                    defaultValue=""
                                    onValueChange={(value) => handleCellSelect(slot.id, section.section, area.name, dayIdx, value, slot)}
                                  >
                                    <SelectTrigger className="h-7 text-xs" data-testid={`select-${slot.id}-${dayIdx}`}>
                                      <SelectValue placeholder={displayValue || "Auswählen..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="empty">- Leer -</SelectItem>
                                      <SelectItem value="closed">geschlossen</SelectItem>
                                      {employees
                                        .filter(e => slot.roleFilter.length === 0 || slot.roleFilter.includes(e.role))
                                        .map(emp => (
                                          <SelectItem key={emp.id} value={emp.id.toString()}>
                                            {emp.name.split(" ").pop()} ({emp.role})
                                          </SelectItem>
                                        ))
                                      }
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs">{displayValue}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between text-xs text-muted-foreground p-2 gap-2">
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-pink-100 rounded"></span> Diensthabende/r
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-primary/20 rounded"></span> TB-Leiter
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help text-primary">
                  <Info className="w-3 h-3" />
                  Bearbeitungsrechte
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium mb-1">Wer kann bearbeiten:</p>
                <ul className="list-disc list-inside text-xs">
                  <li>Primararzt</li>
                  <li>1. Oberarzt</li>
                  <li>Sekretariat</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            {currentUser && (
              <>
                <span className="text-muted-foreground">
                  Angemeldet als: <span className="font-medium text-foreground">{currentUser.name}</span> ({currentUser.role})
                </span>
                <span>•</span>
              </>
            )}
            <span>Prim. PD Dr. Johannes Lermann • Erstellt: {format(new Date(), "dd.MM.yyyy", { locale: de })}</span>
          </div>
        </div>

      </div>
    </Layout>
  );
}
