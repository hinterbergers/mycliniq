import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, ArrowRight, Sparkles, CheckCircle2, AlertTriangle, 
  XCircle, GripVertical, User, Plus, Info, Shield, Clock
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, eachDayOfInterval, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { employeeApi } from "@/lib/api";
import type { Employee } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const WEEK_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEK_DAYS_FULL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];

interface SlotAssignment {
  employeeId: number | null;
  employeeName: string | null;
  badge: string | null;
}

interface AreaSlot {
  id: string;
  label: string;
  roleLabel: string;
  assignment: SlotAssignment | null;
}

interface AreaData {
  id: string;
  name: string;
  slots: AreaSlot[];
  competencyStatus: "fulfilled" | "partial" | "missing";
}

interface SectionData {
  id: string;
  name: string;
  areas: AreaData[];
}

const ROLE_COLORS: Record<string, string> = {
  "Primararzt": "bg-purple-100 text-purple-800 border-purple-200",
  "1. Oberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  "Funktionsoberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  "Ausbildungsoberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  "Oberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  "Oberärztin": "bg-blue-100 text-blue-800 border-blue-200",
  "Facharzt": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Assistenzarzt": "bg-green-100 text-green-800 border-green-200",
  "Assistenzärztin": "bg-green-100 text-green-800 border-green-200",
  "Turnusarzt": "bg-amber-100 text-amber-800 border-amber-200",
  "Student (KPJ)": "bg-orange-100 text-orange-800 border-orange-200",
  "Student (Famulant)": "bg-orange-100 text-orange-800 border-orange-200",
  "Sekretariat": "bg-slate-100 text-slate-700 border-slate-200",
};

const ROLE_BADGES: Record<string, string> = {
  "Primararzt": "Prim",
  "1. Oberarzt": "1.OA",
  "Funktionsoberarzt": "FOA",
  "Ausbildungsoberarzt": "AOA",
  "Oberarzt": "OA",
  "Oberärztin": "OA",
  "Facharzt": "FA",
  "Assistenzarzt": "AA",
  "Assistenzärztin": "AA",
  "Turnusarzt": "TA",
  "Student (KPJ)": "KPJ",
  "Student (Famulant)": "FAM",
  "Sekretariat": "SEK",
};

const toDate = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isEmployeeInactive = (employee: Employee, rangeStart: Date, rangeEnd: Date) => {
  const inactiveFrom = toDate(employee.inactiveFrom);
  const inactiveUntil = toDate(employee.inactiveUntil);
  if (!inactiveFrom && !inactiveUntil) return false;
  if (inactiveFrom && inactiveFrom > rangeEnd) return false;
  if (inactiveUntil && inactiveUntil < rangeStart) return false;
  return true;
};

