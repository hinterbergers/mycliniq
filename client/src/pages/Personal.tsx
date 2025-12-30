import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowRightLeft,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Info,
  Loader2,
  RefreshCw,
  Rss,
  X,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAustrianHoliday } from "@/lib/holidays";
import { useEffect, useMemo, useState } from "react";
import { format, addMonths, subMonths, getWeek, eachDayOfInterval, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useLocation } from "wouter";
import { dutyPlansApi, employeeApi, rosterApi, rosterSettingsApi, serviceLinesApi, shiftSwapApi, type NextPlanningMonth } from "@/lib/api";
import type { DutyPlan, Employee, RosterShift, ShiftSwapRequest, ServiceLine } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const DUMMY_WEEK_AREAS = [
  { area: "Kreißsaal 1", mon: "Hinterberger", tue: "Brunner", wed: "Wagner", thu: "Fischer", fri: "Hinterberger" },
  { area: "Sectio-OP", mon: "Wagner", tue: "Fischer", wed: "Brunner", thu: "Hinterberger", fri: "Wagner" },
  { area: "Gyn-Ambulanz 1", mon: "Müller", tue: "Gruber", wed: "Müller", thu: "Gruber", fri: "Müller" },
  { area: "Gyn-Ambulanz 2", mon: "Krenn", tue: "Hofer", wed: "Krenn", thu: "Hofer", fri: "Krenn" },
  { area: "Station Geb", mon: "Lang", tue: "Lang", wed: "Berger", thu: "Berger", fri: "Lang" },
  { area: "Station Gyn", mon: "Berger", tue: "Berger", wed: "Lang", thu: "Lang", fri: "Berger" },
];

const DUMMY_APPROVED_VACATIONS = [
  { id: 1, name: "Dr. Müller", from: "23.12.2024", to: "02.01.2025", days: 8, type: "Urlaub" },
  { id: 2, name: "Dr. Krenn", from: "27.12.2024", to: "31.12.2024", days: 4, type: "Urlaub" },
  { id: 3, name: "Dr. Gruber", from: "16.12.2024", to: "18.12.2024", days: 3, type: "Fortbildung" },
  { id: 4, name: "Dr. Hofer", from: "06.01.2025", to: "10.01.2025", days: 5, type: "Urlaub" },
];

const DUMMY_MY_REQUESTS = [
  { id: 1, from: "23.12.2024", to: "27.12.2024", days: 4, type: "Urlaub", status: "approved" },
  { id: 2, from: "03.02.2025", to: "07.02.2025", days: 5, type: "Urlaub", status: "pending" },
  { id: 3, from: "15.01.2025", to: "15.01.2025", days: 1, type: "Zeitausgleich", status: "rejected" },
];

const PLAN_STATUS_LABELS: Record<DutyPlan["status"], string> = {
  Entwurf: "Vorschau",
  Vorläufig: "Vorschau",
  Freigegeben: "Freigabe"
};

const SERVICE_LINE_PALETTE = [
  {
    header: "bg-pink-50/50 border-pink-100 text-pink-900",
    cell: "bg-pink-50 text-pink-700 border-pink-200"
  },
  {
    header: "bg-blue-50/50 border-blue-100 text-blue-900",
    cell: "bg-blue-50 text-blue-700 border-blue-200"
  },
  {
    header: "bg-amber-50/50 border-amber-100 text-amber-900",
    cell: "bg-amber-50 text-amber-700 border-amber-200"
  },
  {
    header: "bg-violet-50/50 border-violet-100 text-violet-900",
    cell: "bg-violet-50 text-violet-700 border-violet-200"
  },
  {
    header: "bg-emerald-50/50 border-emerald-100 text-emerald-900",
    cell: "bg-emerald-50 text-emerald-700 border-emerald-200"
  }
];

const FALLBACK_SERVICE_LINES = [
  { key: "kreiszimmer", label: "Kreißzimmer", sortOrder: 1, isActive: true },
  { key: "gyn", label: "Gyn-Dienst", sortOrder: 2, isActive: true },
  { key: "turnus", label: "Turnus", sortOrder: 3, isActive: true },
  { key: "overduty", label: "Überdienst", sortOrder: 4, isActive: true }
];

