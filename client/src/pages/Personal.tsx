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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  Heart,
  Loader2,
  RefreshCw,
  Rss,
  X,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAustrianHoliday } from "@/lib/holidays";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  calendarApi,
  type OpenShiftSlot,
  type OpenShiftResponse,
  type PlannedAbsenceAdmin,
  type WeeklyPlanResponse,
} from "@/lib/api";
import {
  getEffectiveServiceLineKeys,
  getEmployeeServiceLineCandidate,
} from "@/lib/serviceLineAccess";
import {
  buildNormalizedServiceLineKeySet,
  normalizeServiceLineKey,
} from "@/lib/serviceLineKey";
import type {
  DutyPlan,
  Employee,
  RosterShift,
  ShiftSwapRequest,
  ServiceLine,
  LongTermAbsence,
} from "@shared/schema";
import { getServiceLineDisplayLabel } from "@shared/shiftTypes";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import VacationPlanEditor from "@/pages/admin/VacationPlanEditor";
import {
  WEEKDAY_LABELS,
  WEEKDAY_FULL,
  type WeeklyPlanRoom,
  buildWeeklyPlanAssignmentsByRoomWeekday,
  formatRoomTime,
  getRoomSettingForDate,
  getWeeklyPlanRoomShortLabel,
  isEmployeeOnDutyDate,
  isEmployeeAbsentOnDate,
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

const useCalendarToken = (authToken: string | null | undefined) => {
  const [calendarToken, setCalendarToken] = useState<string | null>(
    authToken ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCalendarToken = useCallback(
    async (regenerate = false): Promise<string | null> => {
      if (!authToken) {
        setCalendarToken(null);
        setError(null);
        return null;
      }
      setIsLoading(true);
    try {
      const data = await calendarApi.getToken({ regenerate });
      setCalendarToken(data.token);
      setError(null);
      return data.token;
    } catch (err: any) {
      const message =
        err?.message || "Kalenderlink konnte nicht geladen werden.";
      setCalendarToken(authToken ?? null);
      setError(message);
      return authToken ?? null;
    } finally {
        setIsLoading(false);
      }
    },
    [authToken],
  );

  useEffect(() => {
    refreshCalendarToken(false);
  }, [refreshCalendarToken]);

  return {
    calendarToken,
    refreshCalendarToken,
    isLoading,
    error,
  };
};
const PERSONAL_ABSENCE_COLUMN_VISIBLE_KEY =
  "mycliniq.personal.roster.absenceColumnVisible.v1";

type OpenShiftDebugDetail = {
  planStatus: DutyPlan["status"] | null;
  statusAllowed: boolean;
  showClaimButton: boolean;
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
  { key: "kreiszimmer", label: "Kreisszimmerdienst", sortOrder: 1, isActive: true },
  { key: "gyn", label: "Hauptdienst", sortOrder: 2, isActive: true },
  { key: "turnus", label: "Turnusdienst", sortOrder: 3, isActive: true },
  { key: "overduty", label: "Überdienst", sortOrder: 4, isActive: true },
];

const PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER = ["kreiszimmer", "gyn", "turnus"] as const;
const PREVIOUS_DAY_DUTY_SERVICE_LINE_SET: ReadonlySet<string> = new Set(
  PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER,
);

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
      label: getServiceLineDisplayLabel(line.key, line.label) ?? line.label,
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

const normalizeExcelColor = (value?: string | null): string | null => {
  if (!value) return null;
  const color = value.trim();
  if (!color) return null;

  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b] = hex.slice(0, 3).split("");
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (hex.length >= 6) return `#${hex.slice(0, 6)}`.toUpperCase();
  }

  const rgbMatch = color.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,[\d.]+\s*)?\)$/i,
  );
  if (rgbMatch) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return null;
};

const toExcelArgb = (value?: string | null): string | undefined => {
  const hex = normalizeExcelColor(value);
  if (!hex) return undefined;
  return `FF${hex.replace("#", "")}`;
};

const withExcelTopPadding = (value: string): string => {
  if (!value || value === "—") return value;
  return `\n${value}`;
};

const getRosterHeaderShortLabel = (label: string, key: string) => {
  const normalizedKey = normalizeServiceLineKey(key);
  switch (normalizedKey) {
    case "kreiszimmer":
      return "Geb";
    case "gyn":
      return "Gyn";
    case "turnus":
      return "TA";
    case "overduty":
      return "Ü";
    case "long_day":
      return "Long day";
    default:
      return label;
  }
};

