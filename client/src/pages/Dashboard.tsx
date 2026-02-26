import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  CalendarClock,
  FileText,
  ArrowRight,
  Star,
  Cake,
  Users,
  Clock,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import {
  dashboardApi,
  rosterSettingsApi,
  type DashboardAbsencesResponse,
  type DashboardAttendanceMember,
  type DashboardRecentChange,
  type DashboardResponse,
  type NextPlanningMonth,
} from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
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
  "inline-flex flex-col items-start gap-1 rounded-md border px-3 py-1.5 md:px-4 md:py-2 text-[11px] sm:text-xs font-medium leading-tight";
const STAFF_BADGE_DUTY =
  "bg-rose-50 text-rose-700 border-rose-200 font-semibold";
const STAFF_BADGE_NORMAL = "bg-slate-50 text-slate-700 border-slate-200";
const STAFF_NAME_CLASS = "text-sm";
const STAFF_WORKPLACE_CLASS =
  "text-[10px] sm:text-xs text-muted-foreground leading-tight";
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
const DASHBOARD_ATTENDANCE_VIEW_MODE_KEY = "dashboard_attendance_view_mode";

export default function Dashboard() {
  const { employee, user, can, token, isAdmin, viewAsUser } = useAuth();
  const [, setLocation] = useLocation();

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
  const [mobilePanel, setMobilePanel] = useState<"week" | "team">("week");
  const [attendanceViewMode, setAttendanceViewMode] = useState<"people" | "workplaces">(() => {
    try {
      const stored = localStorage.getItem(DASHBOARD_ATTENDANCE_VIEW_MODE_KEY);
      return stored === "workplaces" ? "workplaces" : "people";
    } catch {
      return "people";
    }
  });
  const touchStart = useRef<{ x: number; y: number } | null>(null);
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

    fetch("/api/me", {
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
      localStorage.setItem(DASHBOARD_ATTENDANCE_VIEW_MODE_KEY, attendanceViewMode);
    } catch {
      // ignore localStorage issues
    }
  }, [attendanceViewMode]);

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

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (!touchStart.current || !touch) return;
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      setMobilePanel(dx < 0 ? "team" : "week");
    }
    touchStart.current = null;
  };

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

  const todayEntry = dashboardData?.today ?? null;
  const birthdayEntry = dashboardData?.birthday ?? null;

  const heroEmoji = dashboardError ? "⚠️" : todayEntry?.statusLabel ? "🩺" : "👋";
  const heroMessage = dashboardError
    ? dashboardError.startsWith("Fehler")
      ? dashboardError
      : `Fehler: ${dashboardError}`
    : todayEntry?.statusLabel
      ? `Heute: ${todayEntry.statusLabel}`
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
  const todayDutyLine = useMemo(() => {
    const duty = todayEntry?.duty;
    if (!duty) return null;
    const label = duty.labelShort ?? duty.serviceType ?? "Dienst";
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
      .map((entry) => {
        const iso = `${entry.date}T00:00:00`;
        const dateInstance = new Date(iso);
        if (Number.isNaN(dateInstance.getTime())) return null;
        return {
          date: entry.date,
          statusLabel: entry.statusLabel ?? null,
          workplace: entry.workplace ?? null,
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
  const birthdayEnabled = isWidgetEnabled("birthday");
  const documentsEnabled = isWidgetEnabled("documents");
  const sopsEnabled = isWidgetEnabled("sops_new");
  const favoritesEnabled = isWidgetEnabled("favorites");
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

  const mobilePanelEnabled = weekPreviewEnabled || attendanceEnabled;

  useEffect(() => {
    // Keep mobile panel in a valid state if one tab is disabled
    if (!weekPreviewEnabled && attendanceEnabled) {
      setMobilePanel("team");
    } else if (weekPreviewEnabled && !attendanceEnabled) {
      setMobilePanel("week");
    }
  }, [weekPreviewEnabled, attendanceEnabled]);

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

  const renderHeroCard = () => (
    <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 text-primary-foreground shadow-lg shadow-primary/10">
      <div className="flex items-center justify-between mb-2">
        <h2
          className="text-3xl font-bold text-white"
          data-testid="text-greeting"
        >
          {greeting} {firstName}
        </h2>
        <Badge
          variant="outline"
          className="text-primary-foreground border-primary-foreground/30 bg-primary-foreground/10"
        >
          KABEG Klinikum Klagenfurt
        </Badge>
      </div>
      <p className="text-primary-foreground/80 max-w-xl text-lg flex items-center gap-2">
        <span className="text-2xl">{heroEmoji}</span>
        <span>{heroMessage}</span>
      </p>
      {todayTeamLine && (
        <p className="text-sm text-primary-foreground/70 mt-1">
          {todayTeamLine}
        </p>
      )}
      {todayDutyLine && (
        <p className="text-sm text-primary-foreground/70 mt-1">
          {todayDutyLine}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Button
          variant="secondary"
          className="text-primary font-medium shadow-none border-0"
          onClick={() => setLocation("/dienstplaene")}
          data-testid="button-to-roster"
        >
          Zum Dienstplan
        </Button>
        <Button
          variant="outline"
          className="bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          onClick={() => setLocation("/dienstwuensche")}
          data-testid="button-request-vacation"
        >
          <span className="flex flex-col leading-tight text-left">
            <span>Dienstwünsche</span>
            {wishMonthLabel ? (
              <span className="text-[11px] text-primary-foreground/80">
                {wishMonthLabel}
              </span>
            ) : null}
          </span>
        </Button>
      </div>
      {showZeBadge && (
        <div className="mt-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAcceptZe}
            disabled={isAcceptingZe}
          >
            Zeitausgleich möglich
          </button>
        </div>
      )}
    </div>
  );

  const renderAttendanceBadges = (
    members: DashboardAttendanceMember[],
    testPrefix: string,
  ) => (
    <div className="flex flex-wrap gap-2">
      {members.length > 0 ? (
        members.map((p, i) => {
          const prev = i > 0 ? members[i - 1] : null;
          const currentRank = getRoleRank(p.role);
          const prevRank = prev ? getRoleRank(prev.role) : null;
          const showDivider = prevRank !== null && prevRank !== currentRank;
          const name = buildFullName(p.firstName, p.lastName);
          const workplace = normalizeWorkplace(p.workplace);

          return (
            <Fragment key={`${p.employeeId}-${i}`}>
              {showDivider ? <Separator className="w-full my-1" /> : null}
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
        <p className="text-sm text-muted-foreground">Keine Daten verfuegbar.</p>
      )}
    </div>
  );

  const renderAttendanceByWorkplaces = (
    members: DashboardAttendanceMember[],
    testPrefix: string,
  ) => {
    if (members.length === 0) {
      return <p className="text-sm text-muted-foreground">Keine Daten verfuegbar.</p>;
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
      <div className="space-y-4">
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
              {groupIndex > 0 ? <Separator /> : null}
              <div
                className="space-y-2 rounded-md border p-2 shadow-sm"
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
                  className="text-xs font-bold uppercase tracking-wide"
                  style={
                    group.color
                      ? { color: darkenHexColor(group.color, 0.28) ?? darkenHexColor(group.color, 0.45) ?? group.color }
                      : undefined
                  }
                >
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sortedPeople.map((person, personIndex) => {
                    const name = buildFullName(person.firstName, person.lastName) || "Kolleg:in";
                    return (
                      <Badge
                        key={`${testPrefix}-${group.label}-${person.employeeId}-${personIndex}`}
                        variant="secondary"
                        className={`px-3 py-1.5 text-sm font-medium ${
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

  const renderAttendanceCardContent = () => (
    <div className="space-y-4 md:px-6 md:pb-6">
      <Tabs
        value={attendanceViewMode}
        onValueChange={(value) =>
          setAttendanceViewMode(value === "workplaces" ? "workplaces" : "people")
        }
      >
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="people">Personen</TabsTrigger>
          <TabsTrigger value="workplaces">Arbeitsplätze</TabsTrigger>
        </TabsList>
      </Tabs>

      {attendanceViewMode === "workplaces"
        ? renderAttendanceByWorkplaces(presentToday, "staff-workplace-present")
        : renderAttendanceBadges(presentToday, "staff-present")}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>
          {typeof absentCountToday === "number"
            ? `${absentCountToday} Abwesende heute`
            : "Abwesende heute: –"}
        </span>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">Team morgen</p>
        </div>
        {attendanceViewMode === "workplaces"
          ? renderAttendanceByWorkplaces(
              presentTomorrow,
              "staff-workplace-tomorrow",
            )
          : renderAttendanceBadges(presentTomorrow, "staff-tomorrow")}
      </div>
    </div>
  );

  const renderAttendanceCard = () => {
    if (!attendanceEnabled) return null;
    return (
      <Card className="border-none kabeg-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Heute anwesend
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4 md:px-6 md:pb-6">
          {renderAttendanceCardContent()}
        </CardContent>
      </Card>
    );
  };

  const renderAbsencesCardContent = () => {
    if (absencesLoading) {
      return (
        <p className="text-sm text-muted-foreground">
          Abwesenheiten werden geladen…
        </p>
      );
    }
    if (absencesError) {
      return <p className="text-sm text-destructive">{absencesError}</p>;
    }
    if (!hasAbsenceEntries) {
      return (
        <p className="text-sm text-muted-foreground">
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
                <p className="text-sm font-semibold text-foreground">
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
        <p className="text-sm text-muted-foreground">
          Wochenvorschau wird geladen…
        </p>
      ) : dashboardError ? (
        <p className="text-sm text-destructive">Fehler: {dashboardError}</p>
      ) : previewCards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Einsätze für die Vorschau verfügbar.
        </p>
      ) : (
        previewCards.map((item, i) => {
          const badgeText = getDutyBadgeText(item.statusLabel);

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
                i === 0 ? "bg-primary/5 border-primary/20" : "border-border"
              }`}
              data-testid={`schedule-day-${i}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">
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

  const canCreateAbsence = can("absence.create");
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

  const renderMiscWidgets = () => {
    if (!documentsEnabled && !sopsEnabled && !favoritesEnabled) return null;

    return (
      <>
        {(sopsEnabled || favoritesEnabled) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sopsEnabled && (
              <Card className="border-none kabeg-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">
                      Neue SOPs
                    </p>
                    <p className="text-2xl font-bold text-foreground">–</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {favoritesEnabled && (
              <Card className="border-none kabeg-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Star className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">
                      Meine Favoriten
                    </p>
                    <p className="text-2xl font-bold text-foreground">–</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {documentsEnabled && (
          <Card className="border-none kabeg-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Neue Dokumente</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setLocation("/wissen")}
              >
                Alle anzeigen
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Neu hinzugefügt
                  </h4>
                  <div className="space-y-2">
                    {DUMMY_NEW_SOPS.map((sop) => (
                      <div
                        key={sop.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors border border-transparent hover:border-border group cursor-pointer"
                        data-testid={`sop-new-${sop.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground text-sm">
                              {sop.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {sop.category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {sop.date}
                              </span>
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Meist genutzt
                  </h4>
                  <div className="space-y-2">
                    {DUMMY_POPULAR_SOPS.map((sop) => (
                      <div
                        key={sop.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors border border-transparent hover:border-border group cursor-pointer"
                        data-testid={`sop-popular-${sop.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground text-sm">
                              {sop.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {sop.category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {sop.views} Aufrufe
                              </span>
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-600 transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </>
    );
  };

  const renderBirthdayCard = () => {
    if (!birthdayEnabled) return null;
    return birthdayName ? (
      <Card className="border-none kabeg-shadow bg-gradient-to-br from-pink-50 to-orange-50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center">
            <Cake className="w-6 h-6 text-pink-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Heute hat Geburtstag:
            </p>
            <p
              className="text-base font-bold text-pink-700"
              data-testid="text-birthday"
            >
              {birthdayName}
            </p>
          </div>
        </CardContent>
      </Card>
    ) : null;
  };
  return (
    <Layout title="Dashboard">
      <div className="hidden md:grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-12">
          {renderHeroCard()}
        </div>
        <div className="md:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">{renderAttendanceCard()}</div>
          <div className="lg:col-span-3 space-y-6">
            {renderRecentChangesCard()}
            {weekPreviewEnabled && (
              <Card className="border-none kabeg-shadow flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarDays className="w-5 h-5" />
                    Wochenvorschau
                  </CardTitle>
                  <CardDescription>Deine nächsten Einsätze</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  {renderWeekPreviewCardContent()}
                </CardContent>
              </Card>
            )}
          </div>
          <div className="lg:col-span-3 space-y-6">
            {absencesEnabled && renderAbsencesCard()}
            {renderBirthdayCard()}
          </div>
        </div>
        <div className="md:col-span-12">
          {renderMiscWidgets()}
        </div>
      </div>

      <div className="md:hidden space-y-6 px-4">
        {renderHeroCard()}
        {mobilePanelEnabled && (
          <Card
            className="border-none kabeg-shadow"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <CardContent className="pb-2">
              <div className="flex gap-2">
                {weekPreviewEnabled && (
                  <Button
                    variant={mobilePanel === "week" ? "secondary" : "ghost"}
                    size="sm"
                    className="px-3 py-1 text-xs"
                    onClick={() => setMobilePanel("week")}
                    aria-pressed={mobilePanel === "week"}
                  >
                    Woche
                  </Button>
                )}
                {attendanceEnabled && (
                  <Button
                    variant={mobilePanel === "team" ? "secondary" : "ghost"}
                    size="sm"
                    className="px-3 py-1 text-xs"
                    onClick={() => setMobilePanel("team")}
                    aria-pressed={mobilePanel === "team"}
                  >
                    Heute/Morgen
                  </Button>
                )}
              </div>
            </CardContent>
            <CardContent className="pt-0">
              {(weekPreviewEnabled && mobilePanel === "week"
                ? renderWeekPreviewCardContent()
                : renderAttendanceCardContent())}
            </CardContent>
          </Card>
        )}
        {renderRecentChangesCard()}
        {renderBirthdayCard()}
        {absencesEnabled && renderAbsencesCard()}
        {renderMiscWidgets()}
      </div>
    </Layout>
  );
}