const buildServiceLineDisplay = (lines: ServiceLine[], shifts: RosterShift[]) => {
  const source = lines.length ? lines : FALLBACK_SERVICE_LINES;
  const shiftKeys = new Set(shifts.map((shift) => shift.serviceType));
  const knownKeys = new Set(source.map((line) => line.key));
  const extras = [...shiftKeys]
    .filter((key) => !knownKeys.has(key))
    .map((key) => ({ key, label: key, sortOrder: 999, isActive: true }));
  return [...source, ...extras]
    .filter((line) => line.isActive !== false || shiftKeys.has(line.key))
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.label.localeCompare(b.label);
    })
    .map((line, index) => ({
      key: line.key,
      label: line.label,
      style: SERVICE_LINE_PALETTE[index % SERVICE_LINE_PALETTE.length]
    }));
};

const SHIFT_STATUS_BADGES: Record<string, { icon: typeof Clock; className: string }> = {
  Ausstehend: { icon: Clock, className: "text-amber-600 border-amber-300" },
  Genehmigt: { icon: Check, className: "text-green-600 border-green-300" },
  Abgelehnt: { icon: X, className: "text-red-600 border-red-300" }
};

export default function Personal() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(null);

  useEffect(() => {
    const loadPlanningMonth = async () => {
      try {
        const data = await rosterSettingsApi.getNextPlanningMonth();
        setPlanningMonth(data);
      } catch (error) {
        toast({
          title: "Dienstwünsche",
          description: "Planungsmonat konnte nicht geladen werden.",
          variant: "destructive"
        });
      }
    };
    loadPlanningMonth();
  }, [toast]);

  const wishLabel = planningMonth
    ? format(new Date(planningMonth.year, planningMonth.month - 1, 1), "MMMM yyyy", { locale: de })
    : format(addMonths(new Date(), 1), "MMMM", { locale: de });

  const handleSubscribe = async () => {
    if (!token) {
      toast({
        title: "Nicht angemeldet",
        description: "Bitte melden Sie sich erneut an, um den Kalender zu abonnieren.",
        variant: "destructive"
      });
      return;
    }

    const baseUrl = window.location.origin.replace(/\/$/, "");
    const calendarUrl = `${baseUrl}/api/roster/calendar?token=${encodeURIComponent(token)}&months=6`;
    const webcalUrl = calendarUrl.replace(/^https?:\/\//, "webcal://");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(calendarUrl);
      }
      window.open(webcalUrl, "_blank");
      toast({
        title: "Kalender-Abo",
        description: "Der Abo-Link wurde geöffnet und in die Zwischenablage kopiert."
      });
    } catch (error) {
      window.open(calendarUrl, "_blank");
      toast({
        title: "Kalender-Abo",
        description: "Der Abo-Link wurde geöffnet."
      });
    }
  };

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

  return (
    <Layout title="Dienstpläne">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dienstpläne</h1>
            <p className="text-muted-foreground">Monatsdienstplan, Wochenplan und Urlaubsplanung.</p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={handleSubscribe} data-testid="button-subscribe">
              <Rss className="w-4 h-4" />
              Abonnieren
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleExport}
              disabled={exporting}
              data-testid="button-export"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Export läuft..." : "Export"}
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setSwapDialogOpen(true)}
              data-testid="button-swap"
            >
              <RefreshCw className="w-4 h-4" />
              Diensttausch
            </Button>
            <Button className="gap-2" onClick={() => setLocation('/dienstwuensche')} data-testid="button-wishes">
              <Heart className="w-4 h-4" />
              Dienstwünsche für {wishLabel}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="roster" className="space-y-6">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger value="roster" className="rounded-lg px-6 h-10" data-testid="tab-roster">
              Dienstplan
            </TabsTrigger>
            <TabsTrigger value="weekly" className="rounded-lg px-6 h-10" data-testid="tab-weekly">
              Wochenplan
            </TabsTrigger>
            <TabsTrigger value="vacation" className="rounded-lg px-6 h-10" data-testid="tab-vacation">
              Urlaubsplanung
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roster" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <RosterView currentDate={currentDate} setCurrentDate={setCurrentDate} />
          </TabsContent>

          <TabsContent value="weekly" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <WeeklyView />
          </TabsContent>

          <TabsContent value="vacation" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <VacationView />
          </TabsContent>
        </Tabs>
      </div>

      <ShiftSwapRosterDialog
        open={swapDialogOpen}
        onOpenChange={setSwapDialogOpen}
        currentDate={currentDate}
      />
    </Layout>
  );
}