export default function Personal() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"roster" | "weekly" | "vacation">(
    "roster",
  );
  const [, setLocation] = useLocation();
  const { token, user, employee: currentEmployee, isAdmin, isTechnicalAdmin } =
    useAuth();
  const { toast } = useToast();
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapDialogInitialTab, setSwapDialogInitialTab] = useState<
    "new" | "my" | "incoming"
  >("new");
  const [exporting, setExporting] = useState(false);
  const isExternalDuty = user?.accessScope === "external_duty";
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [pendingSwapRequestCount, setPendingSwapRequestCount] = useState(0);
  const [isHeroExpanded, setIsHeroExpanded] = useState(true);
  const pageStickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const [pageStickyHeaderHeight, setPageStickyHeaderHeight] = useState(0);
  const [unassignedDebug, setUnassignedDebug] =
    useState<OpenShiftDebugDetail | null>(null);
  const [rosterSummary, setRosterSummary] = useState<{
    shifts: number;
    absenceReasonCounts: Array<{ reason: string; days: number }>;
  } | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<{
    plannedDays: number;
    absenceReasonCounts: Array<{ reason: string; days: number }>;
  } | null>(null);
  const [vacationSummary, setVacationSummary] = useState<string | null>(null);
  const {
    calendarToken,
    refreshCalendarToken,
    error: calendarTokenError,
  } = useCalendarToken(token);
  const resolvedCalendarToken = calendarToken ?? token ?? null;

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);
  const showTakeShiftButton = Boolean(unassignedDebug?.showClaimButton);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openIncomingSwap = () => {
      setSwapDialogInitialTab("incoming");
      setSwapDialogOpen(true);
    };
    window.addEventListener("mycliniq:openSwapIncoming", openIncomingSwap);
    return () =>
      window.removeEventListener("mycliniq:openSwapIncoming", openIncomingSwap);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("swap") !== "incoming") return;
    setSwapDialogInitialTab("incoming");
    setSwapDialogOpen(true);
    params.delete("swap");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  useEffect(() => {
    const loadPendingSwapRequests = async () => {
      if (!currentEmployee?.id) {
        setPendingSwapRequestCount(0);
        return;
      }
      try {
        const incoming = await shiftSwapApi.getByTargetEmployee(
          currentEmployee.id,
        );
        const pendingCount = incoming.filter(
          (request) => request.status === "Ausstehend",
        ).length;
        setPendingSwapRequestCount(pendingCount);
      } catch {
        setPendingSwapRequestCount(0);
      }
    };
    loadPendingSwapRequests();
  }, [currentEmployee?.id]);

  useEffect(() => {
    const node = pageStickyHeaderRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const updateHeight = () => {
      setPageStickyHeaderHeight(Math.ceil(node.getBoundingClientRect().height));
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const loadVacationSummary = async () => {
      if (!currentEmployee?.id) {
        setVacationSummary(null);
        return;
      }

      const today = startOfDay(new Date());
      const from = format(subMonths(today, 1), "yyyy-MM-dd");
      const to = format(addMonths(today, 12), "yyyy-MM-dd");

      try {
        const absences = await plannedAbsencesAdminApi.getRange({ from, to });
        if (!active) return;

        const personalAbsences = absences
          .filter(
            (absence) =>
              absence.employeeId === currentEmployee.id &&
              absence.status !== "Abgelehnt",
          )
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        const currentAbsence = personalAbsences.find((absence) => {
          const start = parseISO(absence.startDate);
          const end = parseISO(absence.endDate);
          return today >= startOfDay(start) && today <= startOfDay(end);
        });

        if (currentAbsence) {
          const reason = currentAbsence.reason ?? "Abwesenheit";
          const endLabel =
            currentAbsence.startDate === currentAbsence.endDate
              ? format(parseISO(currentAbsence.endDate), "dd.MM.", {
                  locale: de,
                })
              : `${format(parseISO(currentAbsence.startDate), "dd.MM.", {
                  locale: de,
                })} - ${format(parseISO(currentAbsence.endDate), "dd.MM.", {
                  locale: de,
                })}`;
          setVacationSummary(`${reason} aktuell · ${endLabel}`);
          return;
        }

        const nextAbsence = personalAbsences.find(
          (absence) => parseISO(absence.startDate) >= today,
        );
        if (!nextAbsence) {
          setVacationSummary("Keine geplante Abwesenheit");
          return;
        }

        const startLabel = format(parseISO(nextAbsence.startDate), "dd.MM.", {
          locale: de,
        });
        const endLabel = format(parseISO(nextAbsence.endDate), "dd.MM.", {
          locale: de,
        });
        const rangeLabel =
          nextAbsence.startDate === nextAbsence.endDate
            ? `am ${startLabel}`
            : `von ${startLabel} bis ${endLabel}`;
        setVacationSummary(`${nextAbsence.reason} ${rangeLabel}`);
      } catch {
        if (active) {
          setVacationSummary(null);
        }
      }
    };

    loadVacationSummary();
    return () => {
      active = false;
    };
  }, [currentEmployee?.id]);

  const monthlyMyShifts = currentUser
    ? shifts.filter((shift) => shift.employeeId === currentUser.id)
    : [];
  const weekendShiftCount = monthlyMyShifts.filter((shift) => {
    const date = new Date(`${shift.date}T00:00:00`);
    const day = date.getDay();
    return day === 0 || day === 6;
  }).length;

  const activeSummaryText = useMemo(() => {
    if (activeTab === "roster") {
      if (!rosterSummary) return "Monatsdienstplan";
      const parts = [
        `${rosterSummary.shifts} Dienste`,
        `${weekendShiftCount} Wochenenddienste`,
      ];
      rosterSummary.absenceReasonCounts.forEach(({ reason, days }) => {
        const suffix =
          reason === "Urlaub"
            ? "Urlaubstage"
            : reason === "Krankenstand"
              ? "Krankenstand"
              : reason;
        parts.push(`${days} ${suffix}`);
      });
      return parts.join(" · ");
    }
    if (activeTab === "weekly") {
      if (!weeklySummary) return "Wochenplan";
      const parts = [`${weeklySummary.plannedDays} Tage geplant`];
      weeklySummary.absenceReasonCounts.forEach(({ reason, days }) => {
        const suffix =
          reason === "Urlaub"
            ? "Urlaubstage"
            : reason === "Krankenstand"
              ? "Krankenstand"
              : reason;
        parts.push(`${days} ${suffix}`);
      });
      return parts.join(" · ");
    }
    return vacationSummary ?? "Urlaubsplanung";
  }, [activeTab, rosterSummary, vacationSummary, weeklySummary, weekendShiftCount]);

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

    let calendarTokenValue = resolvedCalendarToken;
    if (!calendarTokenValue) {
      calendarTokenValue = await refreshCalendarToken(false);
    }
    if (!calendarTokenValue) {
      toast({
        title: "Kalender-Abo",
        description:
          calendarTokenError ||
          "Kalenderlink konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
      return;
    }

    const baseUrl = window.location.origin.replace(/\/$/, "");
    const calendarUrl = `${baseUrl}/api/roster/calendar?calendarToken=${encodeURIComponent(
      calendarTokenValue,
    )}&months=6`;
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
      const contentDisposition = response.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(
        /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i,
      );
      const headerFilename = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1].trim())
        : null;
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        headerFilename ||
        `dienstplan-${year}-${String(month).padStart(2, "0")}.xlsx`;
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
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "roster" | "weekly" | "vacation")
          }
          className="space-y-6"
        >
          <div
            ref={pageStickyHeaderRef}
            className="sticky top-0 z-50 bg-background pb-3"
          >
            <div className="space-y-4 rounded-3xl border-none bg-gradient-to-br from-slate-950 via-[#113f72] to-[#0f5ba7] p-5 text-white shadow-xl shadow-primary/15">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="text-3xl font-bold text-white">Dienstpläne</h1>
                  <p className="hidden text-sm text-primary-foreground/80 lg:block">
                    Monatsdienstplan, Wochenplan und Urlaubsplanung.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full border border-white/15 bg-white/10 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                  onClick={() => setIsHeroExpanded((current) => !current)}
                  aria-expanded={isHeroExpanded}
                  aria-label={isHeroExpanded ? "Hero einklappen" : "Hero erweitern"}
                  data-testid="button-hero-toggle"
                >
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 transition-transform duration-200",
                      isHeroExpanded && "rotate-180",
                    )}
                  />
                </Button>
              </div>

              <div className={cn("hidden", isHeroExpanded && "block")}>
                <p className="text-sm text-primary-foreground/80">
                  Monatsdienstplan, Wochenplan und Urlaubsplanung.
                </p>

                <div className="mt-4 flex w-full flex-col items-start gap-3 lg:mt-0 lg:items-end">
                  <p className="text-sm font-medium text-primary-foreground/95 lg:text-right">
                    {activeSummaryText}
                  </p>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                      variant="ghost"
                      className="gap-2 border-white/20 bg-white/10 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                      onClick={() =>
                        {
                          setSwapDialogInitialTab("new");
                          setSwapDialogOpen(true);
                        }
                      }
                      data-testid="button-swap"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Diensttausch
                      {pendingSwapRequestCount > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
                          !
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="gap-2 border-white/20 bg-white/10 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                      onClick={() => setLocation("/dienstwuensche")}
                      data-testid="button-shift-wishes"
                    >
                      <CalendarDays className="w-4 h-4" />
                      Dienstwünsche
                    </Button>
                    {showTakeShiftButton && (
                      <Button
                        variant="ghost"
                        className="gap-2 border-white/20 bg-white/10 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                        onClick={() =>
                          window.dispatchEvent(new Event("mycliniq:openUnassigned"))
                        }
                        data-testid="button-unassigned-shifts-top"
                      >
                        Dienst übernehmen
                        {unassignedCount > 0 && (
                          <Badge className="h-5 border-white/20 bg-white/15 px-1.5 text-primary-foreground">
                            {unassignedCount}
                          </Badge>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className={cn("hidden", isHeroExpanded && "block")}>
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-white/10 bg-white/10 p-2 text-primary-foreground/80 shadow-none">
                  <TabsTrigger
                    value="roster"
                    className="h-10 min-w-[calc(50%-0.25rem)] flex-1 rounded-xl px-4 text-sm data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none sm:min-w-0 sm:px-6 sm:text-base"
                    data-testid="tab-roster"
                  >
                    Dienstplan
                  </TabsTrigger>
                  <TabsTrigger
                    value="weekly"
                    className="h-10 min-w-[calc(50%-0.25rem)] flex-1 rounded-xl px-4 text-sm data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none sm:min-w-0 sm:px-6 sm:text-base"
                    data-testid="tab-weekly"
                  >
                    Wochenplan
                  </TabsTrigger>
                  <TabsTrigger
                    value="vacation"
                    className="h-10 min-w-[calc(50%-0.25rem)] flex-1 rounded-xl px-4 text-sm data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none sm:min-w-0 sm:px-6 sm:text-base"
                    data-testid="tab-vacation"
                  >
                    Urlaubsplanung
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {debugEnabled && token && (
              <div className="mt-4 rounded-lg border border-border bg-slate-50/60 p-3 text-xs text-muted-foreground space-y-2">
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

                  <span className="font-medium">showClaimButton</span>
                  <span>{String(unassignedDebug?.showClaimButton ?? false)}</span>

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
          </div>

          <TabsContent
            value="roster"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <RosterView
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
              onSubscribe={handleSubscribe}
              onExport={handleExport}
              exporting={exporting}
              onSummaryChange={setRosterSummary}
            />
          </TabsContent>

          <TabsContent
            value="weekly"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <WeeklyView
              calendarToken={resolvedCalendarToken}
              stickyTopOffset={pageStickyHeaderHeight}
              onSummaryChange={setWeeklySummary}
            />
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
        onIncomingPendingCountChange={setPendingSwapRequestCount}
        initialTab={swapDialogInitialTab}
      />
    </Layout>
  );
}

function RosterView({
  currentDate,
  setCurrentDate,
  onSubscribe,
  onExport,
  exporting,
  onSummaryChange,
}: {
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
  onSubscribe: () => void | Promise<void>;
  onExport: () => void | Promise<void>;
  exporting: boolean;
  onSummaryChange?: (summary: {
    shifts: number;
    absenceReasonCounts: Array<{ reason: string; days: number }>;
  }) => void;
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
  const [showAbsenceColumn, setShowAbsenceColumn] = useState(false);

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
  const normalizedServiceLineLookup = useMemo(() => {
    return new Map(
      serviceLineDisplay.map((line) => [
        normalizeServiceLineKey(line.key),
        line,
      ]),
    );
  }, [serviceLineDisplay]);
  const rosterColumnCount = 3 + serviceLineDisplay.length + 1;
  const activePlannedAbsences = useMemo(
    () => plannedAbsences.filter((absence) => absence.status !== "Abgelehnt"),
    [plannedAbsences],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(
      PERSONAL_ABSENCE_COLUMN_VISIBLE_KEY,
    );
    if (stored === "1") {
      setShowAbsenceColumn(true);
    } else if (stored === "0") {
      setShowAbsenceColumn(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PERSONAL_ABSENCE_COLUMN_VISIBLE_KEY,
      showAbsenceColumn ? "1" : "0",
    );
  }, [showAbsenceColumn]);

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
    return openShiftSlots;
  }, [openShiftSlots]);

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
  const normalizedEffectiveClaimKeys = useMemo(
    () => buildNormalizedServiceLineKeySet(effectiveClaimKeys),
    [effectiveClaimKeys],
  );

  const canCurrentUserTakeShift = (shift: { serviceType: string }) => {
    if (isExternalDuty) return false;
    if (!token) return false;
    if (!currentUser?.id) return false;
    if (normalizedEffectiveClaimKeys.size === 0) return false;
    const normalizedSlotKey = normalizeServiceLineKey(shift.serviceType);
    return normalizedEffectiveClaimKeys.has(normalizedSlotKey);
  };

  const claimableOpenShiftSlots = useMemo(() => {
    if (isExternalDuty) return [] as OpenShiftSlot[];
    if (!token) return [] as OpenShiftSlot[];
    if (!currentUser?.id) return [] as OpenShiftSlot[];
    if (effectiveAllowedKeys.size === 0) return [];
    return visibleOpenShiftSlots.filter((slot) => {
      const normalizedSlotKey = normalizeServiceLineKey(slot.serviceType);
      return normalizedEffectiveClaimKeys.has(normalizedSlotKey);
    });
  }, [
    isExternalDuty,
    token,
    currentUser?.id,
    normalizedEffectiveClaimKeys,
    visibleOpenShiftSlots,
  ]);

  const showClaimButton =
    !isExternalDuty &&
    isPlanStatusAllowingUnassigned &&
    normalizedEffectiveClaimKeys.size > 0 &&
    claimableOpenShiftSlots.length > 0;

  const allowedKeysForDebug = useMemo(
    () => Array.from(effectiveClaimKeys).slice(0, 30),
    [effectiveClaimKeys],
  );

  const openShiftDebugDetail = useMemo<OpenShiftDebugDetail>(
    () => ({
      planStatus: planStatus ?? null,
      statusAllowed: isPlanStatusAllowingUnassigned,
      showClaimButton,
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
      showClaimButton,
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
      count: claimableOpenShiftSlots.length,
      claimableCount: claimableOpenShiftSlots.length,
      showClaimButton,
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
    showClaimButton,
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
    if (!slot.date || !slot.serviceType) {
      toast({
        title: "Ungültiger Dienst",
        description: "Datum und Diensttyp müssen vorhanden sein.",
        variant: "destructive",
      });
      return;
    }
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
        await rosterApi.claimOpenShift({
          slotId: slot.id,
          date: slot.date,
          serviceType: slot.serviceType,
        });
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
  const myAbsenceReasonCounts = useMemo(() => {
    if (!currentUser) return [] as Array<{ reason: string; days: number }>;

    const counts = new Map<string, number>();
    dayStrings.forEach((dateStr) => {
      const plannedReason = activePlannedAbsences.find(
        (absence) =>
          absence.employeeId === currentUser.id &&
          absence.startDate <= dateStr &&
          absence.endDate >= dateStr,
      )?.reason;

      const longTermReason = longTermAbsences.find(
        (absence) =>
          absence.employeeId === currentUser.id &&
          absence.status === "Genehmigt" &&
          absence.startDate <= dateStr &&
          absence.endDate >= dateStr,
      )?.reason;

      const reason =
        plannedReason ||
        longTermReason ||
        (isLegacyInactiveOnDate(
          employeesById.get(currentUser.id) ?? currentUser,
          dateStr,
        )
          ? "Abwesenheit"
          : null);

      if (!reason) return;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([reason, days]) => ({ reason, days }))
      .sort((a, b) => b.days - a.days || a.reason.localeCompare(b.reason, "de"));
  }, [
    activePlannedAbsences,
    currentUser,
    dayStrings,
    employeesById,
    longTermAbsences,
  ]);

  useEffect(() => {
    onSummaryChange?.({
      shifts: myShifts.length,
      absenceReasonCounts: myAbsenceReasonCounts,
    });
  }, [myAbsenceReasonCounts, myShifts.length, onSummaryChange]);

  return (
    <div className="space-y-6">
      <Card className="border-none kabeg-shadow overflow-visible">
        <div className="border-b border-border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
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

            <div className="flex flex-wrap items-center gap-2">
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
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onSubscribe}
                data-testid="button-subscribe"
              >
                <Rss className="w-4 h-4" />
                <span className="hidden sm:inline">Abonnieren</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onExport}
                disabled={exporting}
                data-testid="button-export"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {exporting ? "Export läuft..." : "Export"}
                </span>
              </Button>
              <Select defaultValue="all">
                <SelectTrigger className="h-9 w-full min-w-[160px] sm:w-[180px]">
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
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {rosterLoading ? (
            <div className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
              Dienstplan wird geladen...
            </div>
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
              const dateKey = format(day, "yyyy-MM-dd");
              const dayLabel = format(day, "EEE", { locale: de }).replace(".", "");
              const dateLabel = format(day, "dd.MM", { locale: de });
              const holiday = getAustrianHoliday(day);
              const isHoliday = Boolean(holiday);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const highlightRow = isWeekend || isHoliday;
              const dayShifts = shiftsByDate[dateKey] || {};
              const dayAbsences = getAbsencesForDate(day);

              return (
                <div
                  key={`mobile-${dateKey}`}
                  className={cn(
                    "rounded-xl border border-border bg-background p-4 shadow-sm",
                    highlightRow && "border-amber-200 bg-amber-50/50",
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={cn(
                          "text-base font-semibold",
                          highlightRow && "text-rose-600",
                        )}
                      >
                        {dayLabel}, {dateLabel}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        KW {weekNumber}
                        {showKW ? " • Wochenstart" : ""}
                        {holiday ? ` • ${holiday.name}` : ""}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-slate-200 bg-slate-50 text-slate-600"
                    >
                      {statusLabel}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {serviceLineDisplay.map((line) => {
                      const shift = dayShifts[line.key];
                      const label = getShiftDisplay(shift);
                      return (
                        <div
                          key={`${dateKey}-${line.key}`}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 text-muted-foreground">
                            {line.label}
                          </span>
                          <span
                            className={cn(
                              "text-right font-medium",
                              label === "-" && "text-muted-foreground",
                              label !== "-" && isMyShift(shift) && "text-primary",
                            )}
                          >
                            {label}
                          </span>
                        </div>
                      );
                    })}

                    {showAbsenceColumn && (
                      <div className="border-t border-border pt-2 text-sm">
                        <div className="mb-1 text-muted-foreground">
                          Abwesenheiten
                        </div>
                        {dayAbsences.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {dayAbsences.map((absence) => (
                              <span
                                key={`mobile-absence-${absence.source}-${absence.employeeId}-${absence.absenceId ?? absence.reason}`}
                                className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                              >
                                {absence.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden max-h-[70vh] overflow-auto md:block">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="bg-primary text-white">
                <th
                  className="sticky left-0 top-0 z-40 w-16 bg-primary px-2 py-2 text-left font-medium"
                >
                  KW
                </th>
                <th
                  className="sticky top-0 z-30 w-12 bg-primary px-2 py-2 text-left font-medium"
                >
                  Tag
                </th>
                <th
                  className="sticky top-0 z-30 w-24 bg-primary px-2 py-2 text-left font-medium"
                >
                  Datum
                </th>
                {serviceLineDisplay.map((line) => (
                  <th
                    key={line.key}
                    className="sticky top-0 z-30 bg-primary px-2 py-2 text-left font-medium"
                  >
                    {getRosterHeaderShortLabel(line.label, line.key)}
                  </th>
                ))}
                <th
                  className="sticky top-0 z-30 bg-primary px-2 py-2 text-left font-medium"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setShowAbsenceColumn((prev) => !prev)
                    }
                    aria-pressed={showAbsenceColumn}
                    title={
                      showAbsenceColumn
                        ? "Abwesenheitsspalte ausblenden"
                        : "Abwesenheitsspalte einblenden"
                    }
                    className="flex flex-col items-start gap-0.5 text-xs font-semibold text-white/90 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <span>Abwesenheiten</span>
                    <span className="text-[11px] font-normal text-white/70">
                      {showAbsenceColumn ? "verstecken" : "anzeigen"}
                    </span>
                  </button>
                </th>
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
                  const dayAbsences = getAbsencesForDate(day);

                  return (
                    <tr
                      key={dateKey}
                      className={cn(
                        "border-b border-border hover:bg-muted/30 transition-colors",
                        highlightRow && "bg-amber-50/60",
                      )}
                      data-testid={`roster-row-${dateKey}`}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-20 px-2 py-1.5 font-medium text-primary shadow-[4px_0_12px_-10px_rgba(15,23,42,0.25)]",
                          highlightRow ? "bg-amber-50/60" : "bg-background",
                        )}
                      >
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
                      <td
                        className={
                          showAbsenceColumn
                            ? "px-2 py-1.5 text-muted-foreground text-xs"
                            : "hidden"
                        }
                      >
                        {showAbsenceColumn &&
                          (dayAbsences.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
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
                          ))}
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
              Dienst übernehmen ({claimableOpenShiftSlots.length})
            </DialogTitle>
            <DialogDescription>
              Offene Dienste im aktuellen Monat aus Vorschau/Freigabe, die Sie übernehmen dürfen.
            </DialogDescription>
          </DialogHeader>

          {claimableOpenShiftSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Dienste zum Übernehmen verfügbar.
            </p>
          ) : (
            <div className="space-y-3">
              {claimableOpenShiftSlots.map((slot) => {
                const slotKey = slot.isSynthetic
                  ? slot.syntheticId
                  : slot.id ?? `${slot.date}:${slot.serviceType}`;
                const normalizedSlotKey = normalizeServiceLineKey(slot.serviceType);
                const serviceLabel =
                  serviceLineLookup.get(slot.serviceType)?.label ??
                  normalizedServiceLineLookup.get(normalizedSlotKey)?.label ??
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
    </div>
  );
}

function ShiftSwapRosterDialog({
  open,
  onOpenChange,
  currentDate,
  onIncomingPendingCountChange,
  initialTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: Date;
  onIncomingPendingCountChange?: (count: number) => void;
  initialTab?: "new" | "my" | "incoming";
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
  const [swapShiftDetails, setSwapShiftDetails] = useState<
    Record<number, RosterShift>
  >({});
  const [sourceShiftId, setSourceShiftId] = useState("");
  const [targetShiftIds, setTargetShiftIds] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [activeTab, setActiveTab] = useState<"new" | "my" | "incoming">("new");

  const normalizeShiftId = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab ?? "new");
      loadData();
    }
  }, [open, currentDate, initialTab]);

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
      onIncomingPendingCountChange?.(
        incomingData.filter((request) => request.status === "Ausstehend").length,
      );

      const referencedShiftIds = new Set<number>();
      [...myData, ...incomingData].forEach((request) => {
        const requesterShiftId = normalizeShiftId(request.requesterShiftId);
        const targetShiftId = normalizeShiftId(request.targetShiftId);
        if (requesterShiftId !== null) referencedShiftIds.add(requesterShiftId);
        if (targetShiftId !== null) referencedShiftIds.add(targetShiftId);
      });
      const loadedShiftIds = new Set(shiftData.map((shift) => shift.id));
      const missingShiftIds = [...referencedShiftIds].filter(
        (shiftId) => !loadedShiftIds.has(shiftId),
      );
      if (missingShiftIds.length === 0) {
        setSwapShiftDetails({});
      } else {
        const extraShiftResults = await Promise.allSettled(
          missingShiftIds.map((shiftId) => rosterApi.getById(shiftId)),
        );
        const extraShifts: Record<number, RosterShift> = {};
        extraShiftResults.forEach((result) => {
          if (result.status === "fulfilled") {
            extraShifts[result.value.id] = result.value;
          }
        });
        setSwapShiftDetails(extraShifts);
      }
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
  const shiftsById = useMemo(() => {
    const map = new Map<number, RosterShift>();
    shifts.forEach((shift) => map.set(shift.id, shift));
    Object.values(swapShiftDetails).forEach((shift) => map.set(shift.id, shift));
    return map;
  }, [shifts, swapShiftDetails]);
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
    const normalizedShiftId = normalizeShiftId(shiftId);
    if (normalizedShiftId === null) return "Unbekannter Dienst";
    const shift = shiftsById.get(normalizedShiftId);
    if (!shift) return "Dienstdatum nicht verfuegbar";
    const parsedDate = parseISO(shift.date);
    const weekdayShort = format(parsedDate, "EEE", { locale: de }).replace(
      ".",
      "",
    );
    const dateLabel = format(parsedDate, "dd.MM.", {
      locale: de,
    });
    const serviceLabel =
      serviceLineLabelLookup.get(shift.serviceType) || shift.serviceType;
    return `${weekdayShort} den ${dateLabel} · ${serviceLabel}`;
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
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab((value as "new" | "my" | "incoming") ?? "new")
            }
            className="w-full"
          >
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

function WeeklyView({
  calendarToken,
  stickyTopOffset,
  onSummaryChange,
}: {
  calendarToken: string | null;
  stickyTopOffset: number;
  onSummaryChange?: (summary: {
    plannedDays: number;
    absenceReasonCounts: Array<{ reason: string; days: number }>;
  }) => void;
}) {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [rooms, setRooms] = useState<WeeklyPlanRoom[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [plannedAbsences, setPlannedAbsences] = useState<PlannedAbsenceAdmin[]>(
    [],
  );
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>(
    [],
  );
  const [rosterShifts, setRosterShifts] = useState<RosterShift[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [weeklyExporting, setWeeklyExporting] = useState(false);
  const [showFullLabels, setShowFullLabels] = useState(false);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"header" | "body" | null>(null);

  const getWeeklyCalendarUrl = () => {
    if (!calendarToken || typeof window === "undefined") return null;
    const baseUrl = window.location.origin.replace(/\/$/, "");
    return `${baseUrl}/api/weekly/calendar?calendarToken=${encodeURIComponent(
      calendarToken,
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
  const firstColumnWidthRem = showFullLabels ? 12 : 6.5;
  const firstColumnWidth = `${firstColumnWidthRem}rem`;
  const weeklyPlanMinWidth = `${firstColumnWidthRem + weekDays.length * 7.5}rem`;

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
	        !title.includes("diensthabende") &&
	        !title.includes("raum verwaltung") &&
	        !title.includes("diensthabende am wochenende")
	      );
	    });
	  }, [roomsSorted]);

  const employeesById = useMemo(() => {
    return new Map(employees.map((employee) => [employee.id, employee]));
  }, [employees]);

  const assignmentsByRoomWeekday = useMemo(() => {
    return buildWeeklyPlanAssignmentsByRoomWeekday(
      weeklyPlan?.assignments || [],
      visibleRooms,
      rosterShifts,
      weekDays,
      employeesById,
    );
  }, [employeesById, rosterShifts, visibleRooms, weekDays, weeklyPlan]);
  const plannedDayCount = useMemo(() => {
    if (!currentUser?.id) return 0;
    const weekdaySet = new Set<number>();
    (weeklyPlan?.assignments ?? []).forEach((assignment) => {
      if (
        assignment.employeeId === currentUser.id &&
        assignment.assignmentType === "Plan"
      ) {
        weekdaySet.add(assignment.weekday);
      }
    });
    return weekdaySet.size;
  }, [currentUser?.id, weeklyPlan?.assignments]);
  const weeklyAbsenceReasonCounts = useMemo(() => {
    if (!currentUser?.id) return [] as Array<{ reason: string; days: number }>;
    const counts = new Map<string, number>();

    weekDays.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const plannedReason = plannedAbsences.find(
        (absence) =>
          absence.employeeId === currentUser.id &&
          absence.status !== "Abgelehnt" &&
          absence.startDate <= dateStr &&
          absence.endDate >= dateStr,
      )?.reason;

      const longTermReason = longTermAbsences.find(
        (absence) =>
          absence.employeeId === currentUser.id &&
          absence.status === "Genehmigt" &&
          absence.startDate <= dateStr &&
          absence.endDate >= dateStr,
      )?.reason;

      const reason = plannedReason || longTermReason;
      if (!reason) return;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([reason, days]) => ({ reason, days }))
      .sort((a, b) => b.days - a.days || a.reason.localeCompare(b.reason, "de"));
  }, [currentUser?.id, longTermAbsences, plannedAbsences, weekDays]);

  const syncHorizontalScroll = useCallback((source: "header" | "body") => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    if (syncingScrollRef.current === source) return;

    const target = source === "header" ? body : header;
    syncingScrollRef.current = source;
    target.scrollLeft = source === "header" ? header.scrollLeft : body.scrollLeft;
    window.requestAnimationFrame(() => {
      if (syncingScrollRef.current === source) {
        syncingScrollRef.current = null;
      }
    });
  }, []);

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
    onSummaryChange?.({
      plannedDays: plannedDayCount,
      absenceReasonCounts: weeklyAbsenceReasonCounts,
    });
  }, [onSummaryChange, plannedDayCount, weeklyAbsenceReasonCounts]);

  useEffect(() => {
    let active = true;
    const loadWeeklyPlan = async () => {
      setIsLoading(true);
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(weekEnd, "yyyy-MM-dd");
      const rosterMonthRequests = Array.from(
        new Map(
          [subDays(weekStart, 1), ...weekDays].map((date) => {
            const year = getYear(date);
            const month = getMonth(date) + 1;
            return [`${year}-${month}`, { year, month }];
          }),
        ).values(),
      );
      try {
        const [
          roomData,
          employeeData,
          serviceLineData,
          absenceData,
          longTermData,
          rosterData,
        ] =
          await Promise.all([
            roomApi.getWeeklyPlan(),
            employeeApi.getAll(),
            serviceLinesApi.getAll(),
            plannedAbsencesAdminApi.getRange({ from, to }),
            longTermAbsencesApi.getByStatus("Genehmigt", from, to),
            Promise.all(
              rosterMonthRequests.map(({ year, month }) =>
                rosterApi.getByMonth(year, month),
              ),
            ).then((results) => results.flat()),
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
        setServiceLines(serviceLineData);
        setPlannedAbsences(absenceData);
        setLongTermAbsences(longTermData);
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

  const resolveEmployeeLastName = (
    employeeId: number | null,
    fallback?: string | null,
    fallbackLast?: string | null,
  ) => {
    if (employeeId) {
      const employee = employeesById.get(employeeId);
      if (employee?.lastName) return employee.lastName;
      if (employee?.name) {
        const parts = employee.name.trim().split(/\s+/);
        return parts[parts.length - 1] || employee.name;
      }
    }
    if (fallbackLast) return fallbackLast;
    if (fallback) {
      const parts = fallback.trim().split(/\s+/);
      return parts[parts.length - 1] || fallback;
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

  const previousDayDutyByDate = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        serviceType: string;
        assignee: string;
      }>
    >();

    weekDays.forEach((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const previousDateKey = format(subDays(day, 1), "yyyy-MM-dd");
      const entries = rosterShifts
        .filter((shift) => shift.date === previousDateKey)
        .map((shift) => {
          const normalizedServiceType = normalizeServiceLineKey(shift.serviceType);
          if (!PREVIOUS_DAY_DUTY_SERVICE_LINE_SET.has(normalizedServiceType)) {
            return null;
          }

          return {
            serviceType: normalizedServiceType,
            assignee: resolveEmployeeLastName(
              shift.employeeId ?? null,
              shift.assigneeFreeText ?? null,
              null,
            ),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            serviceType: string;
            assignee: string;
          } => Boolean(entry),
        )
        .sort((a, b) => {
          const orderA = PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER.findIndex(
            (key) => key === a.serviceType,
          );
          const orderB = PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER.findIndex(
            (key) => key === b.serviceType,
          );
          if (orderA !== orderB) return orderA - orderB;
          return a.assignee.localeCompare(b.assignee, "de");
        });

      map.set(dateKey, entries);
    });

    return map;
  }, [
    rosterShifts,
    weekDays,
    resolveEmployeeLastName,
  ]);

  const isAssignedEmployeeAbsent = useCallback(
    (employeeId: number | null | undefined, date: Date) => {
      if (!employeeId) return false;
      const employee = employeesById.get(employeeId);
      if (!employee) return false;
      return isEmployeeAbsentOnDate(
        employee,
        date,
        plannedAbsences,
        longTermAbsences,
      );
    },
    [employeesById, longTermAbsences, plannedAbsences],
  );

  const handleWeeklyExport = async () => {
    if (visibleRooms.length === 0) {
      toast({
        title: "Export nicht möglich",
        description: "Keine Wochenplan-Daten zum Export vorhanden.",
        variant: "destructive",
      });
      return;
    }

    setWeeklyExporting(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "MyCliniQ";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(`Wochenplan KW${weekNumber}`);
      sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

      sheet.columns = [
        { width: 34 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
      ];

      const border = {
        top: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
        left: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
        right: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
      };

      const applyCellStyle = (
        cell: any,
        options: {
          bgColor?: string | null;
          bold?: boolean;
          fontColor?: string | null;
          align?: "left" | "center" | "right";
          vAlign?: "top" | "middle" | "bottom";
          indent?: number;
        } = {},
      ) => {
        const bgArgb = toExcelArgb(options.bgColor);
        const fontArgb = toExcelArgb(options.fontColor);
        cell.border = border;
        cell.alignment = {
          vertical: options.vAlign ?? "top",
          horizontal: options.align ?? "left",
          wrapText: true,
          indent: options.indent ?? 0,
        };
        cell.font = {
          bold: Boolean(options.bold),
          color: fontArgb ? { argb: fontArgb } : undefined,
        };
        if (bgArgb) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bgArgb },
          };
        }
      };

      const headerRow = sheet.addRow([
        "Arbeitsplatz",
        ...weekDays.map(
          (day, index) =>
            `${WEEKDAY_LABELS[index]} ${format(day, "dd.MM", { locale: de })}`,
        ),
      ]);
      headerRow.eachCell((cell) => {
        applyCellStyle(cell, {
          bgColor: "#F8FAFC",
          bold: true,
          align: "center",
          vAlign: "middle",
        });
      });
      headerRow.height = 24;

      visibleRooms.forEach((room) => {
        const rowValues: string[] = [room.name];

        weekDays.forEach((day, index) => {
          const weekday = index + 1;
          const setting = getRoomSettingForDate(room, day);
          if (!setting) {
            rowValues.push("—");
            return;
          }

          if (setting.isClosed) {
            if (room.rowColor) {
              rowValues.push("");
            } else {
              rowValues.push("—");
            }
            return;
          }

          const assignments =
            assignmentsByRoomWeekday.get(`${room.id}-${weekday}`) ?? [];
          const blockedEntries = assignments.filter((a) => a.isBlocked);
          const isBlockedCell = blockedEntries.length > 0;

          if (isBlockedCell) {
            const blockedNotes = assignments
              .filter((a) => a.isBlocked && a.note)
              .map((a) => a.note?.trim())
              .filter(Boolean) as string[];
            rowValues.push(
              blockedNotes.length > 0
                ? `Gesperrt\n${blockedNotes.join("\n")}`
                : "Gesperrt",
            );
            return;
          }

          const employeeAssignments = assignments.filter((a) => Boolean(a.employeeId));
          if (employeeAssignments.length === 0) {
            rowValues.push("—");
            return;
          }

          rowValues.push(
            withExcelTopPadding(
              employeeAssignments
                .map((assignment) =>
                  resolveEmployeeLastName(
                    assignment.employeeId,
                    assignment.employeeName,
                    assignment.employeeLastName,
                  ),
                )
                .join("\n"),
            ),
          );
        });

        const row = sheet.addRow(rowValues);
        const rowBg = room.rowColor ?? null;
        row.eachCell((cell, colNumber) => {
          if (colNumber === 1) {
            applyCellStyle(cell, { bgColor: rowBg, bold: true, indent: 1 });
          } else {
            const value = String(cell.value ?? "");
            const day = weekDays[colNumber - 2];
            const setting = day ? getRoomSettingForDate(room, day) : null;
            if (setting?.isClosed) {
              if (value === "—") {
                applyCellStyle(cell, {
                  bgColor: "#FFFFFF",
                  fontColor: "#64748B",
                  align: "center",
                });
              } else {
                applyCellStyle(cell, { bgColor: "#FFFFFF", indent: 1 });
              }
              return;
            }
            if (value.startsWith("Gesperrt")) {
              applyCellStyle(cell, {
                bgColor: "#F1F5F9",
                bold: true,
                align: "center",
                vAlign: "middle",
              });
            } else if (value === "—" && !rowBg) {
              applyCellStyle(cell, { fontColor: "#64748B", align: "center" });
            } else {
              applyCellStyle(cell, { bgColor: rowBg, indent: 1 });
            }
          }
        });
        row.height = 50;
      });

      const absRow = sheet.addRow([
        "Abwesenheiten",
        ...weekDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const items = absencesByDate.get(key) ?? [];
          if (items.length === 0) return "—";
          const byReason = new Map<string, string[]>();
          items.forEach((absence) => {
            const reason = (absence.reason || "Abwesenheit").trim();
            const current = byReason.get(reason) ?? [];
            current.push(resolveAbsenceName(absence));
            byReason.set(reason, current);
          });
          const lines: string[] = [];
          Array.from(byReason.entries())
            .sort(([a], [b]) => a.localeCompare(b, "de"))
            .forEach(([reason, names]) => {
              lines.push(reason);
              names
                .sort((a, b) => a.localeCompare(b, "de"))
                .forEach((name) => lines.push(`  ${name}`));
            });
          return withExcelTopPadding(lines.join("\n"));
        }),
      ]);
      absRow.eachCell((cell, colNumber) => {
        applyCellStyle(cell, {
          bgColor: "#F1F5F9",
          bold: colNumber === 1,
          indent: 1,
        });
      });
      const absRowValues = Array.isArray(absRow.values) ? absRow.values : [];
      const absMaxLines = absRowValues
        .slice(1)
        .reduce((max: number, value: unknown) => {
          const text = String(value ?? "");
          const lineCount = Math.max(1, text.split("\n").length);
          return Math.max(max, lineCount);
        }, 1);
      absRow.height = Math.max(68, Math.min(220, absMaxLines * 16));

      const freeAfterDutyRow = sheet.addRow([
        "Frei nach Dienst",
        ...weekDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const items = previousDayDutyByDate.get(key) ?? [];
          if (items.length === 0) return "—";
          return withExcelTopPadding(items.map((item) => item.assignee).join("\n"));
        }),
      ]);
      freeAfterDutyRow.eachCell((cell, colNumber) => {
        applyCellStyle(cell, {
          bgColor: "#F1F5F9",
          bold: colNumber === 1,
          indent: 1,
        });
      });
      const freeAfterDutyValues = Array.isArray(freeAfterDutyRow.values)
        ? freeAfterDutyRow.values
        : [];
      const freeAfterDutyMaxLines = freeAfterDutyValues
        .slice(1)
        .reduce((max: number, value: unknown) => {
          const text = String(value ?? "");
          const lineCount = Math.max(1, text.split("\n").length);
          return Math.max(max, lineCount);
        }, 1);
      freeAfterDutyRow.height = Math.max(
        68,
        Math.min(220, freeAfterDutyMaxLines * 16),
      );

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wochenplan-${weekYear}-kw${String(weekNumber).padStart(2, "0")}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Export fehlgeschlagen",
        description: error?.message || "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    } finally {
      setWeeklyExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none kabeg-shadow overflow-visible">
          <CardHeader
            className="sticky z-40 bg-white pb-2 shadow-sm"
            style={{ top: `${stickyTopOffset}px` }}
          >
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
                    disabled={!calendarToken}
                  >
                    <Rss className="w-4 h-4" />
                    Wochenplan abonnieren
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWeeklyExport}
                    disabled={weeklyExporting || isLoading}
                  >
                    <Download className="w-4 h-4" />
                    {weeklyExporting ? "Export läuft..." : "Export"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyWeeklyLink}
                    disabled={!calendarToken}
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
            <div
              ref={headerScrollRef}
              onScroll={() => syncHorizontalScroll("header")}
              className="mt-4 overflow-x-auto"
            >
              <div
                className="grid border-t border-slate-200 border-b border-slate-300 bg-slate-100"
                style={{
                  minWidth: weeklyPlanMinWidth,
                  gridTemplateColumns: `${firstColumnWidth} repeat(7, minmax(120px, 1fr))`,
                }}
              >
                <div
                  className="sticky left-0 z-40 flex flex-col items-start gap-2 border-b border-slate-300 bg-slate-100 p-2 text-left font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]"
                  style={{ width: firstColumnWidth }}
                >
                  <span className="leading-tight">
                    {showFullLabels ? "Arbeitsplatz" : "AP"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFullLabels((value) => !value)}
                    className="h-6 px-2 text-[10px] leading-none"
                  >
                    {showFullLabels ? "Kurz" : "Lang"}
                  </Button>
                </div>
                {weekDays.map((day, index) => (
                  <div
                    key={day.toISOString()}
                    className="min-w-[120px] bg-slate-100 p-3 text-center font-medium"
                  >
                    <div className="text-xs text-muted-foreground">
                      {WEEKDAY_LABELS[index]}
                    </div>
                    <div className="text-sm" title={WEEKDAY_FULL[index]}>
                      {format(day, "dd.MM", { locale: de })}
                    </div>
                  </div>
                ))}
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
            <div
              ref={bodyScrollRef}
              onScroll={() => syncHorizontalScroll("body")}
              className="overflow-x-auto"
            >
              <table
                className="w-full table-fixed text-sm"
                style={{ minWidth: weeklyPlanMinWidth }}
              >
                <colgroup>
                  <col style={{ width: firstColumnWidth }} />
                  {weekDays.map((day) => (
                    <col
                      key={`private-col-${day.toISOString()}`}
                      style={{ width: "7.5rem" }}
                    />
                  ))}
                </colgroup>
                <tbody>
                  {visibleRooms.map((room) => (
                    <tr
                      key={room.id}
                      className="border-b border-slate-300 align-top bg-white transition-colors hover:bg-slate-100/80"
                      style={
                        room.rowColor
                          ? { backgroundColor: room.rowColor }
                          : undefined
                      }
                    >
                      <td
                        className="sticky left-0 z-20 border-b border-slate-300 p-3 align-middle shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]"
                        style={
                          room.rowColor
                            ? { backgroundColor: room.rowColor }
                            : { backgroundColor: "white" }
                        }
                      >
                        <div
                          className="text-sm font-medium leading-tight"
                          title={room.name}
                          aria-label={room.name}
                        >
                          {showFullLabels
                            ? room.name
                            : getWeeklyPlanRoomShortLabel(room.name)}
                        </div>
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
                          const closedReason = setting.closedReason?.trim();
                          return (
                            <td
                              key={`${room.id}-${weekday}`}
                              className="border-b border-slate-300 bg-slate-100/80 p-3 text-center text-xs text-slate-500"
                            >
                              {closedReason
                                ? `Gesperrt: ${closedReason}`
                                : "\u00A0"}
                            </td>
                          );
                        }
                        const assignments =
                          assignmentsByRoomWeekday.get(
                            `${room.id}-${weekday}`,
                          ) ?? [];
                        const employeeAssignments = assignments.filter(
                          (assignment) => Boolean(assignment.employeeId),
                        );
                        const blockedEntries = assignments.filter(
                          (assignment) => assignment.isBlocked,
                        );
                        const isBlockedCell = blockedEntries.length > 0;
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
                          .filter(
                            (entry) =>
                              entry &&
                              (entry !== "Gesperrt" || !room.rowColor),
                          );
                        const timeLabel = formatRoomTime(
                          setting.timeFrom,
                          setting.timeTo,
                        );
                        return (
                          (() => {
                            const blockedNotes = noteEntries.filter(
                              (entry) => entry !== "Gesperrt",
                            );
                            const hasBlockedNotes = blockedNotes.length > 0;
                            return (
                          <td
                            key={`${room.id}-${weekday}`}
                            className={cn(
                              "p-3 align-middle",
                              isBlockedCell && "bg-slate-100/80",
                            )}
                          >
                            {!isBlockedCell && (setting.usageLabel || timeLabel) && (
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {[setting.usageLabel, timeLabel]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                            {isBlockedCell ? (
                              <div
                                className={cn(
                                  "min-h-[72px] w-full flex",
                                  hasBlockedNotes
                                    ? "flex-col items-center justify-center gap-2"
                                    : "items-center justify-center",
                                )}
                              >
                                <div className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold bg-slate-300 text-slate-800">
                                  Gesperrt
                                </div>
                                {hasBlockedNotes && (
                                  <div className="text-[10px] text-slate-700 bg-slate-200 border border-slate-300 rounded px-1.5 py-1 w-full">
                                    {blockedNotes.join(" · ")}
                                  </div>
                                )}
                              </div>
                            ) : employeeAssignments.length === 0 ? (
                              <div className="text-xs text-muted-foreground">
                                —
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {employeeAssignments.map((assignment) => {
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
                                  const isAbsentToday = isAssignedEmployeeAbsent(
                                    assignment.employeeId,
                                    day,
                                  );
                                  return (
                                    <div
                                      key={assignment.id}
                                      className={cn(
                                        "text-xs",
                                        isAbsentToday && "line-through opacity-70",
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
                            {!isBlockedCell && noteEntries.length > 0 && (
                              <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                                {noteEntries.join(" · ")}
                              </div>
                            )}
                          </td>
                            );
                          })()
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-muted/30 align-top">
                    <td className="sticky left-0 z-20 bg-muted/30 p-3 text-xs font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]">
                      Abwesenheiten
                    </td>
                    {weekDays.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const items = absencesByDate.get(key) ?? [];
                      const groupedItems = items.reduce<
                        Array<{ reason: string; names: string[] }>
                      >((groups, absence) => {
                        const reason = absence.reason || "Abwesenheit";
                        const existing = groups.find((group) => group.reason === reason);
                        const name = resolveAbsenceName(absence);
                        if (existing) {
                          existing.names.push(name);
                        } else {
                          groups.push({ reason, names: [name] });
                        }
                        return groups;
                      }, []);
                      return (
                        <td
                          key={`absences-${key}`}
                          className="p-2 text-[10px] text-muted-foreground"
                        >
                          {items.length === 0 ? (
                            "—"
                          ) : (
                            <div className="space-y-2">
                              {groupedItems.map((group) => (
                                <div key={`${key}-${group.reason}`} className="space-y-1">
                                  <div className="font-medium underline underline-offset-2">
                                    {group.reason}
                                  </div>
                                  <div className="space-y-1">
                                    {group.names.map((name, index) => (
                                      <div key={`${key}-${group.reason}-${index}`}>{name}</div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-muted/30 align-top">
                    <td className="sticky left-0 z-20 bg-muted/30 p-3 text-xs font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]">
                      Frei nach Dienst
                    </td>
                    {weekDays.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const items = previousDayDutyByDate.get(key) ?? [];
                      return (
                        <td
                          key={`free-after-duty-${key}`}
                          className="p-2 text-[10px] text-muted-foreground"
                        >
                          {items.length === 0 ? (
                            "—"
                          ) : (
                            <div className="space-y-1">
                              {items.map((item) => (
                                <div key={`${key}-${item.serviceType}`}>{item.assignee}</div>
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
