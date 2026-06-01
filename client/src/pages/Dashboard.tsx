import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Bell,
  CalendarDays,
  CalendarClock,
  ChevronDown,
  Users,
  Clock,
  BriefcaseBusiness,
  Stethoscope,
  Hand,
  AlertTriangle,
} from "lucide-react";
import {
  dashboardApi,
  employeeApi,
  notificationsApi,
  plannedAbsencesAdminApi,
  rosterSettingsApi,
  type DashboardAbsencesResponse,
  type DashboardAttendanceMember,
  type DashboardRecentChange,
  type DashboardResponse,
  type NextPlanningMonth,
} from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import type { Employee, Notification } from "@shared/schema";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { getAustrianHoliday } from "@/lib/holidays";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_ENABLED_WIDGETS,
  DASHBOARD_WIDGETS,
  type DashboardWidgetKey,
} from "@/lib/dashboard-widgets";
import {
  buildWidgetTodaySnapshot,
  syncWidgetTodaySnapshot,
} from "@/lib/mobileWidget";
import { resolveApiUrl } from "@/lib/apiBase";
import { getServiceLineDisplayLabel } from "@shared/shiftTypes";

const DUTY_ABBREVIATIONS: Record<string, string> = {
  "gynaekologie (oa)": "Gyn",
  "kreisszimmer (ass.)": "Geb",
  "turnus (ass./ta)": "Ta",
  ueberdienst: "Ü",
};

const normalizeDutyLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");

const getDutyBadgeText = (statusLabel: string | null | undefined) => {
  if (!statusLabel) return null; // kein Dienst => kein Badge
  const normalized = normalizeDutyLabel(statusLabel);
  return DUTY_ABBREVIATIONS[normalized] ?? null; // nur Badge wenn echter Dienst
};

const getGreeting = () => {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (minutes >= 23 * 60 + 1 || minutes <= 5 * 60) {
    return "Noch wach? 😱";
  }
  if (minutes <= 9 * 60) {
    return "Guten Morgen";
  }
  if (minutes <= 17 * 60) {
    return "Hallo";
  }
  return "Guten Abend";
};

const DUMMY_NEW_SOPS = [
  {
    id: 1,
    title: "PPROM Management",
    category: "Geburtshilfe",
    date: "Vor 2 Tagen",
    isNew: true,
  },
  {
    id: 2,
    title: "Präeklampsie Leitlinie",
    category: "Geburtshilfe",
    date: "Vor 4 Tagen",
    isNew: true,
  },
  {
    id: 3,
    title: "Sectio-Indikationen",
    category: "OP",
    date: "Vor 1 Woche",
    isNew: true,
  },
];

const DUMMY_POPULAR_SOPS = [
  { id: 4, title: "CTG-Beurteilung", category: "Geburtshilfe", views: 128 },
  { id: 5, title: "Postpartale Hämorrhagie", category: "Notfall", views: 96 },
  {
    id: 6,
    title: "Endometriose Diagnostik",
    category: "Gynäkologie",
    views: 84,
  },
];

const buildFullName = (firstName?: string | null, lastName?: string | null) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

type PreviewCard = {
  date: string;
  statusLabel: string | null;
  workplace: string | null;
  workplaceColor?: string | null;
  teammateNames: string[];
  dayLabel: string;
  dateLabel: string;
};

const isWeekendDate = (date: Date) => [0, 6].includes(date.getDay());
const ABSENCE_KEYWORDS = [
  "urlaub",
  "fortbildung",
  "zeitausgleich",
  "pflegeurlaub",
  "krankenstand",
];
const SICK_KEYWORDS = ["krankenstand", "pflegeurlaub"];

const normalizeWorkplace = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "Diensthabende") return null;
  return trimmed;
};

const withHexAlpha = (color?: string | null, alphaHex = "14") => {
  const value = (color ?? "").trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(value)) return null;
  return `${value}${alphaHex}`;
};

const darkenHexColor = (color?: string | null, factor = 0.45) => {
  const value = (color ?? "").trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (!match) return null;
  const hex = match[1];
  const r = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(0, 2), 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(2, 4), 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(4, 6), 16) * factor)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
};

const getRoleRank = (role?: string | null) => {
  const r = (role ?? "").toLowerCase();
  if (!r) return 99;

  // Primar / Primaria / Primarius
  if (r.includes("primar")) return 0;

  // 1. Oberarzt / Erster Oberarzt
  if (r.includes("1. ober") || r.includes("erster ober")) return 1;

  if (r.includes("funktionsober")) return 2;
  if (r.includes("ausbildungsober")) return 3;
  if (r.includes("oberarzt") || r.includes("oberärzt")) return 4;
  if (r.includes("facharzt") || r.includes("fachärzt")) return 4;

  if (r.includes("assistenz")) return 5;
  if (r.includes("turnus")) return 6;
  if (r.includes("kpj") || r.includes("student") || r.includes("famul")) return 7;

  // Sekretariat (falls es je in der Liste auftaucht)
  if (r.includes("sekret")) return 98;

  return 90;
};

const getAttendanceGroupRank = (role?: string | null) => {
  const r = (role ?? "").toLowerCase();
  if (!r) return 99;

  if (r.includes("primar")) return 0;
  if (r.includes("1. ober") || r.includes("erster ober")) return 1;

  // Funktionsoberarzt und Ausbildungsoberarzt bewusst gemeinsam gruppieren.
  if (r.includes("funktionsober") || r.includes("ausbildungsober")) return 2;

  if (
    r.includes("oberarzt") ||
    r.includes("oberärzt") ||
    r.includes("facharzt") ||
    r.includes("fachärzt")
  )
    return 3;

  if (r.includes("assistenz")) return 4;
  if (r.includes("turnus")) return 5;
  if (r.includes("kpj") || r.includes("student") || r.includes("famul")) return 6;
  if (r.includes("sekret")) return 98;

  return 90;
};

