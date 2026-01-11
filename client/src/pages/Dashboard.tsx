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
import {
  CalendarDays,
  FileText,
  ArrowRight,
  Star,
  Cake,
  Users,
  Clock,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { dashboardApi, type DashboardResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { getAustrianHoliday } from "@/lib/holidays";
import { useToast } from "@/hooks/use-toast";

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

type AttendanceMemberApi = {
  employeeId: number;
  firstName: string | null;
  lastName: string | null;
  workplace: string | null;
  role?: string | null;
  isDuty?: boolean;
};

type AttendanceMemberVM = {
  employeeId: number;
  firstName: string | null;
  lastName: string | null;
  name: string;
  workplace: string | null;
  role: string | null;
  isDuty: boolean;
  roleRank: number;
};

type AttendanceWidget = {
  today: {
    date: string;
    members: AttendanceMemberApi[];
    absentCount: number;
  };
  tomorrow: {
    date: string | null;
    members: AttendanceMemberApi[];
    absentCount?: number;
  };
};

const getRoleRank = (role?: string | null) => {
  const r = (role ?? "").toLowerCase();
  if (!r) return 99;

  // Primar / Primaria
  if (r.includes("primar")) return 0;

  // 1. Oberarzt / Erster Oberarzt
  if (r.includes("1. ober") || r.includes("erster ober")) return 1;

  // OA + Facharzt in denselben Block
  if (
    r.includes("oberarzt") ||
    r.includes("oberärzt") ||
    r.includes("facharzt") ||
    r.includes("fachärzt")
  ) {
    return 2;
  }

  if (r.includes("assistenz")) return 3;
  if (r.includes("turnus")) return 4;
  if (r.includes("kpj") || r.includes("student") || r.includes("famul")) return 5;

  // Sekretariat (falls es je in der Liste auftaucht)
  if (r.includes("sekret")) return 98;

  return 90;
};

const toAttendanceVm = (p: AttendanceMemberApi): AttendanceMemberVM | null => {
  const name = buildFullName(p.firstName, p.lastName);
  if (!name) return null;

  const role = p.role ?? null;
  return {
    employeeId: p.employeeId,
    firstName: p.firstName ?? null,
    lastName: p.lastName ?? null,
    name,
    workplace: normalizeWorkplace(p.workplace),
    role,
    isDuty: Boolean(p.isDuty),
    roleRank: getRoleRank(role),
  };
};

const compareAttendanceVm = (a: AttendanceMemberVM, b: AttendanceMemberVM) => {
  if (a.roleRank !== b.roleRank) return a.roleRank - b.roleRank;

  // Wenn Rang gleich: alphabetisch (Nachname, Vorname)
  const aLast = (a.lastName ?? "").trim();
  const bLast = (b.lastName ?? "").trim();
  const lastCmp = aLast.localeCompare(bLast, "de");
  if (lastCmp !== 0) return lastCmp;

  const aFirst = (a.firstName ?? "").trim();
  const bFirst = (b.firstName ?? "").trim();
  const firstCmp = aFirst.localeCompare(bFirst, "de");
  if (firstCmp !== 0) return firstCmp;

  return a.name.localeCompare(b.name, "de");
};

export default function Dashboard() {
  const { employee, user } = useAuth();
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { toast } = useToast();

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
  const showTeammates =
    !dashboardError && (todayEntry?.teammates?.length ?? 0) > 0;
  const todayTeamNames = useMemo(
    () =>
      (todayEntry?.teammates ?? [])
        .map((t) => buildFullName(t.firstName, t.lastName))
        .filter(Boolean),
    [todayEntry?.teammates],
  );
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

  const attendanceWidget = (dashboardData as any)?.attendanceWidget as
    | AttendanceWidget
    | null;
  const presentToday = useMemo<AttendanceMemberVM[]>(() => {
    const list = attendanceWidget?.today?.members ?? [];
    const vms = list
      .map((member) => toAttendanceVm(member))
      .filter((entry): entry is AttendanceMemberVM => Boolean(entry));
    vms.sort(compareAttendanceVm);
    return vms;
  }, [attendanceWidget?.today?.members]);
  const absentCountToday =
    typeof attendanceWidget?.today?.absentCount === "number"
      ? attendanceWidget.today!.absentCount
      : null;
  const presentTomorrow = useMemo<AttendanceMemberVM[]>(() => {
    const list = attendanceWidget?.tomorrow?.members ?? [];
    const vms = list
      .map((member) => toAttendanceVm(member))
      .filter((entry): entry is AttendanceMemberVM => Boolean(entry));
    vms.sort(compareAttendanceVm);
    return vms;
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
      {showTeammates && (
        <p className="text-sm text-primary-foreground/70 mt-1">
          Mit: {todayTeamNames.join(", ")}
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
          Dienstwünsche
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

  const renderAttendanceCardContent = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {presentToday.length > 0 ? (
          presentToday.map((p, i) => {
            const prev = i > 0 ? presentToday[i - 1] : null;
            const showDivider = Boolean(prev && prev.roleRank !== p.roleRank);

            return (
              <Fragment key={`${p.employeeId}-${i}`}>
                {showDivider ? <Separator className="w-full my-1" /> : null}
                <Badge
                  variant="secondary"
                  className={`inline-flex items-center rounded-md border px-3 py-1 text-[11px] sm:text-xs font-medium leading-none ${
                    p.isDuty
                      ? "bg-rose-100 text-rose-700 border-rose-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                  data-testid={`staff-present-${i}`}
                >
                  {p.name}
                  {p.workplace ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({p.workplace})
                    </span>
                  ) : null}
                </Badge>
              </Fragment>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">
            Keine Daten verfuegbar.
          </p>
        )}
      </div>

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
        <div className="flex flex-wrap gap-2">
          {presentTomorrow.length > 0 ? (
            presentTomorrow.map((p, i) => {
              const prev = i > 0 ? presentTomorrow[i - 1] : null;
              const showDivider = Boolean(prev && prev.roleRank !== p.roleRank);

              return (
                <Fragment key={`${p.employeeId}-${i}`}>
                  {showDivider ? <Separator className="w-full my-1" /> : null}
                  <Badge
                    variant="secondary"
                    className={`inline-flex items-center rounded-md border px-3 py-1 text-[11px] sm:text-xs font-medium leading-none ${
                      p.isDuty
                        ? "bg-rose-100 text-rose-700 border-rose-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                    data-testid={`staff-tomorrow-${i}`}
                  >
                    {p.name}
                    {p.workplace ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({p.workplace})
                      </span>
                    ) : null}
                  </Badge>
                </Fragment>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              Keine Daten verfuegbar.
            </p>
          )}
        </div>
      </div>
    </div>
  );

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

  const renderMiscWidgets = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

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
    </>
  );

  const renderBirthdayCard = () =>
    birthdayName ? (
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
  return (
    <Layout title="Dashboard">
      <div className="hidden md:grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 space-y-6">
          {renderHeroCard()}
          <Card className="border-none kabeg-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Heute anwesend
              </CardTitle>
              <CardDescription>
                Team mit Funktion im Wochenplan (Arbeitsplatz in Klammer)
              </CardDescription>
            </CardHeader>
            {renderAttendanceCardContent()}
          </Card>
          {renderMiscWidgets()}
        </div>
        <div className="md:col-span-4 space-y-6">
          {renderBirthdayCard()}
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
        </div>
      </div>

      <div className="md:hidden space-y-6">
        {renderHeroCard()}
        <Card
          className="border-none kabeg-shadow"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <CardContent className="pb-2">
            <div className="flex gap-2">
              <Button
                variant={mobilePanel === "week" ? "secondary" : "ghost"}
                size="sm"
                className="px-3 py-1 text-xs"
                onClick={() => setMobilePanel("week")}
                aria-pressed={mobilePanel === "week"}
              >
                Woche
              </Button>
              <Button
                variant={mobilePanel === "team" ? "secondary" : "ghost"}
                size="sm"
                className="px-3 py-1 text-xs"
                onClick={() => setMobilePanel("team")}
                aria-pressed={mobilePanel === "team"}
              >
                Heute/Morgen
              </Button>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            {mobilePanel === "week"
              ? renderWeekPreviewCardContent()
              : renderAttendanceCardContent()}
          </CardContent>
        </Card>
        {renderBirthdayCard()}
        {renderMiscWidgets()}
      </div>
    </Layout>
  );
}