function RosterView({ currentDate, setCurrentDate }: { currentDate: Date; setCurrentDate: (d: Date) => void }) {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();
  const [dutyPlan, setDutyPlan] = useState<DutyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);

  const planStatus = dutyPlan?.status;
  const statusLabel = planStatus ? PLAN_STATUS_LABELS[planStatus] : "Vorschau";
  const serviceLineDisplay = useMemo(
    () => buildServiceLineDisplay(serviceLines, shifts),
    [serviceLines, shifts]
  );
  const serviceLineLookup = useMemo(() => {
    return new Map(serviceLineDisplay.map((line) => [line.key, line]));
  }, [serviceLineDisplay]);
  const rosterColumnCount = 3 + serviceLineDisplay.length + 1;

  const loadRoster = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setPlanLoading(true);
    setRosterLoading(true);
    try {
      const [plan, rosterData, employeeData] = await Promise.all([
        dutyPlansApi.getByMonth(year, month),
        rosterApi.getByMonth(year, month),
        employeeApi.getAll()
      ]);
      let serviceLineData: ServiceLine[] = [];
      try {
        serviceLineData = await serviceLinesApi.getAll();
      } catch {
        serviceLineData = [];
      }
      setDutyPlan(plan);
      setShifts(rosterData);
      setEmployees(employeeData);
      setServiceLines(serviceLineData);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Dienstplan konnte nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setPlanLoading(false);
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, [currentDate]);

  const employeesById = new Map(employees.map((emp) => [emp.id, emp]));
  const shiftsByDate = shifts.reduce<Record<string, Record<string, RosterShift>>>(
    (acc, shift) => {
      if (!acc[shift.date]) {
        acc[shift.date] = {};
      }
      acc[shift.date][shift.serviceType] = shift;
      return acc;
    },
    {}
  );

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  const isPublished = planStatus === "Freigegeben";
  const getLastName = (value: string) => {
    const parts = value.trim().split(/\s+/);
    return parts[parts.length - 1] || value;
  };
  const getShiftLabel = (shift?: RosterShift) => {
    if (!shift) return "-";
    if (shift.employeeId) {
      return employeesById.get(shift.employeeId)?.name ?? "—";
    }
    return shift.assigneeFreeText?.trim() || "-";
  };
  const getShiftDisplay = (shift?: RosterShift) => {
    const label = getShiftLabel(shift);
    if (label === "-") return "-";
    return isPublished ? getLastName(label) : label;
  };
  const isMyShift = (shift?: RosterShift) =>
    Boolean(shift?.employeeId && currentUser?.id && shift.employeeId === currentUser.id);
  const getBadgeClass = (style: { cell: string }, highlight: boolean) => {
    if (!isPublished || highlight) {
      return style.cell;
    }
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  const myShifts = currentUser
    ? shifts.filter((shift) => shift.employeeId === currentUser.id)
    : [];
  const weekendCount = myShifts.filter((shift) => {
    const date = new Date(`${shift.date}T00:00:00`);
    const day = date.getDay();
    return day === 0 || day === 6;
  }).length;

  return (
    <div className="space-y-6">
      <Card className="border-none kabeg-shadow overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {format(currentDate, 'MMMM yyyy', { locale: de })}
            </h3>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                planStatus === "Freigegeben"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : planStatus === "Vorläufig"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }
            >
              {planLoading ? "Status wird geladen..." : `Status: ${statusLabel}`}
            </Badge>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Bereich" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Bereiche</SelectItem>
                <SelectItem value="geb">Geburtshilfe</SelectItem>
                <SelectItem value="gyn">Gynäkologie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="bg-primary text-white">
                <th className="p-3 text-left font-medium w-16">KW</th>
                <th className="p-3 text-left font-medium w-12">Tag</th>
                <th className="p-3 text-left font-medium w-24">Datum</th>
                {serviceLineDisplay.map((line) => (
                  <th key={line.key} className="p-3 text-left font-medium">
                    {line.label}
                  </th>
                ))}
                <th className="p-3 text-left font-medium">Abwesenheiten</th>
              </tr>
            </thead>
            <tbody>
              {rosterLoading ? (
                <tr>
                  <td colSpan={rosterColumnCount} className="p-6 text-center text-muted-foreground">
                    Dienstplan wird geladen...
                  </td>
                </tr>
              ) : (
                days.map((day, i) => {
                  const weekNumber = getWeek(day, { weekStartsOn: 1, firstWeekContainsDate: 4 });
                  const prevWeekNumber =
                    i > 0 ? getWeek(days[i - 1], { weekStartsOn: 1, firstWeekContainsDate: 4 }) : null;
                  const showKW = i === 0 || weekNumber !== prevWeekNumber;
                  const dayLabel = format(day, "EEE", { locale: de }).replace(".", "");
                  const dateLabel = format(day, "dd.MM.yyyy", { locale: de });
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayShifts = shiftsByDate[dateKey] || {};
                  const holiday = getAustrianHoliday(day);
                  const isHoliday = Boolean(holiday);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const highlightRow = isWeekend || isHoliday;

                  return (
                    <tr
                      key={dateKey}
                      className={cn(
                        "border-b border-border hover:bg-muted/30 transition-colors",
                        highlightRow && "bg-amber-50/60"
                      )}
                      data-testid={`roster-row-${dateKey}`}
                    >
                      <td className="p-3 font-medium text-primary">{showKW ? weekNumber : ""}</td>
                      <td className={cn("p-3 font-medium", highlightRow && "text-rose-600")}>{dayLabel}</td>
                      <td className={cn("p-3 text-muted-foreground", highlightRow && "text-rose-600")}>{dateLabel}</td>
                      {serviceLineDisplay.map((line) => {
                        const shift = dayShifts[line.key];
                        const label = getShiftDisplay(shift);
                        return (
                          <td key={line.key} className="p-3">
                            {label !== "-" ? (
                              <Badge
                                variant="outline"
                                className={getBadgeClass(line.style, isMyShift(shift))}
                              >
                                {label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3 text-muted-foreground text-xs">-</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-none kabeg-shadow">
        <CardHeader>
          <CardTitle className="text-base">Monatsübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
              <p className="text-sm text-muted-foreground">Anzahl Dienste</p>
              <p className="text-2xl font-bold text-primary">{myShifts.length}</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-sm text-muted-foreground">Abwesenheiten</p>
              <p className="text-2xl font-bold text-amber-700">0</p>
            </div>
            <div className="p-4 bg-pink-50 rounded-lg border border-pink-100">
              <p className="text-sm text-muted-foreground">Wochenenddienste</p>
              <p className="text-2xl font-bold text-pink-700">{weekendCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ShiftSwapRosterDialog({
  open,
  onOpenChange,
  currentDate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: Date;
}) {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [myRequests, setMyRequests] = useState<ShiftSwapRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ShiftSwapRequest[]>([]);
  const [sourceShiftId, setSourceShiftId] = useState("");
  const [targetShiftId, setTargetShiftId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, currentDate]);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const [shiftData, employeeData, myData, incomingData] = await Promise.all([
        rosterApi.getByMonth(year, month),
        employeeApi.getAll(),
        shiftSwapApi.getByEmployee(currentUser.id),
        shiftSwapApi.getByTargetEmployee(currentUser.id)
      ]);
      let serviceLineData: ServiceLine[] = [];
      try {
        serviceLineData = await serviceLinesApi.getAll();
      } catch {
        serviceLineData = [];
      }
      setShifts(shiftData);
      setEmployees(employeeData);
      setServiceLines(serviceLineData);
      setMyRequests(myData);
      setIncomingRequests(incomingData);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Diensttausch-Daten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const employeesById = new Map(employees.map((emp) => [emp.id, emp]));
  const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
  const serviceLineLabelLookup = useMemo(() => {
    const map = new Map<string, string>();
    FALLBACK_SERVICE_LINES.forEach((line) => map.set(line.key, line.label));
    serviceLines.forEach((line) => map.set(line.key, line.label));
    return map;
  }, [serviceLines]);
  const myShifts = shifts
    .filter((shift) => shift.employeeId === currentUser?.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const targetShifts = shifts
    .filter((shift) => shift.employeeId && shift.employeeId !== currentUser?.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const formatShiftOption = (shift: RosterShift) => {
    const dateLabel = format(parseISO(shift.date), "dd.MM.yyyy", { locale: de });
    const serviceLabel = serviceLineLabelLookup.get(shift.serviceType) || shift.serviceType;
    const assignee =
      shift.employeeId ? employeesById.get(shift.employeeId)?.name : shift.assigneeFreeText;
    return `${dateLabel} · ${serviceLabel} · ${assignee || "Unbekannt"}`;
  };

  const selectedSourceShift = sourceShiftId ? shiftsById.get(Number(sourceShiftId)) : null;
  const selectedTargetShift = targetShiftId ? shiftsById.get(Number(targetShiftId)) : null;
  const incomingPending = incomingRequests.filter((req) => req.status === "Ausstehend");

  const handleSubmitSwapRequest = async () => {
    if (!currentUser || !selectedSourceShift || !selectedTargetShift || !selectedTargetShift.employeeId) {
      toast({
        title: "Unvollständige Auswahl",
        description: "Bitte zwei Dienste auswählen, die getauscht werden sollen.",
        variant: "destructive"
      });
      return;
    }
    setSubmitting(true);
    try {
      await shiftSwapApi.create({
        requesterId: currentUser.id,
        requesterShiftId: selectedSourceShift.id,
        targetShiftId: selectedTargetShift.id,
        targetEmployeeId: selectedTargetShift.employeeId,
        reason: reason || null,
        status: "Ausstehend"
      });
      toast({ title: "Anfrage gesendet", description: "Die Tausch-Anfrage wurde eingereicht." });
      setSourceShiftId("");
      setTargetShiftId("");
      setReason("");
      loadData();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Die Anfrage konnte nicht gesendet werden.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (requestId: number) => {
    if (!currentUser) return;
    setProcessingId(requestId);
    try {
      await shiftSwapApi.approve(requestId, currentUser.id);
      toast({ title: "Tausch genehmigt", description: "Die Dienste wurden getauscht." });
      loadData();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Genehmigung fehlgeschlagen.",
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: number) => {
    if (!currentUser) return;
    setProcessingId(requestId);
    try {
      await shiftSwapApi.reject(requestId, currentUser.id);
      toast({ title: "Tausch abgelehnt", description: "Die Anfrage wurde abgelehnt." });
      loadData();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Ablehnung fehlgeschlagen.",
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  const renderShiftSummary = (shiftId?: number | null) => {
    if (!shiftId) return "Unbekannter Dienst";
    const shift = shiftsById.get(shiftId);
    if (!shift) return `Dienst #${shiftId}`;
    const dateLabel = format(parseISO(shift.date), "dd.MM.yyyy", { locale: de });
    const serviceLabel = serviceLineLabelLookup.get(shift.serviceType) || shift.serviceType;
    return `${dateLabel} · ${serviceLabel}`;
  };

  const renderStatusBadge = (status: string) => {
    const config = SHIFT_STATUS_BADGES[status];
    const StatusIcon = config?.icon || Clock;
    return (
      <Badge variant="outline" className={config?.className}>
        <StatusIcon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Diensttausch
          </DialogTitle>
          <DialogDescription>
            Wählen Sie zwei Dienste aus, um eine Tausch-Anfrage zu senden.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="new" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="new">Neue Anfrage</TabsTrigger>
              <TabsTrigger value="my">Meine Anfragen</TabsTrigger>
              <TabsTrigger value="incoming">
                An mich
                {incomingPending.length > 0 && (
                  <Badge className="ml-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {incomingPending.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Mein Dienst</Label>
                  <Select value={sourceShiftId} onValueChange={setSourceShiftId}>
                    <SelectTrigger data-testid="select-swap-source">
                      <SelectValue placeholder="Dienst auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {myShifts.length === 0 && (
                        <SelectItem value="none" disabled>
                          Keine Dienste im aktuellen Monat
                        </SelectItem>
                      )}
                      {myShifts.map((shift) => (
                        <SelectItem key={shift.id} value={String(shift.id)}>
                          {formatShiftOption(shift)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Ziel-Dienst</Label>
                  <Select value={targetShiftId} onValueChange={setTargetShiftId}>
                    <SelectTrigger data-testid="select-swap-target">
                      <SelectValue placeholder="Ziel-Dienst auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetShifts.length === 0 && (
                        <SelectItem value="none" disabled>
                          Keine Ziel-Dienste verfügbar
                        </SelectItem>
                      )}
                      {targetShifts.map((shift) => (
                        <SelectItem key={shift.id} value={String(shift.id)}>
                          {formatShiftOption(shift)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Grund (optional)</Label>
                  <Textarea
                    placeholder="z.B. Familienangelegenheit, Arzttermin..."
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    data-testid="input-swap-reason"
                  />
                </div>

                <Button
                  onClick={handleSubmitSwapRequest}
                  disabled={submitting || !sourceShiftId || !targetShiftId}
                  className="w-full"
                  data-testid="button-submit-swap"
                >
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Tausch-Anfrage senden
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="my" className="py-4">
              {myRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Keine Tausch-Anfragen vorhanden</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myRequests.map((request) => (
                    <Card key={request.id} data-testid={`card-my-swap-${request.id}`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            {renderStatusBadge(request.status)}
                            <p className="text-sm font-medium">
                              Mein Dienst: {renderShiftSummary(request.requesterShiftId)}
                            </p>
                            <p className="text-sm">
                              Ziel: {renderShiftSummary(request.targetShiftId)}
                            </p>
                            {request.reason && (
                              <p className="text-xs text-muted-foreground">{request.reason}</p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(request.requestedAt), "dd.MM.yyyy", { locale: de })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="incoming" className="py-4">
              {incomingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Keine eingehenden Anfragen</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incomingRequests.map((request) => (
                    <Card key={request.id} data-testid={`card-incoming-swap-${request.id}`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            {renderStatusBadge(request.status)}
                            <p className="text-sm font-medium">
                              Anfrage von {employeesById.get(request.requesterId)?.name || "Unbekannt"}
                            </p>
                            <p className="text-sm">
                              Mein Dienst: {renderShiftSummary(request.targetShiftId)}
                            </p>
                            <p className="text-sm">
                              Tausch mit: {renderShiftSummary(request.requesterShiftId)}
                            </p>
                            {request.reason && (
                              <p className="text-xs text-muted-foreground">{request.reason}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(request.requestedAt), "dd.MM.yyyy", { locale: de })}
                            </span>
                            {request.status === "Ausstehend" && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 border-green-300 hover:bg-green-50"
                                  onClick={() => handleApprove(request.id)}
                                  disabled={processingId === request.id}
                                  data-testid={`button-approve-${request.id}`}
                                >
                                  {processingId === request.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                  onClick={() => handleReject(request.id)}
                                  disabled={processingId === request.id}
                                  data-testid={`button-reject-${request.id}`}
                                >
                                  {processingId === request.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <X className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WeeklyView() {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Der Wochenplan wird automatisch aus dem freigegebenen Dienstplan erzeugt. 
          Kurzfristige Änderungen können von berechtigten Personen vorgenommen werden.
        </p>
      </div>

      <Card className="border-none kabeg-shadow overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Wochenplan KW 49
          </CardTitle>
          <CardDescription>02.12. – 06.12.2024</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="p-3 text-left font-medium w-40">Bereich</th>
                  <th className="p-3 text-center font-medium">Mo</th>
                  <th className="p-3 text-center font-medium">Di</th>
                  <th className="p-3 text-center font-medium">Mi</th>
                  <th className="p-3 text-center font-medium">Do</th>
                  <th className="p-3 text-center font-medium">Fr</th>
                </tr>
              </thead>
              <tbody>
                {DUMMY_WEEK_AREAS.map((row, i) => (
                  <tr key={i} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{row.area}</td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">{row.mon}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">{row.tue}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">{row.wed}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">{row.thu}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">{row.fri}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VacationView() {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Genehmigt
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
            <Clock className="w-3 h-3" />
            Eingereicht
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
            <XCircle className="w-3 h-3" />
            Abgelehnt
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle className="text-base">Genehmigte Urlaube (Team)</CardTitle>
            <CardDescription>Übersicht der kommenden Abwesenheiten</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DUMMY_APPROVED_VACATIONS.map((vacation) => (
                <div 
                  key={vacation.id} 
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                  data-testid={`vacation-approved-${vacation.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {vacation.name.split(" ").pop()?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{vacation.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {vacation.from} – {vacation.to}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={cn(
                      vacation.type === "Fortbildung" 
                        ? "bg-purple-50 text-purple-700 border-purple-200" 
                        : "bg-green-50 text-green-700 border-green-200"
                    )}>
                      {vacation.type}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{vacation.days} Tage</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle className="text-base">Meine Urlaubsanträge</CardTitle>
            <CardDescription>Status deiner eingereichten Anträge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DUMMY_MY_REQUESTS.map((request) => (
                <div 
                  key={request.id} 
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                  data-testid={`vacation-request-${request.id}`}
                >
                  <div>
                    <p className="font-medium text-sm">{request.from} – {request.to}</p>
                    <p className="text-xs text-muted-foreground">
                      {request.days} Tag(e) • {request.type}
                    </p>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              ))}
            </div>
            
            <Button variant="outline" className="w-full mt-4 gap-2">
              <CalendarIcon className="w-4 h-4" />
              Neuen Antrag stellen
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex gap-3">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          Admins können Zeitfenster sperren. Fortbildungen haben Priorität vor Urlaub. 
          Bei Überschneidungen werden Sie automatisch benachrichtigt.
        </p>
      </div>
    </div>
  );
}