const sortAttendanceMembers = (
  members: DashboardAttendanceMember[],
): DashboardAttendanceMember[] => {
  const sorted = [...members];
  sorted.sort((a, b) => {
    const rankA = getRoleRank(a.role);
    const rankB = getRoleRank(b.role);
    if (rankA !== rankB) return rankA - rankB;

    const aLast = (a.lastName ?? "").trim();
    const bLast = (b.lastName ?? "").trim();
    const lastCmp = aLast.localeCompare(bLast, "de");
    if (lastCmp !== 0) return lastCmp;

    const aFirst = (a.firstName ?? "").trim();
    const bFirst = (b.firstName ?? "").trim();
    const firstCmp = aFirst.localeCompare(bFirst, "de");
    if (firstCmp !== 0) return firstCmp;

    return 0;
  });
  return sorted;
};

const STAFF_BADGE_BASE =
  "inline-flex max-w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-1 md:px-3 md:py-1.5 text-[10px] sm:text-[11px] font-medium leading-snug";
const STAFF_BADGE_DUTY =
  "bg-rose-50 text-rose-700 border-rose-200 font-semibold";
const STAFF_BADGE_NORMAL = "bg-slate-50 text-slate-700 border-slate-200";
const STAFF_NAME_CLASS = "text-[12px] sm:text-[13px]";
const STAFF_WORKPLACE_CLASS =
  "text-[10px] text-muted-foreground leading-tight";
const MONTH_NAMES = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const DASHBOARD_TILES_OPEN_KEY = "dashboard_tiles_open_v1";
const HERO_ABSENCE_REASONS = [
  "Urlaub",
  "Fortbildung",
  "Krankenstand",
  "Zeitausgleich",
  "Pflegeurlaub",
] as const;

type DashboardTileKey =
  | "notifications"
  | "today"
  | "week"
  | "people"
  | "workplaces"
  | "absences"
  | "birthday";

type DashboardNoticeItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  targetUrl?: string | null;
  tone?: "default" | "danger";
  meta?: string | null;
  notificationId?: number;
};

