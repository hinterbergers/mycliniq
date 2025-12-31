import { Bell, Search, Calendar, CheckCircle, AlertTriangle, Info, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useMemo, useState } from "react";
import { rosterSettingsApi, shiftSwapApi, serviceLinesApi, notificationsApi, type NextPlanningMonth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { employeeDoesShifts } from "@shared/shiftTypes";
import type { ServiceLine, Notification } from "@shared/schema";
import { useLocation } from "wouter";

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export function Header({ title }: { title?: string }) {
  const { employee, capabilities, isAdmin, isTechnicalAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(null);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [pendingSwapCount, setPendingSwapCount] = useState(0);
  const [systemNotifications, setSystemNotifications] = useState<Notification[]>([]);
  const [notifications, setNotifications] = useState<
    { id: string; tone: "success" | "warning" | "info"; title: string; description: string }[]
  >([]);
  
  const canEditPlan =
    isAdmin ||
    isTechnicalAdmin ||
    capabilities.includes("dutyplan.edit");
  const canPublishPlan =
    isAdmin ||
    isTechnicalAdmin ||
    capabilities.includes("dutyplan.publish");
  const serviceLineMeta = useMemo(
    () => serviceLines.map((line) => ({ key: line.key, roleGroup: line.roleGroup, label: line.label })),
    [serviceLines]
  );
  const doesShifts = employee ? employeeDoesShifts(employee, serviceLineMeta) : false;
  
  useEffect(() => {
    if (employee) {
      loadPlanningData();
      loadSwapRequests();
      loadSystemNotifications();
    }
  }, [employee]);
  
  const loadPlanningData = async () => {
    try {
      const [data, serviceLineData] = await Promise.all([
        rosterSettingsApi.getNextPlanningMonth(),
        serviceLinesApi.getAll().catch(() => [])
      ]);
      setPlanningMonth(data);
      setServiceLines(serviceLineData);
    } catch (error) {
      console.error('Failed to load planning data', error);
    }
  };

  const loadSwapRequests = async () => {
    if (!employee) return;
    try {
      const requests = await shiftSwapApi.getByTargetEmployee(employee.id);
      const pendingCount = requests.filter((request) => request.status === "Ausstehend").length;
      setPendingSwapCount(pendingCount);
    } catch (error) {
      console.error("Failed to load shift swap requests", error);
      setPendingSwapCount(0);
    }
  };

  const loadSystemNotifications = async () => {
    try {
      const data = await notificationsApi.getAll();
      setSystemNotifications(data);
    } catch (error) {
      console.error("Failed to load system notifications", error);
    }
  };

  const markSystemRead = async (note: Notification) => {
    if (note.isRead) return;
    try {
      const updated = await notificationsApi.markRead(note.id);
      setSystemNotifications((prev) => prev.map((item) => (item.id === note.id ? updated : item)));
    } catch (error) {
      console.error("Failed to mark notification read", error);
    }
  };

  const deleteSystemNotification = async (id: number) => {
    try {
      await notificationsApi.delete(id);
      setSystemNotifications((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete notification", error);
    }
  };

  useEffect(() => {
    if (!planningMonth) {
      setNotifications([]);
      return;
    }

    const nextNotifications: { id: string; tone: "success" | "warning" | "info"; title: string; description: string }[] = [];
    const monthLabel = `${MONTH_NAMES[planningMonth.month - 1]} ${planningMonth.year}`;

    if (planningMonth.allSubmitted && canEditPlan) {
      nextNotifications.push({
        id: "all-submitted",
        tone: "success",
        title: "Alle Dienstwünsche eingereicht",
        description: `Der Dienstplan für ${monthLabel} kann erstellt werden.`,
      });
    }

    if (planningMonth.hasDraft && canPublishPlan) {
      nextNotifications.push({
        id: "draft-ready",
        tone: "info",
        title: "Dienstplan-Entwurf vorhanden",
        description: `Der Entwurf für ${monthLabel} kann freigegeben werden.`,
      });
    }

    if (pendingSwapCount > 0) {
      nextNotifications.push({
        id: "swap-requests",
        tone: "info",
        title: "Diensttausch-Anfrage",
        description: `${pendingSwapCount} Anfrage(n) warten auf Ihre Antwort.`,
      });
    }

    if (doesShifts) {
      const monthStart = new Date(planningMonth.year, planningMonth.month - 1, 1);
      const warningStart = new Date(monthStart);
      warningStart.setDate(warningStart.getDate() - 56);
      const now = new Date();
      if (now >= warningStart && now < monthStart) {
        nextNotifications.push({
          id: "wishes-reminder",
          tone: "warning",
          title: "Dienstwünsche demnächst fällig",
          description: `Bitte Wünsche für ${monthLabel} eintragen.`,
        });
      }
    }

    setNotifications(nextNotifications);
  }, [planningMonth, canEditPlan, canPublishPlan, doesShifts, pendingSwapCount]);
  
  const today = format(new Date(), 'd. MMM yyyy', { locale: de });
  const unreadSystemCount = systemNotifications.filter((note) => !note.isRead).length;
  const hasNotification = notifications.length > 0 || unreadSystemCount > 0;
  
  return (
    <header className="h-16 kabeg-header sticky top-0 z-10 px-6 flex items-center justify-between shadow-sm">
      <h2 className="text-xl font-semibold text-white tracking-tight">{title}</h2>
      
      <div className="flex items-center gap-4">
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/60" />
          <Input 
            placeholder="Suchen..." 
            className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30" 
            data-testid="input-search"
          />
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full text-white/80 hover:text-white hover:bg-white/10 relative"
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4" />
              {hasNotification && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Benachrichtigungen</h3>

              {systemNotifications.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">System</p>
                  {systemNotifications.slice(0, 3).map((note) => (
                    <div
                      key={note.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        note.isRead ? "bg-white" : "bg-blue-50 border-blue-200 text-blue-900"
                      }`}
                    >
                      <Info className="w-5 h-5 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{note.title}</p>
                        {note.message && (
                          <p className="text-xs mt-1 opacity-80">{note.message}</p>
                        )}
                        {note.link && (
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto px-0 text-xs"
                            onClick={() => {
                              markSystemRead(note);
                              setLocation(note.link || "/nachrichten");
                            }}
                          >
                            Oeffnen
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {!note.isRead && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => markSystemRead(note)}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteSystemNotification(note.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {systemNotifications.length > 3 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setLocation("/nachrichten")}
                    >
                      Alle Systemnachrichten
                    </Button>
                  )}
                </div>
              )}
              
              {notifications.length ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Dienstplan</p>
                  {notifications.map((note) => {
                    const toneStyles =
                      note.tone === "success"
                        ? "bg-green-50 border-green-200 text-green-800"
                        : note.tone === "warning"
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : "bg-blue-50 border-blue-200 text-blue-800";
                    const Icon =
                      note.tone === "success"
                        ? CheckCircle
                        : note.tone === "warning"
                        ? AlertTriangle
                        : Info;
                    return (
                      <div key={note.id} className={`flex items-start gap-3 p-3 rounded-lg border ${toneStyles}`}>
                        <Icon className="w-5 h-5 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{note.title}</p>
                          <p className="text-xs mt-1 opacity-80">{note.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Keine neuen Benachrichtigungen
                </p>
              )}

              {planningMonth && canEditPlan && !planningMonth.allSubmitted && (
                <div className="text-xs text-muted-foreground">
                  <p>Dienstwünsche für {MONTH_NAMES[planningMonth.month - 1]} {planningMonth.year}:</p>
                  <p className="font-medium">
                    {planningMonth.submittedCount} von {planningMonth.totalEmployees} eingereicht
                  </p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        <Button variant="ghost" size="sm" className="hidden md:flex gap-2 text-white/80 hover:text-white hover:bg-white/10">
          <Calendar className="w-4 h-4" />
          <span>{today}</span>
        </Button>
      </div>
    </header>
  );
}
