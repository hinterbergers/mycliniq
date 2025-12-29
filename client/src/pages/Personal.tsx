import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, 
  Rss, RefreshCw, Heart, Info, CheckCircle2, Clock, XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { format, addMonths, subMonths, getWeek } from "date-fns";
import { de } from "date-fns/locale";
import { useLocation } from "wouter";
import { dutyPlansApi } from "@/lib/api";
import type { DutyPlan } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const DUMMY_ROSTER_DATA = [
  { kw: 49, day: "Mo", date: "02.12.", kreisszimmer: "Hinterberger", gyn: "Wagner", turnus: "Lang", absences: "" },
  { kw: 49, day: "Di", date: "03.12.", kreisszimmer: "Brunner", gyn: "Fischer", turnus: "Hofer", absences: "Müller (U)" },
  { kw: 49, day: "Mi", date: "04.12.", kreisszimmer: "Wagner", gyn: "Hinterberger", turnus: "Lang", absences: "" },
  { kw: 49, day: "Do", date: "05.12.", kreisszimmer: "Fischer", gyn: "Brunner", turnus: "Hofer", absences: "Gruber (FB)" },
  { kw: 49, day: "Fr", date: "06.12.", kreisszimmer: "Hinterberger", gyn: "Wagner", turnus: "Lang", absences: "" },
  { kw: 49, day: "Sa", date: "07.12.", kreisszimmer: "Brunner", gyn: "-", turnus: "-", absences: "" },
  { kw: 49, day: "So", date: "08.12.", kreisszimmer: "Fischer", gyn: "-", turnus: "-", absences: "" },
  { kw: 50, day: "Mo", date: "09.12.", kreisszimmer: "Wagner", gyn: "Hinterberger", turnus: "Hofer", absences: "" },
  { kw: 50, day: "Di", date: "10.12.", kreisszimmer: "Hinterberger", gyn: "Fischer", turnus: "Lang", absences: "Berger (ZA)" },
  { kw: 50, day: "Mi", date: "11.12.", kreisszimmer: "Brunner", gyn: "Wagner", turnus: "Hofer", absences: "" },
  { kw: 50, day: "Do", date: "12.12.", kreisszimmer: "Fischer", gyn: "Brunner", turnus: "Lang", absences: "" },
  { kw: 50, day: "Fr", date: "13.12.", kreisszimmer: "Wagner", gyn: "Hinterberger", turnus: "Hofer", absences: "Krenn (U)" },
];

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
  Entwurf: "Bearbeitung",
  Vorläufig: "Vorschau",
  Freigegeben: "Freigabe"
};

export default function Personal() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();
  const currentMonth = format(currentDate, "MMMM yyyy", { locale: de });
  const nextMonth = format(addMonths(new Date(), 1), "MMMM", { locale: de });

  return (
    <Layout title="Dienstpläne">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dienstpläne</h1>
            <p className="text-muted-foreground">Monatsdienstplan, Wochenplan und Urlaubsplanung.</p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" data-testid="button-subscribe">
              <Rss className="w-4 h-4" />
              Abonnieren
            </Button>
            <Button variant="outline" className="gap-2" data-testid="button-export">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button variant="outline" className="gap-2" data-testid="button-swap">
              <RefreshCw className="w-4 h-4" />
              Diensttausch
            </Button>
            <Button className="gap-2" onClick={() => setLocation('/dienstwuensche')} data-testid="button-wishes">
              <Heart className="w-4 h-4" />
              Dienstwünsche für {nextMonth}
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
    </Layout>
  );
}