export default function Dashboard() {
  const { employee, user, can, token, isAdmin, viewAsUser } = useAuth();
  const [, setLocation] = useLocation();
  const canCreateAbsence = can("absence.create");

  const firstName =
    employee?.firstName ||
    user?.name ||
    employee?.name?.split(" ")[0] ||
    "Kolleg:in";
  const greeting = getGreeting();

  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(
    null,
  );
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isAcceptingZe, setIsAcceptingZe] = useState(false);
  const [notificationsData, setNotificationsData] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [heroAbsenceDialogOpen, setHeroAbsenceDialogOpen] = useState(false);
  const [heroAbsenceEmployees, setHeroAbsenceEmployees] = useState<Employee[]>([]);
  const [heroAbsenceEmployeesLoading, setHeroAbsenceEmployeesLoading] = useState(false);
  const [isSavingHeroAbsence, setIsSavingHeroAbsence] = useState(false);
  const [heroAbsenceForm, setHeroAbsenceForm] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: "Urlaub",
    notes: "",
    status: "Geplant" as "Geplant" | "Genehmigt" | "Abgelehnt",
  });
  const [openTiles, setOpenTiles] = useState<DashboardTileKey[]>(() => {
    try {
      const stored = localStorage.getItem(DASHBOARD_TILES_OPEN_KEY);
      if (!stored) return ["notifications", "today"];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return ["notifications", "today"];
      return parsed.filter((value): value is DashboardTileKey =>
        [
          "notifications",
          "today",
          "week",
          "people",
          "workplaces",
          "absences",
          "birthday",
        ].includes(String(value)),
      );
    } catch {
      return ["notifications", "today"];
    }
  });
  const { toast } = useToast();
  const [absencesData, setAbsencesData] =
    useState<DashboardAbsencesResponse | null>(null);
  const [absencesLoading, setAbsencesLoading] = useState(false);
  const [absencesError, setAbsencesError] = useState<string | null>(null);
  const [enabledWidgetsOverride, setEnabledWidgetsOverride] = useState<string[] | null>(null);
  const [wishMonthInfo, setWishMonthInfo] = useState<NextPlanningMonth | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;

    const headers: Record<string, string> = {};
    const authToken = token ?? getAuthToken();
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    fetch(resolveApiUrl("/api/me"), {
      headers,
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as any;
      })
      .then((json) => {
        if (cancelled) return;
        const enabled = json?.data?.enabledWidgets;
        if (Array.isArray(enabled)) {
          setEnabledWidgetsOverride(enabled);
        }
      })
      .catch(() => {
        // ignore: dashboard will fall back to defaults
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_TILES_OPEN_KEY, JSON.stringify(openTiles));
    } catch {
      // ignore localStorage issues
    }
  }, [openTiles]);

  useEffect(() => {
    let cancelled = false;
    void rosterSettingsApi
      .getNextPlanningMonth()
      .then((data) => {
        if (cancelled) return;
        setWishMonthInfo(data);
      })
      .catch(() => {
        if (cancelled) return;
        setWishMonthInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wishMonthLabel = useMemo(() => {
    if (!wishMonthInfo) return null;
    const idx = wishMonthInfo.month - 1;
    if (idx < 0 || idx >= MONTH_NAMES.length) return null;
    return MONTH_NAMES[idx];
  }, [wishMonthInfo]);

  const fetchDashboard = useCallback(() => dashboardApi.get(), []);
  const toggleTile = useCallback((tile: DashboardTileKey) => {
    setOpenTiles((current) =>
      current.includes(tile)
        ? current.filter((item) => item !== tile)
        : [...current, tile],
    );
  }, []);
  const refreshDashboard = useCallback(async () => {
    setIsLoadingDashboard(true);
    setDashboardError(null);
    try {
      const data = await fetchDashboard();
      setDashboardData(data);
    } catch (error: any) {
      setDashboardError(error.message || "Fehler beim Laden des Dashboards");
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [fetchDashboard]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDashboard(true);
    setDashboardError(null);

    fetchDashboard()
      .then((data) => {
        if (cancelled) return;
        setDashboardData(data);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setDashboardError(error.message || "Fehler beim Laden des Dashboards");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingDashboard(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchDashboard]);

  useEffect(() => {
    let cancelled = false;
    setNotificationsLoading(true);
    setNotificationsError(null);

    notificationsApi
      .getAll()
      .then((data) => {
        if (cancelled) return;
        setNotificationsData(data);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setNotificationsError(
          error.message || "Fehler beim Laden der Benachrichtigungen",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setNotificationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMarkNotificationRead = useCallback(
    async (notificationId: number) => {
      try {
        const updated = await notificationsApi.markRead(notificationId);
        setNotificationsData((current) =>
          current.map((item) => (item.id === notificationId ? updated : item)),
        );
      } catch (error: any) {
        toast({
          title: "Benachrichtigung konnte nicht aktualisiert werden",
          description:
            error?.message || "Der Gelesen-Status konnte nicht gespeichert werden.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleMarkAllNotificationsRead = useCallback(async () => {
    const unreadIds = notificationsData
      .filter((item) => !item.isRead)
      .map((item) => item.id);

    if (unreadIds.length === 0) return;

    try {
      const updatedItems = await Promise.all(
        unreadIds.map((notificationId) => notificationsApi.markRead(notificationId)),
      );
      const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
      setNotificationsData((current) =>
        current.map((item) => updatedMap.get(item.id) ?? item),
      );
    } catch (error: any) {
      toast({
        title: "Benachrichtigungen konnten nicht aktualisiert werden",
        description:
          error?.message || "Der Gelesen-Status konnte nicht vollständig gespeichert werden.",
        variant: "destructive",
      });
    }
  }, [notificationsData, toast]);

  useEffect(() => {
    if (!heroAbsenceDialogOpen || !canCreateAbsence || heroAbsenceEmployees.length > 0) {
      return;
    }
    let cancelled = false;
    setHeroAbsenceEmployeesLoading(true);
    void employeeApi
      .getAll()
      .then((rows) => {
        if (cancelled) return;
        setHeroAbsenceEmployees(rows);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        toast({
          title: "Mitarbeiter konnten nicht geladen werden",
          description: error.message || "Bitte erneut versuchen.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (cancelled) return;
        setHeroAbsenceEmployeesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    canCreateAbsence,
    heroAbsenceDialogOpen,
    heroAbsenceEmployees.length,
    toast,
  ]);

  const todayEntry = dashboardData?.today ?? null;
  const birthdayEntry = dashboardData?.birthday ?? null;

  const HeroIcon = dashboardError
    ? AlertTriangle
    : todayEntry?.statusLabel
      ? Stethoscope
      : Hand;
  const normalizedTodayStatusLabel = todayEntry?.duty?.serviceType
    ? getServiceLineDisplayLabel(todayEntry.duty.serviceType, todayEntry.statusLabel) ??
      todayEntry.statusLabel
    : todayEntry?.statusLabel ?? null;
  const heroMessage = dashboardError
    ? dashboardError.startsWith("Fehler")
      ? dashboardError
      : `Fehler: ${dashboardError}`
    : normalizedTodayStatusLabel
      ? `Heute: ${normalizedTodayStatusLabel}`
      : "Willkommen zurück.";
  const todayTeamNames = useMemo(
    () =>
      (todayEntry?.teammates ?? [])
        .map((t) => buildFullName(t.firstName, t.lastName))
        .filter(Boolean),
    [todayEntry?.teammates],
  );
  const todayTeamLine = useMemo(() => {
    if (!todayEntry) return null;
    const hasWorkplace = Boolean(todayEntry.workplace);
    const hasNames = todayTeamNames.length > 0;
    if (!hasWorkplace && !hasNames) return null;
    if (hasWorkplace && hasNames) {
      return `${todayEntry.workplace} mit ${todayTeamNames.join(", ")}`;
    }
    if (hasWorkplace) return todayEntry.workplace;
    return `Mit: ${todayTeamNames.join(", ")}`;
  }, [todayEntry?.workplace, todayTeamNames]);

  useEffect(() => {
    const nextDays = (dashboardData?.weekPreview ?? []).filter(
      (entry) => entry.date !== (todayEntry?.date ?? ""),
    );
    const snapshot = buildWidgetTodaySnapshot({
      today: todayEntry,
      personName: buildFullName(employee?.firstName, employee?.lastName) || null,
      teammateNames: todayTeamNames,
      nextDays,
      attendanceWidget: dashboardData?.attendanceWidget ?? null,
      isAdmin,
    });
    void syncWidgetTodaySnapshot(snapshot);
  }, [
    dashboardData?.attendanceWidget,
    dashboardData?.weekPreview,
    employee?.firstName,
    employee?.lastName,
    isAdmin,
    todayEntry,
    todayTeamNames,
  ]);

  const todayDutyLine = useMemo(() => {
    const duty = todayEntry?.duty;
    if (!duty) return null;
    const label =
      getServiceLineDisplayLabel(duty.serviceType, duty.labelShort) ??
      duty.labelShort ??
      duty.serviceType ??
      "Dienst";
    const baseLabel = label === "Dienst" ? "Dienst" : `Dienst (${label})`;
    const otherNames = (duty.othersOnDuty ?? [])
      .map((mate) => buildFullName(mate.firstName, mate.lastName))
      .filter(Boolean);
    if (otherNames.length) {
      return `${baseLabel} mit ${otherNames.join(", ")}`;
    }
    return baseLabel;
  }, [todayEntry?.duty]);
  const showZeBadge =
    !dashboardError &&
    Boolean(todayEntry?.ze?.possible) &&
    !Boolean(todayEntry?.ze?.accepted) &&
    !todayEntry?.absenceReason;
  const handleAcceptZe = async () => {
    const zeId = todayEntry?.ze?.id;
    if (!zeId) return;
    setIsAcceptingZe(true);
    try {
      await dashboardApi.acceptZeitausgleich(zeId);
      toast({
        title: "Zeitausgleich bestätigt",
        description: "Der Platz wurde für dich reserviert.",
      });
      await refreshDashboard();
    } catch (error: any) {
      toast({
        title: "Zeitausgleich konnte nicht bestätigt werden",
        description: error?.message || "Bitte versuche es erneut.",
        variant: "destructive",
      });
    } finally {
      setIsAcceptingZe(false);
    }
  };

  const handleCreateHeroAbsence = async () => {
    if (
      !heroAbsenceForm.employeeId ||
      !heroAbsenceForm.startDate ||
      !heroAbsenceForm.endDate
    ) {
      toast({
        title: "Unvollständige Angaben",
        description: "Bitte Mitarbeiter:in und Zeitraum wählen.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingHeroAbsence(true);
    try {
      await plannedAbsencesAdminApi.create({
        employeeId: Number(heroAbsenceForm.employeeId),
        startDate: heroAbsenceForm.startDate,
        endDate: heroAbsenceForm.endDate,
        reason: heroAbsenceForm.reason,
        notes: heroAbsenceForm.notes.trim() || null,
        status: heroAbsenceForm.status,
      });
      toast({
        title: "Abwesenheit gespeichert",
        description: "Der Eintrag wurde angelegt.",
      });
      setHeroAbsenceDialogOpen(false);
      setHeroAbsenceForm({
        employeeId: "",
        startDate: "",
        endDate: "",
        reason: "Urlaub",
        notes: "",
        status: "Geplant",
      });
      await Promise.all([
        refreshDashboard(),
        absencesEnabled
          ? dashboardApi.getAbsences().then(setAbsencesData).catch(() => undefined)
          : Promise.resolve(),
      ]);
    } catch (error: any) {
      toast({
        title: "Abwesenheit konnte nicht gespeichert werden",
        description: error?.message || "Bitte erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setIsSavingHeroAbsence(false);
    }
  };

  const attendanceWidget = dashboardData?.attendanceWidget ?? null;
  const todayAttendance = attendanceWidget?.today ?? null;
  const presentToday = useMemo<DashboardAttendanceMember[]>(() => {
    const members = todayAttendance?.members ?? [];
    return sortAttendanceMembers(members);
  }, [todayAttendance?.members]);
  const absentCountToday =
    typeof todayAttendance?.absentCount === "number"
      ? todayAttendance.absentCount
      : null;
  const presentTomorrow = useMemo<DashboardAttendanceMember[]>(() => {
    const members = attendanceWidget?.tomorrow?.members ?? [];
    return sortAttendanceMembers(members);
  }, [attendanceWidget?.tomorrow?.members]);

  const previewCards = useMemo<PreviewCard[]>(() => {
    if (!dashboardData?.weekPreview) return [];
    return dashboardData.weekPreview
      .map<PreviewCard | null>((entry) => {
        const iso = `${entry.date}T00:00:00`;
        const dateInstance = new Date(iso);
        if (Number.isNaN(dateInstance.getTime())) return null;
        return {
          date: entry.date,
          statusLabel: entry.statusLabel ?? null,
          workplace: entry.workplace ?? null,
          workplaceColor: entry.workplaceColor ?? null,
          teammateNames: (entry.teammates ?? [])
            .map((mate) => buildFullName(mate.firstName, mate.lastName))
            .filter(Boolean),
          dayLabel: format(dateInstance, "EEE", { locale: de }),
          dateLabel: format(dateInstance, "dd.MM.", { locale: de }),
        };
      })
      .filter((card): card is PreviewCard => card !== null);
  }, [dashboardData?.weekPreview]);

  const birthdayName = birthdayEntry
    ? buildFullName(birthdayEntry.firstName, birthdayEntry.lastName)
    : null;

  const enabledWidgetKeys = useMemo<Set<DashboardWidgetKey>>(() => {
    const configured =
      (dashboardData?.enabledWidgets && dashboardData.enabledWidgets.length > 0)
        ? dashboardData.enabledWidgets
        : (enabledWidgetsOverride ?? []);
    if (Array.isArray(configured) && configured.length > 0) {
      const normalized = configured.filter((value): value is DashboardWidgetKey =>
        DASHBOARD_WIDGETS.some((widget) => widget.key === value),
      );
      // Backfill the absences widget for profiles saved before this widget existed.
      if (!normalized.includes("absences")) {
        normalized.push("absences");
      }
      if (normalized.length) {
        return new Set(normalized);
      }
    }
    return new Set(DEFAULT_ENABLED_WIDGETS);
  }, [dashboardData?.enabledWidgets, enabledWidgetsOverride]);

  const isWidgetEnabled = useCallback(
    (key: DashboardWidgetKey) => enabledWidgetKeys.has(key),
    [enabledWidgetKeys],
  );

  const weekPreviewEnabled = isWidgetEnabled("week_preview");
  const absencesEnabled = isWidgetEnabled("absences");
  const attendanceEnabled = isWidgetEnabled("attendance");
  const canSeeRecentChanges =
    !viewAsUser &&
    (isAdmin ||
      user?.appRole === "Editor" ||
      user?.appRole === "Admin" ||
      can("dutyplan.edit") ||
      can("dutyplan.publish") ||
      can("weeklyplan.edit"));
  const recentChanges = canSeeRecentChanges
    ? (dashboardData?.recentChanges ?? [])
    : [];
  const unreadNotifications = useMemo(
    () => notificationsData.filter((item) => !item.isRead),
    [notificationsData],
  );
  const workplaceGroupCountToday = useMemo(() => {
    const keys = new Set<string>();
    presentToday.forEach((member) => {
      const workplace = normalizeWorkplace(member.workplace) ?? "Ohne Arbeitsplatz";
      const key =
        member.workplaceRoomId != null
          ? `room-${member.workplaceRoomId}`
          : `label-${workplace}`;
      keys.add(key);
    });
    return keys.size;
  }, [presentToday]);
  const workplaceGroupCountTomorrow = useMemo(() => {
    const keys = new Set<string>();
    presentTomorrow.forEach((member) => {
      const workplace = normalizeWorkplace(member.workplace) ?? "Ohne Arbeitsplatz";
      const key =
        member.workplaceRoomId != null
          ? `room-${member.workplaceRoomId}`
          : `label-${workplace}`;
      keys.add(key);
    });
    return keys.size;
  }, [presentTomorrow]);
  const dashboardNoticeItems = useMemo<DashboardNoticeItem[]>(() => {
    const items: DashboardNoticeItem[] = [];

    unreadNotifications.slice(0, 5).forEach((item) => {
      items.push({
        id: `notification-${item.id}`,
        notificationId: item.id,
        title: item.title,
        subtitle: item.message ?? null,
        targetUrl: item.link ?? "/nachrichten",
        meta: item.createdAt
          ? format(new Date(item.createdAt), "dd.MM. HH:mm", { locale: de })
          : null,
      });
    });

    if (wishMonthLabel) {
      items.push({
        id: "wish-month",
        title: `Dienstwünsche ${wishMonthLabel}`,
        subtitle: "Eingaben und Freigaben prüfen",
        targetUrl: "/dienstwuensche",
      });
    }

    if (showZeBadge) {
      items.push({
        id: "ze",
        title: "Zeitausgleich möglich",
        subtitle: "Im Heute-Bereich direkt bestätigbar",
        tone: "danger",
      });
    }

    if (canSeeRecentChanges) {
      recentChanges.slice(0, 5).forEach((item) => {
        items.push({
          id: `change-${item.id}`,
          title: item.title,
          subtitle: item.subtitle,
          targetUrl: item.targetUrl ?? null,
          tone: item.source === "dutyplan_shift" ? "danger" : "default",
          meta: format(new Date(item.changedAt), "dd.MM. HH:mm", { locale: de }),
        });
      });
    }

    return items.slice(0, 10);
  }, [
    canSeeRecentChanges,
    recentChanges,
    showZeBadge,
    unreadNotifications,
    wishMonthLabel,
  ]);

  useEffect(() => {
    if (!absencesEnabled) {
      setAbsencesData(null);
      setAbsencesError(null);
      setAbsencesLoading(false);
      return;
    }

    let cancelled = false;
    setAbsencesLoading(true);
    setAbsencesError(null);

    void dashboardApi
      .getAbsences()
      .then((data) => {
        if (cancelled) return;
        setAbsencesData(data);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setAbsencesError(
          error.message || "Fehler beim Laden der Abwesenheiten",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setAbsencesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [absencesEnabled]);

  const absenceDays = useMemo(
    () => absencesData?.days ?? [],
    [absencesData?.days],
  );
  const hasAbsenceEntries = useMemo(
    () => absenceDays.some((day) => day.types.length > 0),
    [absenceDays],
  );
  const absenceTypeCount = useMemo(
    () =>
      absenceDays.reduce((total, day) => {
        return total + day.types.reduce((inner, type) => inner + type.names.length, 0);
      }, 0),
    [absenceDays],
  );

  const renderTodayTileContent = () => (
    <div className="kabeg-deep-gradient rounded-xl px-4 py-4 text-primary-foreground shadow-lg shadow-primary/15">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p
            className="text-lg font-bold text-white sm:text-xl"
            data-testid="text-greeting"
          >
            {greeting} {firstName}
          </p>
          <div className="flex items-center gap-2 text-sm text-primary-foreground/90">
            <HeroIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{heroMessage}</span>
          </div>
          {todayTeamLine ? (
            <p className="text-xs text-primary-foreground/75">{todayTeamLine}</p>
          ) : null}
          {todayDutyLine ? (
            <p className="text-xs text-primary-foreground/75">{todayDutyLine}</p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className="shrink-0 border-primary-foreground/30 bg-primary-foreground/10 text-[10px] text-primary-foreground"
        >
          KABEG Klinikum Klagenfurt
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="h-8 px-3 text-xs text-primary shadow-none"
          onClick={() => setLocation("/dienstplaene")}
          data-testid="button-to-roster"
        >
          Zum Dienstplan
        </Button>
        <Button
          variant="outline"
          className="h-8 border-primary-foreground/20 bg-transparent px-3 text-xs text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          onClick={() => setLocation("/dienstwuensche")}
          data-testid="button-request-vacation"
        >
          Dienstwünsche{wishMonthLabel ? ` ${wishMonthLabel}` : ""}
        </Button>
        {canCreateAbsence ? (
          <Button
            variant="outline"
            className="h-8 border-primary-foreground/20 bg-transparent px-3 text-xs text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => setHeroAbsenceDialogOpen(true)}
          >
            Abwesenheit eintragen
          </Button>
        ) : null}
        {showZeBadge ? (
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-full bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAcceptZe}
            disabled={isAcceptingZe}
          >
            Zeitausgleich möglich
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderNotificationsCardContent = () => {
    if (notificationsLoading || isLoadingDashboard) {
      return <p className="text-xs text-muted-foreground">Benachrichtigungen werden geladen…</p>;
    }
    if (notificationsError && dashboardError) {
      return <p className="text-xs text-destructive">{notificationsError}</p>;
    }
    if (dashboardNoticeItems.length === 0) {
      return <p className="text-xs text-muted-foreground">Keine neuen Hinweise.</p>;
    }

    return (
      <div className="space-y-2">
        {dashboardNoticeItems.map((item) => {
          const clickable = Boolean(item.targetUrl);
          return (
            <div
              key={item.id}
              className={`group rounded-lg border px-3 py-2 text-left ${
                item.tone === "danger"
                  ? "border-rose-200 bg-rose-50/70"
                  : "border-slate-200 bg-slate-50/70"
              } ${clickable ? "cursor-pointer hover:bg-slate-100/80" : ""}`}
              onClick={clickable ? () => setLocation(item.targetUrl as string) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setLocation(item.targetUrl as string);
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold leading-snug ${
                      item.tone === "danger" ? "text-rose-700" : "text-foreground"
                    }`}
                  >
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  {item.notificationId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMarkNotificationRead(item.notificationId as number);
                      }}
                    >
                      Gelesen
                    </Button>
                  ) : null}
                  {item.meta ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {item.meta}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDashboardTile = ({
    tileKey,
    title,
    summary,
    rightSummary,
    headerAction,
    icon: Icon,
    content,
    accent = false,
  }: {
    tileKey: DashboardTileKey;
    title: string;
    summary: string;
    rightSummary?: string | null;
    headerAction?: ReactNode;
    icon: typeof Bell;
    content: ReactNode;
    accent?: boolean;
  }) => {
    const isOpen = openTiles.includes(tileKey);
    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleTile(tileKey)}>
        <Card
          className={`border-none kabeg-shadow overflow-hidden ${
            accent ? "bg-slate-950 text-white" : ""
          }`}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    accent ? "bg-white/10 text-white" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      accent ? "text-white" : "text-foreground"
                    }`}
                  >
                    {title}
                  </p>
                  <p
                    className={`mt-1 text-[11px] leading-snug ${
                      accent ? "text-white/70" : "text-muted-foreground"
                    }`}
                  >
                    {summary}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-3">
                {headerAction ? (
                  <div
                    className="mt-0.5"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {headerAction}
                  </div>
                ) : null}
                {rightSummary ? (
                  <span
                    className={`mt-0.5 text-right text-[11px] leading-snug ${
                      accent ? "text-white/70" : "text-muted-foreground"
                    }`}
                  >
                    {rightSummary}
                  </span>
                ) : null}
                <ChevronDown
                  className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  } ${accent ? "text-white/70" : "text-muted-foreground"}`}
                />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className={`px-4 pb-4 pt-0 ${accent ? "text-white" : ""}`}>
              {content}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  };

  const renderAttendanceBadges = (
    members: DashboardAttendanceMember[],
    testPrefix: string,
  ) => (
    <div className="flex flex-wrap gap-1.5">
      {members.length > 0 ? (
        members.map((p, i) => {
          const prev = i > 0 ? members[i - 1] : null;
          const currentRank = getAttendanceGroupRank(p.role);
          const prevRank = prev ? getAttendanceGroupRank(prev.role) : null;
          const showDivider = prevRank !== null && prevRank !== currentRank;
          const name = buildFullName(p.firstName, p.lastName);
          const workplace = normalizeWorkplace(p.workplace);

          return (
            <Fragment key={`${p.employeeId}-${i}`}>
              {showDivider ? <Separator className="my-0.5 w-full" /> : null}
              <Badge
                variant="secondary"
                className={`${STAFF_BADGE_BASE} ${
                  p.isDuty ? STAFF_BADGE_DUTY : STAFF_BADGE_NORMAL
                }`}
                data-testid={`${testPrefix}-${i}`}
              >
                <div className={STAFF_NAME_CLASS}>{name || "Kolleg:in"}</div>
                {workplace ? (
                  <div className={STAFF_WORKPLACE_CLASS}>{workplace}</div>
                ) : null}
              </Badge>
            </Fragment>
          );
        })
      ) : (
        <p className="text-xs text-muted-foreground sm:text-sm">Keine Daten verfuegbar.</p>
      )}
    </div>
  );

  const renderAttendanceByWorkplaces = (
    members: DashboardAttendanceMember[],
    testPrefix: string,
  ) => {
    if (members.length === 0) {
      return <p className="text-xs text-muted-foreground sm:text-sm">Keine Daten verfuegbar.</p>;
    }

    const groups = new Map<
      string,
      {
        label: string;
        roomId: number | null;
        sortOrder: number | null;
        color: string | null;
        members: DashboardAttendanceMember[];
      }
    >();
    for (const member of members) {
      const workplace = normalizeWorkplace(member.workplace) ?? "Ohne Arbeitsplatz";
      const key =
        member.workplaceRoomId != null
          ? `room-${member.workplaceRoomId}`
          : `label-${workplace}`;
      const group = groups.get(key) ?? {
        label: workplace,
        roomId: member.workplaceRoomId ?? null,
        sortOrder:
          typeof member.workplaceSortOrder === "number"
            ? member.workplaceSortOrder
            : null,
        color: member.workplaceColor ?? null,
        members: [],
      };
      group.members.push(member);
      if (group.color == null && member.workplaceColor) {
        group.color = member.workplaceColor;
      }
      if (
        group.sortOrder == null &&
        typeof member.workplaceSortOrder === "number"
      ) {
        group.sortOrder = member.workplaceSortOrder;
      }
      groups.set(key, group);
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 9999;
      const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label, "de");
    });

    return (
      <div className="space-y-2.5">
        {sortedGroups.map((group, groupIndex) => {
          const sortedPeople = [...group.members].sort((a, b) => {
            const rankA = getRoleRank(a.role);
            const rankB = getRoleRank(b.role);
            if (rankA !== rankB) return rankA - rankB;
            const aLast = (a.lastName ?? "").trim();
            const bLast = (b.lastName ?? "").trim();
            const lastCmp = aLast.localeCompare(bLast, "de");
            if (lastCmp !== 0) return lastCmp;
            const aFirst = (a.firstName ?? "").trim();
            const bFirst = (b.firstName ?? "").trim();
            return aFirst.localeCompare(bFirst, "de");
          });

          return (
            <Fragment key={`${testPrefix}-group-${group.roomId ?? group.label}`}>
              {groupIndex > 0 ? <Separator className="my-0.5" /> : null}
              <div
                className="space-y-1.5 rounded-md border p-1.5 shadow-sm"
                style={
                  group.color
                    ? {
                        backgroundColor: withHexAlpha(group.color, "38") ?? undefined,
                        borderColor: withHexAlpha(group.color, "AA") ?? group.color,
                        boxShadow: `inset 3px 0 0 ${darkenHexColor(group.color, 0.45) ?? group.color}`,
                      }
                    : undefined
                }
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={
                    group.color
                      ? { color: darkenHexColor(group.color, 0.28) ?? darkenHexColor(group.color, 0.45) ?? group.color }
                      : undefined
                  }
                >
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sortedPeople.map((person, personIndex) => {
                    const name = buildFullName(person.firstName, person.lastName) || "Kolleg:in";
                    return (
                      <Badge
                        key={`${testPrefix}-${group.label}-${person.employeeId}-${personIndex}`}
                        variant="secondary"
                        className={`px-2 py-1 text-xs sm:text-sm font-medium ${
                          person.isDuty ? STAFF_BADGE_DUTY : STAFF_BADGE_NORMAL
                        }`}
                        data-testid={`${testPrefix}-${groupIndex}-${personIndex}`}
                      >
                        {name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  };

  const renderPeopleCardContent = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Heute
          </p>
          <span className="text-[11px] text-muted-foreground">
            {presentToday.length} Personen
          </span>
        </div>
        {renderAttendanceBadges(presentToday, "staff-present")}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>
          {typeof absentCountToday === "number"
            ? `${absentCountToday} Abwesende heute`
            : "Abwesende heute: –"}
        </span>
      </div>

      <Separator className="my-0.5" />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Morgen
          </p>
          <span className="text-[11px] text-muted-foreground">
            {presentTomorrow.length} Personen
          </span>
        </div>
        {renderAttendanceBadges(presentTomorrow, "staff-tomorrow")}
      </div>
    </div>
  );

  const renderWorkplacesCardContent = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Heute
          </p>
          <span className="text-[11px] text-muted-foreground">
            {workplaceGroupCountToday} Arbeitsplätze
          </span>
        </div>
        {renderAttendanceByWorkplaces(presentToday, "staff-workplace-present")}
      </div>

      <Separator className="my-0.5" />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Morgen
          </p>
          <span className="text-[11px] text-muted-foreground">
            {workplaceGroupCountTomorrow} Arbeitsplätze
          </span>
        </div>
        {renderAttendanceByWorkplaces(
          presentTomorrow,
          "staff-workplace-tomorrow",
        )}
      </div>
    </div>
  );

  const renderAbsencesCardContent = () => {
    if (absencesLoading) {
      return (
        <p className="text-xs text-muted-foreground sm:text-sm">
          Abwesenheiten werden geladen…
        </p>
      );
    }
    if (absencesError) {
      return <p className="text-xs text-destructive sm:text-sm">{absencesError}</p>;
    }
    if (!hasAbsenceEntries) {
      return (
        <p className="text-xs text-muted-foreground sm:text-sm">
          Keine Abwesenheiten im Zeitraum.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {absenceDays
          .filter((day) => day.types.length > 0)
          .map((day) => {
            const dateLabel = format(
              new Date(`${day.date}T00:00:00`),
              "EEEE, dd.MM.",
              { locale: de },
            );

            return (
              <div key={day.date} className="space-y-2">
                <p className="text-xs font-semibold text-foreground sm:text-sm">
                  {dateLabel}
                </p>
                <div className="space-y-2">
                  {day.types.map((type) => (
                    <div key={type.type} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {type.type}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {type.names.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    );
  };

  const renderWeekPreviewCardContent = () => (
    <div className="space-y-4">
      {isLoadingDashboard ? (
        <p className="text-xs text-muted-foreground sm:text-sm">
          Wochenvorschau wird geladen…
        </p>
      ) : dashboardError ? (
        <p className="text-xs text-destructive sm:text-sm">Fehler: {dashboardError}</p>
      ) : previewCards.length === 0 ? (
        <p className="text-xs text-muted-foreground sm:text-sm">
          Keine Einsätze für die Vorschau verfügbar.
        </p>
      ) : (
        previewCards.map((item, i) => {
          const badgeText = getDutyBadgeText(item.statusLabel);
          const previewAccent = item.workplaceColor ?? null;

          const normalizedStatus = (item.statusLabel ?? "").toLowerCase();
          const isAbsence = ABSENCE_KEYWORDS.some((k) =>
            normalizedStatus.includes(k),
          );

          const line2Raw = isAbsence
            ? item.statusLabel ?? ""
            : item.workplace ?? "";

          const line2 =
            line2Raw && line2Raw !== "Diensthabende" ? line2Raw : "";

          return (
            <div
              key={`${item.date}-${i}`}
              className={`p-3 rounded-lg border ${
                previewAccent ? "" : i === 0 ? "bg-primary/5 border-primary/20" : "border-border"
              }`}
              style={
                previewAccent
                  ? {
                      backgroundColor: withHexAlpha(previewAccent, i === 0 ? "42" : "2E") ?? undefined,
                      borderColor: withHexAlpha(previewAccent, i === 0 ? "B8" : "8E") ?? previewAccent,
                      boxShadow: `inset 3px 0 0 ${darkenHexColor(previewAccent, 0.45) ?? previewAccent}`,
                    }
                  : undefined
              }
              data-testid={`schedule-day-${i}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium sm:text-sm">
                  {item.dayLabel}{" "}
                  <span className="text-muted-foreground">
                    – {item.dateLabel}
                  </span>
                </span>

                {badgeText ? <Badge>{badgeText}</Badge> : null}
              </div>

              {line2 ? (
                <p className="text-xs text-muted-foreground mb-1">{line2}</p>
              ) : null}

              {item.teammateNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Mit: {item.teammateNames.join(", ")}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
  const renderAbsencesCard = () => (
    <Card className="border-none kabeg-shadow flex flex-col">
      <CardHeader className="flex items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="w-5 h-5" />
            Abwesenheiten
          </CardTitle>
          <CardDescription>Nächste 7 Tage</CardDescription>
        </div>
        {canCreateAbsence && (
          <Button
            variant="outline"
            size="sm"
            className="text-sm font-medium"
            onClick={() => setLocation("/admin/urlaubsplan")}
          >
            Abwesenheit eintragen
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {renderAbsencesCardContent()}
      </CardContent>
    </Card>
  );

  const renderRecentChangesCard = () => {
    if (!canSeeRecentChanges) return null;

    return (
      <Card className="border-none kabeg-shadow flex flex-col">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Letzte Änderungen
          </CardTitle>
          <CardDescription>Dienstplan, Abwesenheiten und Wochenplan, max. 10</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoadingDashboard ? (
            <p className="text-sm text-muted-foreground">Änderungen werden geladen…</p>
          ) : dashboardError ? (
            <p className="text-sm text-destructive">Fehler: {dashboardError}</p>
          ) : recentChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Änderungen vorhanden.</p>
          ) : (
            <div className="space-y-3">
              {recentChanges.map((item: DashboardRecentChange) => {
                const isDutyPlanChange = item.source === "dutyplan_shift";
                const changedAtDate = new Date(item.changedAt);
                const changedAtLabel = Number.isNaN(changedAtDate.getTime())
                  ? ""
                  : format(changedAtDate, "dd.MM. HH:mm", { locale: de });
                const sourceLabel =
                  item.source === "dutyplan_shift"
                    ? "Dienstplan"
                    : item.source === "dutyplan_absence"
                      ? "Abwesenheit"
                      : item.source === "weeklyplan_assignment"
                        ? "Wochenplan"
                      : "Wochenplan";
                const isClickable = Boolean(item.targetUrl);
                const actionLabel = item.action === "updated" ? "Geändert" : "Neu";
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 space-y-1 ${
                      isDutyPlanChange ? "border-rose-200 bg-rose-50/40" : ""
                    } ${isClickable ? "cursor-pointer hover:bg-muted/40" : ""}`}
                    onClick={
                      item.targetUrl ? () => setLocation(item.targetUrl as string) : undefined
                    }
                    role={isClickable ? "button" : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      item.targetUrl
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setLocation(item.targetUrl as string);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          isDutyPlanChange
                            ? "border-rose-300 text-rose-700"
                            : ""
                        }`}
                      >
                        {sourceLabel}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {actionLabel}{changedAtLabel ? ` • ${changedAtLabel}` : ""}
                      </span>
                    </div>
                    <p
                      className={`text-xs font-medium leading-snug ${
                        isDutyPlanChange ? "text-rose-700" : "text-foreground"
                      }`}
                    >
                      {item.title}
                    </p>
                    {item.subtitle ? (
                      <p className="text-xs text-muted-foreground leading-snug">
                        {item.subtitle}
                      </p>
                    ) : null}
                    {item.actorName ? (
                      <p className="text-[11px] text-muted-foreground">
                        von {item.actorName}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const notificationsSummary = notificationsLoading
    ? "Benachrichtigungen werden geladen"
    : dashboardNoticeItems.length > 0
      ? `${unreadNotifications.length} neue Hinweise${
          canSeeRecentChanges ? ` · ${recentChanges.length} Änderungen` : ""
        }`
      : "Keine neuen Hinweise";
  const todaySummary =
    normalizedTodayStatusLabel ??
    todayEntry?.workplace ??
    todayDutyLine ??
    "Kein aktueller Eintrag";
  const weekSummary =
    previewCards.length > 0
      ? `${previewCards.length} Tage · ${previewCards[0]?.dayLabel} ${previewCards[0]?.dateLabel}`
      : "Keine Einsätze";
  const peopleSummary = `Heute ${presentToday.length} · morgen ${presentTomorrow.length}`;
  const workplacesSummary = `Heute ${workplaceGroupCountToday} · morgen ${workplaceGroupCountTomorrow}`;
  const absencesSummary = absencesLoading
    ? "Lädt…"
    : `${typeof absentCountToday === "number" ? absentCountToday : 0} heute · ${absenceTypeCount} Einträge`;
  const birthdaySummary = birthdayName
    ? `Heute Geburtstag: ${birthdayName}`
    : null;

  return (
    <Layout title="Dashboard">
      <div className="space-y-4 px-3 md:px-0">
        <div className="space-y-4">
          <div>
            {renderTodayTileContent()}
          </div>

          <div>
            {renderDashboardTile({
              tileKey: "notifications",
              title: "Notifications",
              summary: notificationsSummary,
              headerAction:
                unreadNotifications.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={handleMarkAllNotificationsRead}
                  >
                    Alles gelesen
                  </Button>
                ) : null,
              rightSummary: birthdaySummary,
              icon: Bell,
              content: renderNotificationsCardContent(),
              accent: true,
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weekPreviewEnabled ? (
              <div>
                {renderDashboardTile({
                  tileKey: "week",
                  title: "Meine Woche",
                  summary: weekSummary,
                  icon: CalendarDays,
                  content: renderWeekPreviewCardContent(),
                })}
              </div>
            ) : null}

            {absencesEnabled ? (
              <div>
                {renderDashboardTile({
                  tileKey: "absences",
                  title: "Abwesenheiten",
                  summary: absencesSummary,
                  icon: CalendarClock,
                  content: (
                    <div className="space-y-3">
                      {canCreateAbsence ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setLocation("/admin/urlaubsplan")}
                        >
                          Abwesenheit eintragen
                        </Button>
                      ) : null}
                      {renderAbsencesCardContent()}
                    </div>
                  ),
                })}
              </div>
            ) : null}

            {attendanceEnabled ? (
              <div>
                {renderDashboardTile({
                  tileKey: "people",
                  title: "Personen heute / morgen",
                  summary: peopleSummary,
                  icon: Users,
                  content: renderPeopleCardContent(),
                })}
              </div>
            ) : null}

            {attendanceEnabled ? (
              <div>
                {renderDashboardTile({
                  tileKey: "workplaces",
                  title: "Arbeitsplätze heute / morgen",
                  summary: workplacesSummary,
                  icon: BriefcaseBusiness,
                  content: renderWorkplacesCardContent(),
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <Dialog open={heroAbsenceDialogOpen} onOpenChange={setHeroAbsenceDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Abwesenheit eintragen</DialogTitle>
            <DialogDescription>
              Schnellzugriff fuer Admins direkt aus dem Dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="hero-absence-employee">Mitarbeiter:in</Label>
              <Select
                value={heroAbsenceForm.employeeId}
                onValueChange={(value) =>
                  setHeroAbsenceForm((current) => ({
                    ...current,
                    employeeId: value,
                  }))
                }
              >
                <SelectTrigger id="hero-absence-employee">
                  <SelectValue
                    placeholder={
                      heroAbsenceEmployeesLoading
                        ? "Mitarbeiter werden geladen…"
                        : "Mitarbeiter:in wählen"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {heroAbsenceEmployees.map((entry) => (
                    <SelectItem key={entry.id} value={String(entry.id)}>
                      {buildFullName(entry.firstName, entry.lastName) || entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="hero-absence-start">Von</Label>
                <Input
                  id="hero-absence-start"
                  type="date"
                  value={heroAbsenceForm.startDate}
                  onChange={(event) =>
                    setHeroAbsenceForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hero-absence-end">Bis</Label>
                <Input
                  id="hero-absence-end"
                  type="date"
                  value={heroAbsenceForm.endDate}
                  onChange={(event) =>
                    setHeroAbsenceForm((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="hero-absence-reason">Grund</Label>
                <Select
                  value={heroAbsenceForm.reason}
                  onValueChange={(value) =>
                    setHeroAbsenceForm((current) => ({
                      ...current,
                      reason: value,
                    }))
                  }
                >
                  <SelectTrigger id="hero-absence-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HERO_ABSENCE_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hero-absence-status">Status</Label>
                <Select
                  value={heroAbsenceForm.status}
                  onValueChange={(value: "Geplant" | "Genehmigt" | "Abgelehnt") =>
                    setHeroAbsenceForm((current) => ({
                      ...current,
                      status: value,
                    }))
                  }
                >
                  <SelectTrigger id="hero-absence-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Geplant">Geplant</SelectItem>
                    <SelectItem value="Genehmigt">Genehmigt</SelectItem>
                    <SelectItem value="Abgelehnt">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hero-absence-notes">Notiz</Label>
              <Textarea
                id="hero-absence-notes"
                value={heroAbsenceForm.notes}
                onChange={(event) =>
                  setHeroAbsenceForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHeroAbsenceDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleCreateHeroAbsence} disabled={isSavingHeroAbsence}>
              {isSavingHeroAbsence ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
