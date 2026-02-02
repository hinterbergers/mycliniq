import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRightLeft,
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  Heart,
  Info,
  Loader2,
  RefreshCw,
  Rss,
  X,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAustrianHoliday } from "@/lib/holidays";
import { useEffect, useMemo, useState } from "react";
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  subDays,
  getWeek,
  getMonth,
  getYear,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  startOfDay,
} from "date-fns";
import { de } from "date-fns/locale";
import { useLocation } from "wouter";
import {
  dutyPlansApi,
  employeeApi,
  rosterApi,
  serviceLinesApi,
  getServiceLineContextFromEmployee,
  shiftSwapApi,
  plannedAbsencesAdminApi,
  longTermAbsencesApi,
  roomApi,
  weeklyPlanApi,
  type OpenShiftSlot,
  type OpenShiftResponse,
  type PlannedAbsenceAdmin,
  type WeeklyPlanResponse,
} from "@/lib/api";
import {
  getEffectiveServiceLineKeys,
  getEmployeeServiceLineCandidate,
} from "@/lib/serviceLineAccess";
import type {
  DutyPlan,
  Employee,
  RosterShift,
  ShiftSwapRequest,
  ServiceLine,
  LongTermAbsence,
} from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import VacationPlanEditor from "@/pages/admin/VacationPlanEditor";
import {
  WEEKDAY_LABELS,
  WEEKDAY_FULL,
  type WeeklyPlanRoom,
  isEmployeeOnDutyDate,
  formatRoomTime,
  getRoomSettingForDate,
} from "@/lib/weeklyPlanUtils";

const PLAN_STATUS_LABELS: Record<DutyPlan["status"], string> = {
  Entwurf: "Bearbeitung",
  Vorläufig: "Vorschau",
  Freigegeben: "Freigabe",
};

const ALLOWED_UNASSIGNED_STATUSES = new Set<DutyPlan["status"]>([
  "Vorläufig",
  "Freigegeben",
]);

type OpenShiftDebugDetail = {
  planStatus: DutyPlan["status"] | null;
  statusAllowed: boolean;
  showUnassignedButton: boolean;
  unassignedTotal: number;
  visibleAfterPrevDayRule: number;
  claimableCount: number;
  allowedKeysCount: number;
  allowedKeys: string[];
  requiredDaily: Record<string, number>;
  countsByDay: Record<string, Record<string, number>>;
  missingCounts: Record<string, number>;
};

const SERVICE_LINE_PALETTE = [
  {
    header: "bg-pink-50/50 border-pink-100 text-pink-900",
    cell: "bg-pink-50 text-pink-700 border-pink-200",
  },
  {
    header: "bg-blue-50/50 border-blue-100 text-blue-900",
    cell: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    header: "bg-amber-50/50 border-amber-100 text-amber-900",
    cell: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    header: "bg-violet-50/50 border-violet-100 text-violet-900",
    cell: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    header: "bg-emerald-50/50 border-emerald-100 text-emerald-900",
    cell: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
];

const FALLBACK_SERVICE_LINES = [
  { key: "kreiszimmer", label: "Kreißzimmer", sortOrder: 1, isActive: true },
  { key: "gyn", label: "Gyn-Dienst", sortOrder: 2, isActive: true },
  { key: "turnus", label: "Turnus", sortOrder: 3, isActive: true },
  { key: "overduty", label: "Überdienst", sortOrder: 4, isActive: true },
];

const buildServiceLineDisplay = (
  lines: ServiceLine[],
  shifts: RosterShift[],
) => {
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
      style: SERVICE_LINE_PALETTE[index % SERVICE_LINE_PALETTE.length],
    }));
};

const SHIFT_STATUS_BADGES: Record<
  string,
  { icon: typeof Clock; className: string }
> = {
  Ausstehend: { icon: Clock, className: "text-amber-600 border-amber-300" },
  Genehmigt: { icon: Check, className: "text-green-600 border-green-300" },
  Abgelehnt: { icon: X, className: "text-red-600 border-red-300" },
};

type RosterAbsenceEntry = {
  employeeId: number;
  name: string;
  reason: string;
  source: "planned" | "long_term" | "legacy";
  absenceId?: number;
  status?: "Geplant" | "Genehmigt" | "Abgelehnt";
  notes?: string | null;
};