function RosterView({ currentDate, setCurrentDate }: { currentDate: Date; setCurrentDate: (d: Date) => void }) {
  const { employee, capabilities, isAdmin, isTechnicalAdmin } = useAuth();
  const { toast } = useToast();
  const [dutyPlan, setDutyPlan] = useState<DutyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const canEditPlan =
    isAdmin || isTechnicalAdmin || capabilities.includes("dutyplan.edit");
  const canPublishPlan =
    isAdmin || isTechnicalAdmin || capabilities.includes("dutyplan.publish");
  const planStatus = dutyPlan?.status ?? "Entwurf";
  const statusLabel = PLAN_STATUS_LABELS[planStatus];

  const loadPlanStatus = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setPlanLoading(true);
    try {
      const plan = await dutyPlansApi.getByMonth(year, month);
      setDutyPlan(plan);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Status konnte nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    loadPlanStatus();
  }, [currentDate]);

  const ensurePlan = async () => {
    if (dutyPlan) return dutyPlan;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const existing = await dutyPlansApi.getByMonth(year, month);
    if (existing) {
      setDutyPlan(existing);
      return existing;
    }
    try {
      const created = await dutyPlansApi.create({
        year,
        month,
        generatedById: employee?.id ?? null
      });
      setDutyPlan(created);
      return created;
    } catch (error: any) {
      const fallback = await dutyPlansApi.getByMonth(year, month);
      if (fallback) {
        setDutyPlan(fallback);
        return fallback;
      }
      throw error;
    }
  };

  const handleSetStatus = async (nextStatus: DutyPlan["status"]) => {
    setStatusUpdating(true);
    try {
      const plan = await ensurePlan();
      const updated = await dutyPlansApi.updateStatus(
        plan.id,
        nextStatus,
        nextStatus === "Freigegeben" ? employee?.id ?? null : null
      );
      setDutyPlan(updated);
      toast({
        title: "Status aktualisiert",
        description: `Dienstplan ist jetzt ${PLAN_STATUS_LABELS[updated.status]}.`
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Status konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    } finally {
      setStatusUpdating(false);
    }
  };

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
            {planStatus === "Entwurf" && canEditPlan && (
              <Button
                variant="outline"
                size="sm"
                disabled={statusUpdating || planLoading}
                onClick={() => handleSetStatus("Vorläufig")}
              >
                Vorschau
              </Button>
            )}
            {planStatus === "Vorläufig" && canEditPlan && (
              <Button
                variant="outline"
                size="sm"
                disabled={statusUpdating || planLoading}
                onClick={() => handleSetStatus("Entwurf")}
              >
                Bearbeitung
              </Button>
            )}
            {planStatus === "Vorläufig" && canPublishPlan && (
              <Button
                size="sm"
                disabled={statusUpdating || planLoading}
                onClick={() => handleSetStatus("Freigegeben")}
              >
                Freigeben
              </Button>
            )}
            {planStatus === "Freigegeben" && canPublishPlan && (
              <Button
                variant="outline"
                size="sm"
                disabled={statusUpdating || planLoading}
                onClick={() => handleSetStatus("Entwurf")}
              >
                Bearbeitung
              </Button>
            )}
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
                <th className="p-3 text-left font-medium">Kreißzimmer</th>
                <th className="p-3 text-left font-medium">Gynäkologie</th>
                <th className="p-3 text-left font-medium">Turnus</th>
                <th className="p-3 text-left font-medium">Abwesenheiten</th>
              </tr>
            </thead>
            <tbody>
              {DUMMY_ROSTER_DATA.map((row, i) => {
                const isWeekend = row.day === "Sa" || row.day === "So";
                const showKW = i === 0 || DUMMY_ROSTER_DATA[i - 1].kw !== row.kw;
                
                return (
                  <tr 
                    key={i} 
                    className={cn(
                      "border-b border-border hover:bg-muted/30 transition-colors",
                      isWeekend && "bg-muted/20"
                    )}
                    data-testid={`roster-row-${i}`}
                  >
                    <td className="p-3 font-medium text-primary">
                      {showKW ? row.kw : ""}
                    </td>
                    <td className={cn("p-3 font-medium", isWeekend && "text-primary")}>
                      {row.day}
                    </td>
                    <td className="p-3 text-muted-foreground">{row.date}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                        {row.kreisszimmer}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {row.gyn !== "-" ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {row.gyn}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.turnus !== "-" ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          {row.turnus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {row.absences || "-"}
                    </td>
                  </tr>
                );
              })}
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
              <p className="text-2xl font-bold text-primary">8</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-sm text-muted-foreground">Abwesenheiten</p>
              <p className="text-2xl font-bold text-amber-700">2</p>
            </div>
            <div className="p-4 bg-pink-50 rounded-lg border border-pink-100">
              <p className="text-sm text-muted-foreground">Wochenenddienste</p>
              <p className="text-2xl font-bold text-pink-700">3</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
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
