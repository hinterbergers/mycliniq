import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CalendarDays, FileText, ArrowRight, Star, Cake, 
  Users, Clock, BookOpen, TrendingUp
} from "lucide-react";
import { dashboardApi, type DashboardResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { getAustrianHoliday } from "@/lib/holidays";

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
  { id: 1, title: "PPROM Management", category: "Geburtshilfe", date: "Vor 2 Tagen", isNew: true },
  { id: 2, title: "Präeklampsie Leitlinie", category: "Geburtshilfe", date: "Vor 4 Tagen", isNew: true },
  { id: 3, title: "Sectio-Indikationen", category: "OP", date: "Vor 1 Woche", isNew: true },
];

const DUMMY_POPULAR_SOPS = [
  { id: 4, title: "CTG-Beurteilung", category: "Geburtshilfe", views: 128 },
  { id: 5, title: "Postpartale Hämorrhagie", category: "Notfall", views: 96 },
  { id: 6, title: "Endometriose Diagnostik", category: "Gynäkologie", views: 84 },
];

const DUMMY_PRESENT_STAFF = [
  { name: "Dr. Hinterberger", area: "Kreißsaal" },
  { name: "Dr. Wagner", area: "Gyn-Ambulanz" },
  { name: "Dr. Brunner", area: "Station" },
  { name: "Dr. Fischer", area: "OP 1" },
  { name: "Hofer (TA)", area: "Kreißsaal" },
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
const ABSENCE_KEYWORDS = ["urlaub", "fortbildung", "zeitausgleich", "pflegeurlaub", "krankenstand"];
const SICK_KEYWORDS = ["krankenstand", "pflegeurlaub"];

export default function Dashboard() {
  const { employee, user, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  
  const firstName = employee?.firstName
    || user?.name
    || employee?.name?.split(' ')[0]
    || "Kolleg:in";
  const greeting = getGreeting();

  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDashboard(true);
    setDashboardError(null);

    dashboardApi.get()
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
  }, []);

  const todayEntry = dashboardData?.today;
  const todayTeamNames = (todayEntry?.teammates ?? [])
    .map((mate) => buildFullName(mate.firstName, mate.lastName))
    .filter(Boolean);
  const holidayToday = getAustrianHoliday(new Date());
  const statusLabel = todayEntry?.statusLabel ?? "";
  const normalizedStatus = statusLabel.toLowerCase();
  const hasEntry = Boolean(statusLabel || todayEntry?.workplace);
  const isAbsenceLabel = ABSENCE_KEYWORDS.some((keyword) => normalizedStatus.includes(keyword));
  const isSickLabel = SICK_KEYWORDS.some((keyword) => normalizedStatus.includes(keyword));

  let heroIcon = "🗓️";
  let heroText = "Heute kein Eintrag";
  if (!hasEntry || holidayToday) {
    heroIcon = "🏝️";
    heroText = holidayToday?.name ?? "Heute kein Eintrag";
  } else if (isSickLabel) {
    heroIcon = "🤒";
    heroText = statusLabel || "Krankenstand";
  } else if (isAbsenceLabel) {
    heroIcon = "🏝️";
    heroText = statusLabel || "Abwesenheit";
  } else {
    heroIcon = "🗓️";
    heroText = statusLabel
      ? `${statusLabel}${todayEntry?.workplace ? ` · ${todayEntry.workplace}` : ""}`
      : todayEntry?.workplace || "Heute kein Eintrag";
  }

  const heroMessage = dashboardError
    ? dashboardError.startsWith("Fehler")
      ? dashboardError
      : `Fehler: ${dashboardError}`
    : isLoadingDashboard
      ? "Dienst wird geladen…"
      : heroText;
  const heroEmoji = dashboardError ? "⚠️" : heroIcon;
  const showTeammates =
    !dashboardError &&
    !isLoadingDashboard &&
    heroIcon === "🗓️" &&
    todayTeamNames.length > 0;

  const birthdayEntry = dashboardData?.birthday;
  const birthdayName = birthdayEntry ? buildFullName(birthdayEntry.firstName, birthdayEntry.lastName) : null;

  const previewCards = useMemo<PreviewCard[]>(() => {
    if (!dashboardData?.weekPreview) return [];
    return dashboardData.weekPreview
      .map((entry): PreviewCard | null => {
        const iso = `${entry.date}T00:00:00`;
        const dateInstance = new Date(iso);
        if (Number.isNaN(dateInstance.getTime())) {
          return null;
        }
        if (isWeekendDate(dateInstance) && !entry.statusLabel) {
          return null;
        }
        return {
          date: entry.date,
          statusLabel: entry.statusLabel,
          workplace: entry.workplace,
          teammateNames: entry.teammates
            .map((mate) => buildFullName(mate.firstName, mate.lastName))
            .filter(Boolean),
          dayLabel: format(dateInstance, "EEEE", { locale: de }),
          dateLabel: format(dateInstance, "dd. MMM", { locale: de })
        };
      })
      .filter((card): card is PreviewCard => card !== null);
  }, [dashboardData?.weekPreview]);

  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        <div className="md:col-span-8 space-y-6">
          <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 text-primary-foreground shadow-lg shadow-primary/10">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-3xl font-bold text-white" data-testid="text-greeting">
                {greeting} {firstName}
              </h2>
              <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30 bg-primary-foreground/10">
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
                onClick={() => setLocation('/dienstplaene')}
                data-testid="button-to-roster"
              >
                Zum Dienstplan
              </Button>
              <Button 
                variant="outline" 
                className="bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                onClick={() => setLocation('/dienstwuensche')}
                data-testid="button-request-vacation"
              >
                Dienstwünsche
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-none kabeg-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Neue SOPs</p>
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
                  <p className="text-sm text-muted-foreground font-medium">Meine Favoriten</p>
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
                onClick={() => setLocation('/wissen')}
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
                            <h4 className="font-medium text-foreground text-sm">{sop.title}</h4>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{sop.category}</Badge>
                              <span className="text-[10px] text-muted-foreground">{sop.date}</span>
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
                            <h4 className="font-medium text-foreground text-sm">{sop.title}</h4>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{sop.category}</Badge>
                              <span className="text-[10px] text-muted-foreground">{sop.views} Aufrufe</span>
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

          {isAdmin && (
            <Card className="border-none kabeg-shadow border-l-4 border-l-amber-400">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-600" />
                  Heute anwesend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  {DUMMY_PRESENT_STAFF.map((staff, i) => (
                    <Badge key={i} variant="secondary" className="py-1.5" data-testid={`staff-present-${i}`}>
                      {staff.name} <span className="text-muted-foreground ml-1">({staff.area})</span>
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>3 Abwesenheiten heute</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="md:col-span-4 space-y-6">
          {birthdayName && (
            <Card className="border-none kabeg-shadow bg-gradient-to-br from-pink-50 to-orange-50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center">
                  <Cake className="w-6 h-6 text-pink-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Heute hat Geburtstag:</p>
                  <p className="text-base font-bold text-pink-700" data-testid="text-birthday">{birthdayName}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-none kabeg-shadow flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                Wochenvorschau
              </CardTitle>
              <CardDescription>Deine nächsten Einsätze</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-4">
                {isLoadingDashboard ? (
                  <p className="text-sm text-muted-foreground">Wochenvorschau wird geladen…</p>
                ) : dashboardError ? (
                  <p className="text-sm text-destructive">Fehler: {dashboardError}</p>
                ) : previewCards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Einsätze für die Vorschau verfügbar.</p>
                ) : (
                  previewCards.map((item, i) => (
                    <div 
                      key={`${item.date}-${i}`} 
                      className={`p-3 rounded-lg border ${
                        i === 0 ? "bg-primary/5 border-primary/20" : "border-border"
                      }`}
                      data-testid={`schedule-day-${i}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">
                          {item.dayLabel} <span className="text-muted-foreground">– {item.dateLabel}</span>
                        </span>
                        <Badge 
                          variant={item.statusLabel ? "default" : "secondary"}
                          className={!item.statusLabel ? "bg-muted text-muted-foreground" : ""}
                        >
                          {item.statusLabel || "Kein Dienst"}
                        </Badge>
                      </div>
                      {item.workplace && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Bereich: {item.workplace}
                        </p>
                      )}
                      {item.teammateNames.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Mit: {item.teammateNames.join(", ")}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-border">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setLocation('/dienstplaene')}
                >
                  Kompletten Dienstplan anzeigen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