export default function Personal() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();
  const { token, user, isAdmin, isTechnicalAdmin } = useAuth();
  const { toast } = useToast();
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isExternalDuty = user?.accessScope === "external_duty";
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [unassignedDebug, setUnassignedDebug] =
    useState<OpenShiftDebugDetail | null>(null);

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<
        number | { count?: number }
      >).detail;
      const count =
        typeof detail === "number"
          ? detail
          : typeof detail?.count === "number"
            ? detail.count
            : 0;
      setUnassignedCount(Number(count));
    };
    window.addEventListener(
      "mycliniq:unassignedCount",
      handler as unknown as EventListener,
    );
    return () =>
      window.removeEventListener(
        "mycliniq:unassignedCount",
        handler as unknown as EventListener,
      );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenShiftDebugDetail>).detail;
      setUnassignedDebug(detail ?? null);
    };
    window.addEventListener(
      "mycliniq:unassignedDebug",
      handler as unknown as EventListener,
    );
    return () =>
      window.removeEventListener(
        "mycliniq:unassignedDebug",
        handler as unknown as EventListener,
      );
  }, []);

  const handleSubscribe = async () => {
    if (!token) {
      toast({
        title: "Nicht angemeldet",
        description:
          "Bitte melden Sie sich erneut an, um den Kalender zu abonnieren.",
        variant: "destructive",
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
        description:
          "Der Abo-Link wurde geöffnet und in die Zwischenablage kopiert.",
      });
    } catch (error) {
      window.open(calendarUrl, "_blank");
      toast({
        title: "Kalender-Abo",
        description: "Der Abo-Link wurde geöffnet.",
      });
    }
  };

  const handleExport = async () => {
    if (!token) {
      toast({
        title: "Nicht angemeldet",
        description:
          "Bitte melden Sie sich erneut an, um den Dienstplan zu exportieren.",
        variant: "destructive",
      });
      return;
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setExporting(true);
    try {
      const response = await fetch(
        `/api/roster/export?year=${year}&month=${month}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
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
        variant: "destructive",
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
            <p className="text-muted-foreground">
              Monatsdienstplan, Wochenplan und Urlaubsplanung.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleSubscribe}
              data-testid="button-subscribe"
            >
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
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setLocation("/dienstwuensche")}
            data-testid="button-shift-wishes"
          >
            <CalendarDays className="w-4 h-4" />
            Dienstwünsche
          </Button>
          {!isExternalDuty && unassignedCount > 0 && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                  window.dispatchEvent(new Event("mycliniq:openUnassigned"))
                }
                data-testid="button-unassigned-shifts-top"
              >
                Unbesetzte Dienste
                <Badge variant="outline" className="h-5 px-1.5">
                  {unassignedCount}
                </Badge>
              </Button>
            )}
          </div>
        </div>

        {debugEnabled && token && (
          <div className="rounded-lg border border-border bg-slate-50/60 p-3 text-xs text-muted-foreground space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Unbesetzte Dienste Debug
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <span className="font-medium">unassignedCount</span>
              <span>{unassignedCount}</span>

              <span className="font-medium">planStatus</span>
              <span>{unassignedDebug?.planStatus ?? "—"}</span>

              <span className="font-medium">statusAllowed</span>
              <span>{String(unassignedDebug?.statusAllowed ?? false)}</span>

              <span className="font-medium">showUnassignedButton</span>
              <span>{String(unassignedDebug?.showUnassignedButton ?? false)}</span>

              <span className="font-medium">unassignedTotal</span>
              <span>{unassignedDebug?.unassignedTotal ?? "—"}</span>

              <span className="font-medium">visibleAfterPrevDayRule</span>
              <span>{unassignedDebug?.visibleAfterPrevDayRule ?? "—"}</span>

              <span className="font-medium">claimableCount</span>
              <span>{unassignedDebug?.claimableCount ?? "—"}</span>

              <span className="font-medium">allowedKeysCount</span>
              <span>{unassignedDebug?.allowedKeysCount ?? 0}</span>

              <span className="font-medium">allowedKeys</span>
              <span className="break-words">
                {isAdmin || isTechnicalAdmin
                  ? (unassignedDebug?.allowedKeys?.length
                      ? unassignedDebug.allowedKeys.join(", ")
                      : "—")
                  : `(${unassignedDebug?.allowedKeysCount ?? 0})`}
              </span>
              <span className="font-medium">missingCounts</span>
              <span className="break-words">
                {JSON.stringify(unassignedDebug?.missingCounts ?? {})}
              </span>
              <span className="font-medium">requiredDaily</span>
              <span className="break-words">
                {JSON.stringify(unassignedDebug?.requiredDaily ?? {})}
              </span>
            </div>
          </div>
        )}

        <Tabs defaultValue="roster" className="space-y-6">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger
              value="roster"
              className="rounded-lg px-6 h-10"
              data-testid="tab-roster"
            >
              Dienstplan
            </TabsTrigger>
            <TabsTrigger
              value="weekly"
              className="rounded-lg px-6 h-10"
              data-testid="tab-weekly"
            >
              Wochenplan
            </TabsTrigger>
            <TabsTrigger
              value="vacation"
              className="rounded-lg px-6 h-10"
              data-testid="tab-vacation"
            >
              Urlaubsplanung
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="roster"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <RosterView
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
            />
          </TabsContent>

          <TabsContent
            value="weekly"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <WeeklyView />
          </TabsContent>

          <TabsContent
            value="vacation"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <VacationPlanEditor embedded />
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

function RosterView({
  currentDate,
  setCurrentDate,
}: {
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
}) {
  const { employee: currentUser, user, token } = useAuth();
  const { toast } = useToast();
  const [dutyPlan, setDutyPlan] = useState<DutyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [openShiftSlots, setOpenShiftSlots] = useState<OpenShiftSlot[]>([]);
  const [openShiftMeta, setOpenShiftMeta] = useState<OpenShiftResponse | null>(null);
  const [plannedAbsences, setPlannedAbsences] = useState<PlannedAbsenceAdmin[]>(
    [],
  );
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>(
    [],
  );
  const isExternalDuty = user?.accessScope === "external_duty";
  const [unassignedDialogOpen, setUnassignedDialogOpen] = useState(false);
  const [claimingShiftId, setClaimingShiftId] = useState<string | number | null>(null);

  const planStatus = dutyPlan?.status;
  const statusLabel = planStatus ? PLAN_STATUS_LABELS[planStatus] : "Vorschau";
  const isPlanStatusAllowingUnassigned = planStatus
    ? ALLOWED_UNASSIGNED_STATUSES.has(planStatus)
    : false;
  const serviceLineDisplay = useMemo(
    () => buildServiceLineDisplay(serviceLines, shifts),
    [serviceLines, shifts],
  );
  const serviceLineLookup = useMemo(() => {
    return new Map(serviceLineDisplay.map((line) => [line.key, line]));
  }, [serviceLineDisplay]);
  const rosterColumnCount = 3 + serviceLineDisplay.length + 1;
  const activePlannedAbsences = useMemo(
    () => plannedAbsences.filter((absence) => absence.status !== "Abgelehnt"),
    [plannedAbsences],
  );

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      }),
    [currentDate],
  );
  const dayStrings = useMemo(
    () => days.map((day) => format(day, "yyyy-MM-dd")),
    [days],
  );

  const isRelevantServiceType = (serviceType: string, label?: string) => {
    const hay = `${serviceType ?? ""} ${label ?? ""}`.toLowerCase();
    return (
      hay.includes("turnus") ||
      hay.includes("gyn") ||
      hay.includes("geb") ||
      hay.includes("geburt") ||
      hay.includes("kreis") ||
      hay.includes("kreiß")
    );
  };

  const myDutyDates = useMemo(() => {
    if (!currentUser?.id) return new Set<string>();
    return new Set(
      shifts
        .filter((shift) => shift.employeeId === currentUser.id)
        .map((shift) => format(parseISO(shift.date), "yyyy-MM-dd")),
    );
  }, [currentUser?.id, shifts]);

  const visibleOpenShiftSlots = useMemo(() => {
    if (!currentUser?.id) return openShiftSlots;
    return openShiftSlots.filter((slot) => {
      const prevDate = format(subDays(parseISO(slot.date), 1), "yyyy-MM-dd");
      return !myDutyDates.has(prevDate);
    });
  }, [currentUser?.id, myDutyDates, openShiftSlots]);

  // --- Service line helpers using employee record assignments ---
  const currentEmployee = useMemo(() => {
    if (!currentUser?.id) return null;

    const fromList = employees.find((emp) => emp.id === currentUser.id) ?? null;
    const fromAuth = (currentUser as unknown as Employee) ?? null;

    const hasCandidate = (value: unknown) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "string") return value.trim().length > 0;
      if (typeof value === "object") return true;
      return Boolean(value);
    };

    const candList = fromList ? getEmployeeServiceLineCandidate(fromList) : null;
    const candAuth = fromAuth ? getEmployeeServiceLineCandidate(fromAuth) : null;

    if (hasCandidate(candList)) return fromList;
    if (hasCandidate(candAuth)) return fromAuth;

    return fromList ?? fromAuth;
  }, [employees, currentUser]);

  const effectiveAllowedKeys = useMemo(() => {
    const employeeContext = currentEmployee ?? currentUser;
    return getEffectiveServiceLineKeys(employeeContext, serviceLines);
  }, [currentEmployee, currentUser, serviceLines]);

  const claimableServiceLineKeySet = useMemo(
    () =>
      new Set(
        serviceLines
          .filter((line) => line.isActive !== false && line.allowsClaim)
          .map((line) => line.key),
      ),
    [serviceLines],
  );

  const swapableServiceLineKeySet = useMemo(
    () =>
      new Set(
        serviceLines
          .filter((line) => line.isActive !== false && line.allowsSwap)
          .map((line) => line.key),
      ),
    [serviceLines],
  );

  const effectiveClaimKeys = useMemo(
    () =>
      new Set(
        [...effectiveAllowedKeys].filter((key) =>
          claimableServiceLineKeySet.has(key),
        ),
      ),
    [claimableServiceLineKeySet, effectiveAllowedKeys],
  );

  const canCurrentUserTakeShift = (shift: { serviceType: string }) => {
    if (isExternalDuty) return false;
    if (!token) return false;
    if (!currentUser?.id) return false;
    if (effectiveClaimKeys.size === 0) return false;
    return effectiveClaimKeys.has(shift.serviceType);
  };

  const claimableOpenShiftSlots = useMemo(() => {
    if (isExternalDuty) return [] as OpenShiftSlot[];
    if (!token) return [] as OpenShiftSlot[];
    if (!currentUser?.id) return [] as OpenShiftSlot[];
    if (effectiveAllowedKeys.size === 0) return [];
    return visibleOpenShiftSlots.filter((slot) =>
      effectiveClaimKeys.has(slot.serviceType),
    );
  }, [
    isExternalDuty,
    token,
    currentUser?.id,
    effectiveClaimKeys,
    visibleOpenShiftSlots,
  ]);

  const showUnassignedButton =
    !isExternalDuty &&
    isPlanStatusAllowingUnassigned &&
    effectiveClaimKeys.size > 0 &&
    claimableOpenShiftSlots.length > 0;

  const allowedKeysForDebug = useMemo(
    () => Array.from(effectiveClaimKeys).slice(0, 30),
    [effectiveClaimKeys],
  );

  const openShiftDebugDetail = useMemo<OpenShiftDebugDetail>(
    () => ({
      planStatus: planStatus ?? null,
      statusAllowed: isPlanStatusAllowingUnassigned,
      showUnassignedButton,
      unassignedTotal: openShiftSlots.length,
      visibleAfterPrevDayRule: visibleOpenShiftSlots.length,
      claimableCount: claimableOpenShiftSlots.length,
      allowedKeysCount: effectiveClaimKeys.size,
      allowedKeys: allowedKeysForDebug,
      requiredDaily: openShiftMeta?.requiredDaily ?? {},
      countsByDay: openShiftMeta?.countsByDay ?? {},
      missingCounts: openShiftMeta?.missingCounts ?? {},
    }),
    [
      planStatus,
      isPlanStatusAllowingUnassigned,
      showUnassignedButton,
      openShiftSlots.length,
      visibleOpenShiftSlots.length,
      claimableOpenShiftSlots.length,
      effectiveClaimKeys,
      allowedKeysForDebug,
      openShiftMeta,
    ],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    console.log("currentEmployee.id", currentEmployee?.id ?? null);
    console.log("employeeAllowedKeys", allowedKeysForDebug);
    console.log(
      "sample shift.serviceType",
      shifts.slice(0, 10).map((s) => s.serviceType),
    );
    console.log(
      "sample claimable (serviceType/date)",
      claimableOpenShiftSlots.slice(0, 10).map((s) => ({
        date: s.date,
        serviceType: s.serviceType,
      })),
    );
    console.log("planStatus", planStatus);
    console.log("statusAllowed", isPlanStatusAllowingUnassigned);
    console.log("openShiftSlots.count", openShiftSlots.length);
    console.log(
      "visibleAfterPrevDayRule.count",
      visibleOpenShiftSlots.length,
    );
    console.log(
      "claimableOpenShiftSlots.count",
      claimableOpenShiftSlots.length,
    );
  }, [
    allowedKeysForDebug,
    shifts,
    planStatus,
    isPlanStatusAllowingUnassigned,
    openShiftSlots.length,
    visibleOpenShiftSlots.length,
    claimableOpenShiftSlots.length,
  ]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const detail = {
      count: showUnassignedButton ? claimableOpenShiftSlots.length : 0,
      missingCounts: openShiftDebugDetail.missingCounts,
      requiredDaily: openShiftDebugDetail.requiredDaily,
      countsByDay: openShiftDebugDetail.countsByDay,
    };
    window.dispatchEvent(
      new CustomEvent("mycliniq:unassignedCount", {
        detail,
      }),
    );
  }, [
    showUnassignedButton,
    claimableOpenShiftSlots.length,
    openShiftDebugDetail,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mycliniq:unassignedDebug", {
        detail: openShiftDebugDetail,
      }),
    );
  }, [openShiftDebugDetail]);

  const handleTakeShift = async (slot: OpenShiftSlot) => {
    if (!token) {
      toast({
        title: "Nicht angemeldet",
        description: "Bitte melden Sie sich erneut an.",
        variant: "destructive",
      });
      return;
    }
    if (!currentUser?.id) return;
    if (!canCurrentUserTakeShift(slot)) return;

    const shiftKey = slot.isSynthetic ? slot.syntheticId : slot.id;
    setClaimingShiftId(shiftKey ?? null);
    try {
      if (slot.isSynthetic) {
        await rosterApi.claimOpenShift({
          date: slot.date,
          serviceType: slot.serviceType,
          slotIndex: slot.slotIndex,
        });
      } else {
        if (!slot.id) {
          throw new Error("Ungültiger Dienst");
        }
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        const response = await fetch(`/api/roster/${slot.id}/claim`, {
          method: "POST",
          headers,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `HTTP ${response.status}`);
        }
      }

      const serviceLabel =
        serviceLineLookup.get(slot.serviceType)?.label ?? slot.serviceType;

      toast({
        title: "Dienst übernommen",
        description: `${serviceLabel} am ${format(
          parseISO(slot.date),
          "dd.MM",
          { locale: de },
        )} wurde übernommen.`,
      });

      await loadRoster();
    } catch (error: any) {
      toast({
        title: "Übernahme fehlgeschlagen",
        description: error?.message || "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    } finally {
      setClaimingShiftId(null);
    }
  };
  
  useEffect(() => {
    const handler = () => setUnassignedDialogOpen(true);
    window.addEventListener("mycliniq:openUnassigned", handler);
    return () => window.removeEventListener("mycliniq:openUnassigned", handler);
  }, []);

  const loadRoster = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const startDate = format(startOfMonth(currentDate), "yyyy-MM-dd");
    const endDate = format(endOfMonth(currentDate), "yyyy-MM-dd");
    setPlanLoading(true);
    setRosterLoading(true);
    try {
      const [
        plan,
        rosterData,
        employeeData,
        plannedAbsenceData,
        openShiftData,
      ] = await Promise.all([
        dutyPlansApi.getByMonth(year, month),
        rosterApi.getByMonth(year, month),
        isExternalDuty ? Promise.resolve([]) : employeeApi.getAll(),
        isExternalDuty
          ? Promise.resolve([])
          : plannedAbsencesAdminApi.getRange({ from: startDate, to: endDate }),
        rosterApi.getOpenShifts(year, month),
      ]);
      let serviceLineData: ServiceLine[] = [];
      try {
        serviceLineData = await serviceLinesApi.getAll(
          getServiceLineContextFromEmployee(currentUser),
        );
      } catch {
        serviceLineData = [];
      }
      let longTermAbsenceData: LongTermAbsence[] = [];
      try {
        longTermAbsenceData = await longTermAbsencesApi.getByStatus(
          "Genehmigt",
          startDate,
          endDate,
        );
      } catch {
        longTermAbsenceData = [];
      }
      setDutyPlan(plan);
      setShifts(rosterData);
      setEmployees(employeeData);
      setServiceLines(serviceLineData);
      setPlannedAbsences(plannedAbsenceData);
      setLongTermAbsences(longTermAbsenceData);
      setOpenShiftSlots(openShiftData.slots);
      setOpenShiftMeta(openShiftData);
    } catch (error: any) {
      setOpenShiftSlots([]);
      setOpenShiftMeta(null);
      toast({
        title: "Fehler",
        description: error.message || "Dienstplan konnte nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setPlanLoading(false);
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, [currentDate, isExternalDuty]);

  const employeesById = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees],
  );
  const shiftsByDate = shifts.reduce<
    Record<string, Record<string, RosterShift>>
  >((acc, shift) => {
    if (!acc[shift.date]) {
      acc[shift.date] = {};
    }
    acc[shift.date][shift.serviceType] = shift;
    return acc;
  }, {});


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
    Boolean(
      shift?.employeeId &&
      currentUser?.id &&
      shift.employeeId === currentUser.id,
    );
  const getBadgeClass = (style: { cell: string }, highlight: boolean) => {
    // Nur der eigene Dienst farbig, alle anderen schlicht grau – unabhängig vom Plan-Status.
    if (highlight) return style.cell;
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  type LegacyInactiveEmployeeLike = Pick<
    Employee,
    "inactiveFrom" | "inactiveUntil"
  >;

  const isLegacyInactiveOnDate = (
    employee: LegacyInactiveEmployeeLike,
    dateStr: string,
  ) => {
    if (!employee.inactiveFrom && !employee.inactiveUntil) return false;
    const target = new Date(`${dateStr}T00:00:00`);
    const from = employee.inactiveFrom
      ? new Date(`${employee.inactiveFrom}T00:00:00`)
      : null;
    const until = employee.inactiveUntil
      ? new Date(`${employee.inactiveUntil}T00:00:00`)
      : null;
    if (from && until) return target >= from && target <= until;
    if (from) return target >= from;
    if (until) return target <= until;
    return false;
  };

  const resolveEmployeeLastName = (
    employeeId: number,
    fallbackName?: string | null,
    fallbackLastName?: string | null,
  ) => {
    const employee = employeesById.get(employeeId);
    if (employee?.lastName) return employee.lastName;
    if (employee?.name) return getLastName(employee.name);
    if (fallbackLastName) return getLastName(fallbackLastName);
    if (fallbackName) return getLastName(fallbackName);
    return "Unbekannt";
  };

  const getAbsencesForDate = (date: Date): RosterAbsenceEntry[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const plannedEntries: RosterAbsenceEntry[] = activePlannedAbsences
      .filter(
        (absence) => absence.startDate <= dateStr && absence.endDate >= dateStr,
      )
      .map(
        (absence): RosterAbsenceEntry => ({
          employeeId: absence.employeeId,
          name: resolveEmployeeLastName(
            absence.employeeId,
            absence.employeeName,
            absence.employeeLastName,
          ),
          reason: absence.reason,
          source: "planned",
          absenceId: absence.id,
          status: absence.status,
          notes: absence.notes ?? null,
        }),
      );

    // Langzeit-Abwesenheiten (long_term / legacy) werden im Dienstplan immer ausgeblendet.
    return [...plannedEntries].sort((a, b) => a.name.localeCompare(b.name));
  };

  const myShifts = currentUser
    ? shifts.filter((shift) => shift.employeeId === currentUser.id)
    : [];
  const weekendCount = myShifts.filter((shift) => {
    const date = new Date(`${shift.date}T00:00:00`);
    const day = date.getDay();
    return day === 0 || day === 6;
  }).length;

  const myAbsenceCount = useMemo(() => {
    if (!currentUser) return 0;
    const userRecord = employeesById.get(currentUser.id) ?? currentUser;
    return dayStrings.filter((dateStr) => {
      const planned = activePlannedAbsences.some(
        (absence) =>
          absence.employeeId === currentUser.id &&
          absence.startDate <= dateStr &&
          absence.endDate >= dateStr,
      );
      const longTerm = longTermAbsences.some(
        (absence) =>
          absence.employeeId === currentUser.id &&
          absence.status === "Genehmigt" &&
          absence.startDate <= dateStr &&
          absence.endDate >= dateStr,
      );
      const legacy = userRecord
        ? isLegacyInactiveOnDate(userRecord, dateStr)
        : false;
      return planned || longTerm || legacy;
    }).length;
  }, [
    currentUser,
    dayStrings,
    activePlannedAbsences,
    longTermAbsences,
    employeesById,
  ]);

  return (
    <div className="space-y-6">
      <Card className="border-none kabeg-shadow overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {format(currentDate, "MMMM yyyy", { locale: de })}
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
              {planLoading
                ? "Status wird geladen..."
                : `Status: ${statusLabel}`}
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
                <th className="px-2 py-2 text-left font-medium w-16">KW</th>
                <th className="px-2 py-2 text-left font-medium w-12">Tag</th>
                <th className="px-2 py-2 text-left font-medium w-24">Datum</th>
                {serviceLineDisplay.map((line) => (
                  <th key={line.key} className="px-2 py-2 text-left font-medium">
                    {line.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-left font-medium">Abwesenheiten</th>
              </tr>
            </thead>
            <tbody>
              {rosterLoading ? (
                <tr>
                  <td
                    colSpan={rosterColumnCount}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Dienstplan wird geladen...
                  </td>
                </tr>
              ) : (
                days.map((day, i) => {
                  const weekNumber = getWeek(day, {
                    weekStartsOn: 1,
                    firstWeekContainsDate: 4,
                  });
                  const prevWeekNumber =
                    i > 0
                      ? getWeek(days[i - 1], {
                          weekStartsOn: 1,
                          firstWeekContainsDate: 4,
                        })
                      : null;
                  const showKW = i === 0 || weekNumber !== prevWeekNumber;
                  const dayLabel = format(day, "EEE", { locale: de }).replace(
                    ".",
                    "",
                  );
                  const dateLabel = format(day, "dd.MM", { locale: de });
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
                        highlightRow && "bg-amber-50/60",
                      )}
                      data-testid={`roster-row-${dateKey}`}
                    >
                      <td className="px-2 py-1.5 font-medium text-primary">
                        {showKW ? weekNumber : ""}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 font-medium",
                          highlightRow && "text-rose-600",
                        )}
                      >
                        {dayLabel}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-muted-foreground",
                          highlightRow && "text-rose-600",
                        )}
                      >
                        {dateLabel}
                      </td>
                      {serviceLineDisplay.map((line) => {
                        const shift = dayShifts[line.key];
                        const label = getShiftDisplay(shift);
                        return (
                          <td key={line.key} className="px-2 py-1.5">
                            {label !== "-" ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  getBadgeClass(line.style, isMyShift(shift)),
                                  "px-2 py-0.5 text-sm leading-5",
                                )}
                              >
                                {label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-muted-foreground text-xs">
                        {(() => {
                          const dayAbsences = getAbsencesForDate(day);
                          if (!dayAbsences.length) {
                            return (
                              <span className="text-muted-foreground">-</span>
                            );
                          }
                          return (
                            <div className="flex flex-wrap gap-1">
                              {dayAbsences.map((absence) => {
                                const titleParts = [
                                  absence.name,
                                  absence.reason,
                                  absence.status ? `(${absence.status})` : null,
                                ].filter(Boolean);
                                if (absence.notes) {
                                  titleParts.push(absence.notes);
                                }
                                return (
                                  <span
                                    key={`${absence.source}-${absence.employeeId}-${absence.absenceId ?? absence.reason}`}
                                    className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                    title={titleParts.join(" · ")}
                                  >
                                    {absence.name}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={unassignedDialogOpen}
        onOpenChange={setUnassignedDialogOpen}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Unbesetzte Dienste ({claimableOpenShiftSlots.length})
            </DialogTitle>
            <DialogDescription>
              Offene Dienste im aktuellen Monat (Geburtshilfe/Kreißzimmer, Gynäkologie, Turnus)
              die Sie übernehmen dürfen.
            </DialogDescription>
          </DialogHeader>

          {claimableOpenShiftSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine freien Dienste für Sie verfügbar.
            </p>
          ) : (
            <div className="space-y-3">
              {claimableOpenShiftSlots.map((slot) => {
                const slotKey = slot.isSynthetic
                  ? slot.syntheticId
                  : slot.id ?? `${slot.date}:${slot.serviceType}`;
                const serviceLabel =
                  serviceLineLookup.get(slot.serviceType)?.label ??
                  slot.serviceType;

                return (
                  <div
                    key={slotKey}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {format(parseISO(slot.date), "EEE, dd.MM", {
                            locale: de,
                          })}
                          {" · "}
                          {serviceLabel}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => {
                          if (claimingShiftId == null) handleTakeShift(slot);
                        }}
                        disabled={claimingShiftId === slotKey}
                        className="gap-2"
                      >
                        {claimingShiftId === slotKey && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {claimingShiftId === slotKey ? "Übernehme..." : "Übernehmen"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="border-none kabeg-shadow">
        <CardHeader>
          <CardTitle className="text-base">Monatsübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
              <p className="text-sm text-muted-foreground">Anzahl Dienste</p>
              <p className="text-2xl font-bold text-primary">
                {myShifts.length}
              </p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-sm text-muted-foreground">Abwesenheiten</p>
              <p className="text-2xl font-bold text-amber-700">
                {myAbsenceCount}
              </p>
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
  currentDate,
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
  const [incomingRequests, setIncomingRequests] = useState<ShiftSwapRequest[]>(
    [],
  );
  const [sourceShiftId, setSourceShiftId] = useState("");
  const [targetShiftIds, setTargetShiftIds] = useState<number[]>([]);
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
      const [shiftData, employeeData, myData, incomingData] = await Promise.all(
        [
          rosterApi.getByMonth(year, month),
          employeeApi.getAll(),
          shiftSwapApi.getByEmployee(currentUser.id),
          shiftSwapApi.getByTargetEmployee(currentUser.id),
        ],
      );
      let serviceLineData: ServiceLine[] = [];
      try {
        serviceLineData = await serviceLinesApi.getAll(
          getServiceLineContextFromEmployee(currentUser),
        );
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
        description:
          error.message || "Diensttausch-Daten konnten nicht geladen werden",
        variant: "destructive",
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
  const now = new Date();
  const isCurrentMonth =
    currentDate.getFullYear() === now.getFullYear() &&
    currentDate.getMonth() === now.getMonth();
  const remainingMonthStart = startOfDay(now);
  const isShiftInRemainingMonth = (shift: RosterShift) => {
    if (!isCurrentMonth) return true;
    return parseISO(shift.date) >= remainingMonthStart;
  };
  const swapableServiceLineKeySet = useMemo(
    () =>
      new Set(
        serviceLines
          .filter((line) => line.isActive !== false && line.allowsSwap)
          .map((line) => line.key),
      ),
    [serviceLines],
  );

  const effectiveSwapKeys = useMemo(() => {
    const allowed = getEffectiveServiceLineKeys(currentUser, serviceLines);
    return new Set(
      [...allowed].filter((key) => swapableServiceLineKeySet.has(key)),
    );
  }, [currentUser, serviceLines, swapableServiceLineKeySet]);
  const isSwapEligibleShift = (shift: RosterShift) =>
    Boolean(shift.serviceType) &&
    effectiveSwapKeys.has(shift.serviceType);
  const myShifts = shifts
    .filter((shift) => shift.employeeId === currentUser?.id)
    .filter(isShiftInRemainingMonth)
    .filter(isSwapEligibleShift)
    .sort((a, b) => a.date.localeCompare(b.date));
  const targetShifts = shifts
    .filter((shift) => shift.employeeId && shift.employeeId !== currentUser?.id)
    .filter(isShiftInRemainingMonth)
    .filter(isSwapEligibleShift)
    .sort((a, b) => a.date.localeCompare(b.date));

  const formatShiftOption = (shift: RosterShift) => {
    const dateLabel = format(parseISO(shift.date), "dd.MM.yyyy", {
      locale: de,
    });
    const serviceLabel =
      serviceLineLabelLookup.get(shift.serviceType) || shift.serviceType;
    const assignee = shift.employeeId
      ? employeesById.get(shift.employeeId)?.name
      : shift.assigneeFreeText;
    return `${dateLabel} · ${serviceLabel} · ${assignee || "Unbekannt"}`;
  };

  const selectedSourceShift = sourceShiftId
    ? shiftsById.get(Number(sourceShiftId))
    : null;
  const selectedTargetShifts = targetShiftIds
    .map((shiftId) => shiftsById.get(shiftId))
    .filter((shift): shift is RosterShift => Boolean(shift));
  const incomingPending = incomingRequests.filter(
    (req) => req.status === "Ausstehend",
  );

  const toggleTargetShift = (
    shiftId: number,
    checked: boolean | "indeterminate",
  ) => {
    setTargetShiftIds((prev) => {
      if (checked) {
        return prev.includes(shiftId) ? prev : [...prev, shiftId];
      }
      return prev.filter((id) => id !== shiftId);
    });
  };

  const handleSubmitSwapRequest = async () => {
    const uniqueTargetIds = [...new Set(targetShiftIds)];
    const targetShiftsSelected = uniqueTargetIds
      .map((shiftId) => shiftsById.get(shiftId))
      .filter((shift): shift is RosterShift => Boolean(shift));
    const validTargets = targetShiftsSelected.filter(
      (shift) => shift.employeeId,
    );
    if (!currentUser || !selectedSourceShift || validTargets.length === 0) {
      toast({
        title: "Unvollständige Auswahl",
        description:
          "Bitte einen eigenen Dienst und mindestens einen Ziel-Dienst auswählen.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        validTargets.map((shift) =>
          shiftSwapApi.create({
            requesterId: currentUser.id,
            requesterShiftId: selectedSourceShift.id,
            targetShiftId: shift.id,
            targetEmployeeId: shift.employeeId!,
            reason: reason || null,
            status: "Ausstehend",
          }),
        ),
      );
      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const errorCount = results.length - successCount;
      if (successCount > 0) {
        toast({
          title: "Anfrage gesendet",
          description: `${successCount} Anfrage(n) wurden eingereicht.`,
        });
      }
      if (errorCount > 0) {
        toast({
          title: "Teilweise fehlgeschlagen",
          description: `${errorCount} Anfrage(n) konnten nicht gesendet werden.`,
          variant: "destructive",
        });
      }
      setSourceShiftId("");
      setTargetShiftIds([]);
      setReason("");
      loadData();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error.message || "Die Anfrage konnte nicht gesendet werden.",
        variant: "destructive",
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
      toast({
        title: "Tausch genehmigt",
        description: "Die Dienste wurden getauscht.",
      });
      loadData();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Genehmigung fehlgeschlagen.",
        variant: "destructive",
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
      toast({
        title: "Tausch abgelehnt",
        description: "Die Anfrage wurde abgelehnt.",
      });
      loadData();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Ablehnung fehlgeschlagen.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const renderShiftSummary = (shiftId?: number | null) => {
    if (!shiftId) return "Unbekannter Dienst";
    const shift = shiftsById.get(shiftId);
    if (!shift) return `Dienst #${shiftId}`;
    const dateLabel = format(parseISO(shift.date), "dd.MM.yyyy", {
      locale: de,
    });
    const serviceLabel =
      serviceLineLabelLookup.get(shift.serviceType) || shift.serviceType;
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
                  <Select
                    value={sourceShiftId}
                    onValueChange={setSourceShiftId}
                  >
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
                  <Label>Ziel-Dienste (Mehrfachauswahl)</Label>
                  <div className="rounded-md border border-border p-2">
                    <ScrollArea className="h-48 pr-2">
                      {targetShifts.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-2 py-1">
                          Keine Ziel-Dienste verfügbar
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {targetShifts.map((shift) => (
                            <label
                              key={shift.id}
                              className="flex items-start gap-2 px-2 py-1"
                            >
                              <Checkbox
                                checked={targetShiftIds.includes(shift.id)}
                                onCheckedChange={(checked) =>
                                  toggleTargetShift(shift.id, checked)
                                }
                              />
                              <span className="text-sm leading-5">
                                {formatShiftOption(shift)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
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
                  disabled={
                    submitting || !sourceShiftId || targetShiftIds.length === 0
                  }
                  className="w-full"
                  data-testid="button-submit-swap"
                >
                  {submitting && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
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
                    <Card
                      key={request.id}
                      data-testid={`card-my-swap-${request.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            {renderStatusBadge(request.status)}
                            <p className="text-sm font-medium">
                              Mein Dienst:{" "}
                              {renderShiftSummary(request.requesterShiftId)}
                            </p>
                            <p className="text-sm">
                              Ziel: {renderShiftSummary(request.targetShiftId)}
                            </p>
                            {request.reason && (
                              <p className="text-xs text-muted-foreground">
                                {request.reason}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(
                              new Date(request.requestedAt),
                              "dd.MM.yyyy",
                              { locale: de },
                            )}
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
                    <Card
                      key={request.id}
                      data-testid={`card-incoming-swap-${request.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            {renderStatusBadge(request.status)}
                            <p className="text-sm font-medium">
                              Anfrage von{" "}
                              {employeesById.get(request.requesterId)?.name ||
                                "Unbekannt"}
                            </p>
                            <p className="text-sm">
                              Mein Dienst:{" "}
                              {renderShiftSummary(request.targetShiftId)}
                            </p>
                            <p className="text-sm">
                              Tausch mit:{" "}
                              {renderShiftSummary(request.requesterShiftId)}
                            </p>
                            {request.reason && (
                              <p className="text-xs text-muted-foreground">
                                {request.reason}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs text-muted-foreground">
                              {format(
                                new Date(request.requestedAt),
                                "dd.MM.yyyy",
                                { locale: de },
                              )}
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
  const { employee: currentUser, token } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [rooms, setRooms] = useState<WeeklyPlanRoom[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plannedAbsences, setPlannedAbsences] = useState<PlannedAbsenceAdmin[]>(
    [],
  );
  const [rosterShifts, setRosterShifts] = useState<RosterShift[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getWeeklyCalendarUrl = () => {
    if (!token || typeof window === "undefined") return null;
    const baseUrl = window.location.origin.replace(/\/$/, "");
    return `${baseUrl}/api/weekly/calendar?token=${encodeURIComponent(
      token,
    )}&weeks=8`;
  };

  const handleWeeklySubscribe = async () => {
    const calendarUrl = getWeeklyCalendarUrl();
    if (!calendarUrl) {
      toast({
        title: "Fehler",
        description: "Kalenderlink konnte nicht erstellt werden.",
        variant: "destructive",
      });
      return;
    }

    const webcalUrl = calendarUrl.replace(/^https?:\/\//, "webcal://");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(calendarUrl);
      }
      window.open(webcalUrl, "_blank");
      toast({
        title: "Wochenplan abonnieren",
        description: "Der Abo-Link wurde geöffnet und kopiert.",
      });
    } catch (error) {
      window.open(calendarUrl, "_blank");
      toast({
        title: "Wochenplan abonnieren",
        description: "Der Abo-Link wurde geöffnet.",
      });
    }
  };

  const handleCopyWeeklyLink = async () => {
    const calendarUrl = getWeeklyCalendarUrl();
    if (!calendarUrl) {
      toast({
        title: "Fehler",
        description: "Kalenderlink konnte nicht erstellt werden.",
        variant: "destructive",
      });
      return;
    }

    if (!navigator.clipboard?.writeText) {
      toast({
        title: "Link kopieren",
        description: "Clipboard wird nicht unterstützt.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(calendarUrl);
      toast({
        title: "Link kopieren",
        description: "Der Link wurde in die Zwischenablage kopiert.",
      });
    } catch (error) {
      toast({
        title: "Link kopieren",
        description: "Der Link konnte nicht kopiert werden.",
        variant: "destructive",
      });
    }
  };

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekNumber = useMemo(
    () => getWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekYear = useMemo(() => getYear(weekStart), [weekStart]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );

  const roomsSorted = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const order = (a.weeklyPlanSortOrder ?? 0) - (b.weeklyPlanSortOrder ?? 0);
      if (order !== 0) return order;
      return a.name.localeCompare(b.name);
    });
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    return roomsSorted.filter((room) => {
      const title = (room.name ?? "").toLowerCase();
      return (
        !title.includes("raum verwaltung") &&
        !title.includes("diensthabende am wochenende")
      );
    });
  }, [roomsSorted]);

  const employeesById = useMemo(() => {
    return new Map(employees.map((employee) => [employee.id, employee]));
  }, [employees]);

  const assignmentsByRoomWeekday = useMemo(() => {
    const map = new Map<string, WeeklyPlanResponse["assignments"]>();
    (weeklyPlan?.assignments || []).forEach((assignment) => {
      const key = `${assignment.roomId}-${assignment.weekday}`;
      const current = map.get(key) ?? [];
      current.push(assignment);
      map.set(key, current);
    });
    return map;
  }, [weeklyPlan]);

  const absencesByDate = useMemo(() => {
    const map = new Map<string, PlannedAbsenceAdmin[]>();
    plannedAbsences
      .filter((absence) => absence.status !== "Abgelehnt")
      .forEach((absence) => {
        const start = parseISO(absence.startDate);
        const end = parseISO(absence.endDate);
        eachDayOfInterval({ start, end }).forEach((date) => {
          const key = format(date, "yyyy-MM-dd");
          const current = map.get(key) ?? [];
          current.push(absence);
          map.set(key, current);
        });
      });
    return map;
  }, [plannedAbsences]);

  useEffect(() => {
    let active = true;
    const loadWeeklyPlan = async () => {
      setIsLoading(true);
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(weekEnd, "yyyy-MM-dd");
      const startMonth = getMonth(weekStart) + 1;
      const endMonth = getMonth(weekEnd) + 1;
      const startYear = getYear(weekStart);
      const endYear = getYear(weekEnd);
      try {
        const rosterPromises =
          startYear === endYear && startMonth === endMonth
            ? [rosterApi.getByMonth(startYear, startMonth)]
            : [
                rosterApi.getByMonth(startYear, startMonth),
                rosterApi.getByMonth(endYear, endMonth),
              ];

        const [roomData, employeeData, absenceData, rosterData] =
          await Promise.all([
            roomApi.getWeeklyPlan(),
            employeeApi.getAll(),
            plannedAbsencesAdminApi.getRange({ from, to }),
            Promise.all(rosterPromises).then((results) => results.flat()),
          ]);

        let planData: WeeklyPlanResponse | null = null;
        try {
          planData = await weeklyPlanApi.getByWeek(weekYear, weekNumber, false);
        } catch (error: any) {
          const message = error?.message || "";
          if (!message.toLowerCase().includes("wochenplan")) {
            throw error;
          }
        }

        if (!active) return;
        setRooms(roomData);
        setEmployees(employeeData);
        setPlannedAbsences(absenceData);
        const rosterMap = new Map<number, RosterShift>();
        rosterData.forEach((shift) => rosterMap.set(shift.id, shift));
        setRosterShifts([...rosterMap.values()]);
        setWeeklyPlan(planData);
      } catch (error: any) {
        if (!active) return;
        toast({
          title: "Fehler",
          description:
            error.message || "Wochenplan konnte nicht geladen werden",
          variant: "destructive",
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadWeeklyPlan();
    return () => {
      active = false;
    };
  }, [toast, weekStart, weekEnd, weekNumber, weekYear]);

  const statusLabel =
    weeklyPlan?.status === "Vorläufig"
      ? "Vorschau"
      : (weeklyPlan?.status ?? "Kein Plan");

  const resolveEmployeeName = (
    employeeId: number | null,
    fallback?: string | null,
    fallbackLast?: string | null,
  ) => {
    if (employeeId) {
      const employee = employeesById.get(employeeId);
      if (employee) {
        if (employee.firstName && employee.lastName) {
          return `${employee.firstName} ${employee.lastName}`;
        }
        return employee.name || employee.lastName || "";
      }
    }
    if (fallback || fallbackLast) {
      return [fallback, fallbackLast].filter(Boolean).join(" ");
    }
    return "Unbekannt";
  };

  const resolveAbsenceName = (absence: PlannedAbsenceAdmin) => {
    if (absence.employeeLastName) return absence.employeeLastName;
    if (absence.employeeId) {
      const employee = employeesById.get(absence.employeeId);
      return employee?.lastName || employee?.name || "Unbekannt";
    }
    return absence.employeeName || "Unbekannt";
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Der Wochenplan wird automatisch aus dem freigegebenen Dienstplan
          erzeugt. Kurzfristige Änderungen können von berechtigten Personen
          vorgenommen werden.
        </p>
      </div>

      <Card className="border-none kabeg-shadow overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Wochenplan KW {weekNumber} / {weekYear}
                  <Badge variant="outline" className="ml-2 text-xs">
                    {statusLabel}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {format(weekStart, "dd.MM.yyyy", { locale: de })} –{" "}
                  {format(weekEnd, "dd.MM.yyyy", { locale: de })}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWeeklySubscribe}
                    disabled={!token}
                  >
                    <Rss className="w-4 h-4" />
                    Wochenplan abonnieren
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyWeeklyLink}
                    disabled={!token}
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    Link kopieren
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Wochenplan wird geladen...
            </div>
          ) : visibleRooms.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Keine Arbeitsplätze für den Wochenplan gefunden.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="p-3 text-left font-medium w-56">
                      Arbeitsplatz
                    </th>
                    {weekDays.map((day, index) => (
                      <th
                        key={day.toISOString()}
                        className="p-3 text-center font-medium min-w-[120px]"
                      >
                        <div className="text-xs text-muted-foreground">
                          {WEEKDAY_LABELS[index]}
                        </div>
                        <div className="text-sm" title={WEEKDAY_FULL[index]}>
                          {format(day, "dd.MM", { locale: de })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRooms.map((room) => (
                    <tr
                      key={room.id}
                      className="border-b border-border align-top"
                    >
                      <td className="p-3">
                        <div className="font-medium">{room.name}</div>
                        {room.physicalRooms &&
                          room.physicalRooms.length > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              {room.physicalRooms
                                .map((pr) => pr.name)
                                .join(", ")}
                            </div>
                          )}
                      </td>
                      {weekDays.map((day, index) => {
                        const weekday = index + 1;
                        const setting = getRoomSettingForDate(room, day);
                        if (!setting) {
                          return (
                            <td
                              key={`${room.id}-${weekday}`}
                              className="p-3 text-center text-xs text-muted-foreground"
                            >
                              —
                            </td>
                          );
                        }
                        if (setting.isClosed) {
                          return (
                            <td
                              key={`${room.id}-${weekday}`}
                              className="p-3 text-center text-xs text-muted-foreground"
                            >
                              {setting.closedReason
                                ? `Gesperrt: ${setting.closedReason}`
                                : "Gesperrt"}
                            </td>
                          );
                        }
                        const assignments =
                          assignmentsByRoomWeekday.get(
                            `${room.id}-${weekday}`,
                          ) ?? [];
                        const noteEntries = assignments
                          .filter(
                            (assignment) =>
                              assignment.note || assignment.isBlocked,
                          )
                          .map((assignment) => {
                            if (assignment.isBlocked && assignment.note) {
                              return `Gesperrt: ${assignment.note}`;
                            }
                            if (assignment.isBlocked) return "Gesperrt";
                            return assignment.note || "";
                          })
                          .filter(Boolean);
                        const timeLabel = formatRoomTime(
                          setting.timeFrom,
                          setting.timeTo,
                        );
                        return (
                          <td
                            key={`${room.id}-${weekday}`}
                            className="p-3 align-top"
                          >
                            {(setting.usageLabel || timeLabel) && (
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {[setting.usageLabel, timeLabel]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                            {assignments.length === 0 ? (
                              <div className="text-xs text-muted-foreground">
                                —
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {assignments.map((assignment) => {
                                  const name = resolveEmployeeName(
                                    assignment.employeeId,
                                    assignment.employeeName,
                                    assignment.employeeLastName,
                                  );
                                  const isCurrentUser =
                                    assignment.employeeId === currentUser?.id;
                                  const isOnDutyToday = assignment.employeeId
                                    ? isEmployeeOnDutyDate(
                                        assignment.employeeId,
                                        day,
                                        rosterShifts,
                                      )
                                    : false;
                                  return (
                                    <div
                                      key={assignment.id}
                                      className={cn(
                                        "text-xs",
                                        isOnDutyToday &&
                                          "text-red-600 font-semibold",
                                        !isOnDutyToday &&
                                          isCurrentUser &&
                                          "text-blue-700 font-semibold",
                                      )}
                                    >
                                      {name}
                                      {assignment.assignmentType !== "Plan" && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {" "}
                                          ({assignment.assignmentType})
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {noteEntries.length > 0 && (
                              <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                                {noteEntries.join(" · ")}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-muted/30 align-top">
                    <td className="p-3 text-xs font-medium">Abwesenheiten</td>
                    {weekDays.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const items = absencesByDate.get(key) ?? [];
                      return (
                        <td
                          key={`absences-${key}`}
                          className="p-2 text-[10px] text-muted-foreground"
                        >
                          {items.length === 0 ? (
                            "—"
                          ) : (
                            <div className="space-y-1">
                              {items.map((absence) => (
                                <div key={absence.id}>
                                  {resolveAbsenceName(absence)} (
                                  {absence.reason})
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