const generateDummySections = (): SectionData[] => {
  const statuses: Array<"fulfilled" | "partial" | "missing"> = ["fulfilled", "partial", "missing", "fulfilled", "fulfilled"];
  
  return [
    {
      id: "kreiszsaal-op",
      name: "Kreißsaal & OP",
      areas: [
        {
          id: "kreiszsaal-1",
          name: "Kreißsaal 1",
          slots: [
            { id: "ks1-oa", label: "1. OA", roleLabel: "Oberarzt", assignment: { employeeId: 1, employeeName: "Hinterberger", badge: "gyn" } },
            { id: "ks1-fa", label: "FA", roleLabel: "Facharzt", assignment: null },
            { id: "ks1-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: { employeeId: 3, employeeName: "Brunner", badge: "geb" } },
          ],
          competencyStatus: statuses[0]
        },
        {
          id: "sectio-op",
          name: "Sectio-OP",
          slots: [
            { id: "sop-oa", label: "1. OA", roleLabel: "Oberarzt", assignment: { employeeId: 2, employeeName: "Wagner", badge: "gyn" } },
            { id: "sop-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: null },
            { id: "sop-tu", label: "Turnusarzt", roleLabel: "Turnusarzt", assignment: null },
          ],
          competencyStatus: statuses[1]
        },
        {
          id: "gyn-op",
          name: "Gyn-OP 1",
          slots: [
            { id: "gop-oa", label: "1. OA", roleLabel: "Oberarzt", assignment: null },
            { id: "gop-fa", label: "FA", roleLabel: "Facharzt", assignment: { employeeId: 4, employeeName: "Huber", badge: "gyn" } },
            { id: "gop-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: null },
          ],
          competencyStatus: statuses[2]
        },
      ]
    },
    {
      id: "stationen",
      name: "Stationen",
      areas: [
        {
          id: "geb-station",
          name: "Geburtshilfl. Bettenstation",
          slots: [
            { id: "geb-oa", label: "OA", roleLabel: "Oberarzt", assignment: { employeeId: 5, employeeName: "Schneider", badge: "geb" } },
            { id: "geb-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: { employeeId: 6, employeeName: "Mayer", badge: "geb" } },
            { id: "geb-tu", label: "TU/KPJ", roleLabel: "Turnusarzt", assignment: null },
          ],
          competencyStatus: statuses[3]
        },
        {
          id: "gyn-station",
          name: "Gynäkologische Bettenstation",
          slots: [
            { id: "gyn-st-oa", label: "OA", roleLabel: "Oberarzt", assignment: null },
            { id: "gyn-st-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: { employeeId: 7, employeeName: "Fischer", badge: "gyn" } },
            { id: "gyn-st-tu", label: "TU/KPJ", roleLabel: "Turnusarzt", assignment: { employeeId: 8, employeeName: "Lang", badge: "ta" } },
          ],
          competencyStatus: statuses[4]
        },
      ]
    },
    {
      id: "ambulanzzentrum",
      name: "Ambulanzzentrum",
      areas: [
        {
          id: "risk-amb",
          name: "Risikoambulanz",
          slots: [
            { id: "risk-oa", label: "OA", roleLabel: "Oberarzt", assignment: { employeeId: 9, employeeName: "Berger", badge: "gyn" } },
            { id: "risk-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: null },
          ],
          competencyStatus: "fulfilled"
        },
        {
          id: "schwanger-amb",
          name: "Schwangerensprechstunde",
          slots: [
            { id: "schwanger-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: { employeeId: 10, employeeName: "Gruber", badge: "geb" } },
          ],
          competencyStatus: "fulfilled"
        },
        {
          id: "gyn-amb",
          name: "GYN 1 (Vulva, Dysplasie)",
          slots: [
            { id: "gyn1-oa", label: "OA", roleLabel: "Oberarzt", assignment: null },
            { id: "gyn1-ass", label: "Assistent:in", roleLabel: "Assistenzarzt", assignment: null },
          ],
          competencyStatus: "partial"
        },
        {
          id: "mamma",
          name: "Mamma-Sprechstunde",
          slots: [
            { id: "mamma-oa", label: "OA", roleLabel: "Oberarzt", assignment: { employeeId: 11, employeeName: "Hofer", badge: "mam" } },
          ],
          competencyStatus: "fulfilled"
        },
      ]
    },
  ];
};

export default function WeeklyPlan() {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [sections, setSections] = useState<SectionData[]>(generateDummySections());
  const [planStatus, setPlanStatus] = useState<"draft" | "preliminary" | "released">("draft");

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNumber = getWeek(currentDate, { weekStartsOn: 1 });
  const weekYear = getYear(weekStart);
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 4) });

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const empData = await employeeApi.getAll();
        setEmployees(empData.filter(e => e.isActive));
      } catch (error) {
        console.error("Failed to load employees:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleGenerateAI = () => {
    console.log("KI-Vorschlag generieren für KW", weekNumber, weekYear);
    toast({
      title: "KI-Vorschlag",
      description: "Die KI-Generierung wird vorbereitet...",
    });
  };

  const handleValidate = () => {
    console.log("Prüfung starten für KW", weekNumber, weekYear);
    toast({
      title: "Prüfung",
      description: "Wochenplan wird auf Konflikte geprüft...",
    });
  };

  const handleReleasePreliminary = () => {
    setPlanStatus("preliminary");
    console.log("Plan als vorläufig freigeben", weekNumber, weekYear);
    toast({
      title: "Vorläufig freigegeben",
      description: "Der Wochenplan wurde als vorläufig markiert.",
    });
  };

  const handleReleaseFinal = () => {
    setPlanStatus("released");
    console.log("Plan endgültig freigeben", weekNumber, weekYear);
    toast({
      title: "Endgültig freigegeben",
      description: "Der Wochenplan wurde endgültig freigegeben.",
    });
  };

  const getStatusIcon = (status: "fulfilled" | "partial" | "missing") => {
    switch (status) {
      case "fulfilled":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "partial":
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "missing":
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: "fulfilled" | "partial" | "missing") => {
    switch (status) {
      case "fulfilled":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">Vollständig</Badge>;
      case "partial":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Optional fehlt</Badge>;
      case "missing":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Pflicht fehlt</Badge>;
    }
  };

  const availableEmployees = employees.filter((emp) =>
    emp.isActive &&
    emp.takesShifts !== false &&
    !isEmployeeInactive(emp, weekStart, weekEnd)
  );

  return (
    <Layout title="Wochenplan-Editor">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Wochenplan-Editor</h1>
          <p className="text-muted-foreground">
            Wocheneinsatzpläne nach Bereichen erstellen und anpassen.
          </p>
        </div>

        <Card className="border-none kabeg-shadow">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                  <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))} data-testid="button-prev-week">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Select 
                    value={`${weekNumber}-${weekYear}`}
                    onValueChange={(val) => {
                      const [w, y] = val.split("-").map(Number);
                      const newDate = new Date(y, 0, 1 + (w - 1) * 7);
                      setCurrentDate(newDate);
                    }}
                  >
                    <SelectTrigger className="w-40 border-0 bg-transparent" data-testid="select-week">
                      <SelectValue>
                        <span className="font-bold">KW {weekNumber} / {weekYear}</span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => {
                        const d = addWeeks(new Date(), i - 4);
                        const wn = getWeek(d, { weekStartsOn: 1 });
                        const wy = getYear(startOfWeek(d, { weekStartsOn: 1 }));
                        return (
                          <SelectItem key={`${wn}-${wy}`} value={`${wn}-${wy}`}>
                            KW {wn} / {wy}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))} data-testid="button-next-week">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground hidden md:block">
                  {format(weekStart, "dd.MM.", { locale: de })} – {format(weekEnd, "dd.MM.yyyy", { locale: de })}
                </div>

                {planStatus !== "draft" && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      planStatus === "preliminary" && "bg-amber-50 text-amber-700 border-amber-200",
                      planStatus === "released" && "bg-green-50 text-green-700 border-green-200"
                    )}
                  >
                    {planStatus === "preliminary" ? "Vorläufig" : "Freigegeben"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={handleGenerateAI} data-testid="button-ai-generate">
                  <Sparkles className="w-4 h-4" />
                  KI-Vorschlag
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleValidate} data-testid="button-validate">
                  <Shield className="w-4 h-4" />
                  Prüfung
                </Button>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={handleReleasePreliminary}
                  disabled={planStatus !== "draft"}
                  data-testid="button-release-preliminary"
                >
                  <Clock className="w-4 h-4" />
                  Vorläufig freigeben
                </Button>
                <Button 
                  className="gap-2"
                  onClick={handleReleaseFinal}
                  disabled={planStatus !== "preliminary"}
                  data-testid="button-release-final"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Endgültig freigeben
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={selectedDay.toString()} onValueChange={(v) => setSelectedDay(parseInt(v))} className="w-full">
          <TabsList className="w-full justify-start bg-card border kabeg-shadow">
            {days.map((day, idx) => (
              <TabsTrigger 
                key={idx} 
                value={idx.toString()}
                className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-white"
                data-testid={`tab-day-${idx}`}
              >
                <div className="flex flex-col items-center">
                  <span className="font-medium">{WEEK_DAYS[idx]}</span>
                  <span className="text-xs opacity-70">{format(day, "dd.MM.", { locale: de })}</span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            {sections.map((section) => (
              <div key={section.id} className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {section.name}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {section.areas.map((area) => (
                    <Card key={area.id} className="border-none kabeg-shadow hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">{area.name}</CardTitle>
                          {getStatusIcon(area.competencyStatus)}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {getStatusBadge(area.competencyStatus)}
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 pt-0">
                        <div className="space-y-2">
                          {area.slots.map((slot) => (
                            <div 
                              key={slot.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border-2 border-dashed transition-all",
                                slot.assignment 
                                  ? "bg-primary/5 border-primary/20" 
                                  : "bg-muted/30 border-muted-foreground/20 hover:border-primary/30"
                              )}
                              data-testid={`slot-${slot.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-muted">
                                  {slot.label}
                                </Badge>
                                {slot.assignment ? (
                                  <span className="text-sm font-medium">
                                    {slot.assignment.employeeName} 
                                    <span className="text-muted-foreground ml-1">({slot.assignment.badge})</span>
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">+ Zuweisung</span>
                                )}
                              </div>
                              {!slot.assignment && (
                                <Plus className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="border-none kabeg-shadow sticky top-20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Verfügbares Personal
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {WEEK_DAYS_FULL[selectedDay]}, {format(days[selectedDay], "dd.MM.yyyy", { locale: de })}
                </p>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="text-sm text-muted-foreground text-center py-4">Laden...</div>
                  ) : (
                    availableEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm group"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("employeeId", emp.id.toString());
                          console.log("Drag start:", emp.name);
                        }}
                        data-testid={`employee-${emp.id}`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {emp.lastName || emp.name.split(" ").pop()}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", ROLE_COLORS[emp.role] || "bg-gray-100")}
                            >
                              {ROLE_BADGES[emp.role] || emp.role.substring(0, 2)}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {emp.competencies?.slice(0, 2).join(", ") || "Keine Kompetenzen"}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Wochenpläne werden automatisch aus dem freigegebenen Dienstplan vorgeschlagen. 
            Manuelle Änderungen überschreiben den Vorschlag, bleiben aber im Verlauf nachvollziehbar.
          </p>
        </div>
      </div>
    </Layout>
  );
}
