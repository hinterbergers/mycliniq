import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  CalendarClock,
  UserCog,
  CalendarRange,
  Briefcase,
  Building,
  CalendarDays,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

export default function PlanningCockpit() {
  const [, setLocation] = useLocation();
  const { canAny, isSuperuser } = useAuth();

  const modules = [
    {
      title: "Dienstplan-Editor",
      description: "Monatsdienstplan generieren, prüfen und freigeben.",
      icon: CalendarClock,
      action: () => setLocation("/admin/roster"),
      color: "text-primary",
      bg: "bg-primary/10",
      requiredAnyCaps: ["dutyplan.edit", "dutyplan.publish"],
    },
    {
      title: "Wochenplan-Editor",
      description: "Wocheneinsatzpläne pro Bereich erstellen und anpassen.",
      icon: CalendarRange,
      action: () => setLocation("/admin/weekly"),
      color: "text-primary",
      bg: "bg-primary/10",
      requiredAnyCaps: ["weeklyplan.edit", "dutyplan.edit"],
    },
    {
      title: "Urlaubsplan-Editor",
      description: "Urlaube, Fortbildungen und Abwesenheiten verwalten.",
      icon: CalendarDays,
      action: () => setLocation("/admin/urlaubsplan"),
      color: "text-amber-600",
      bg: "bg-amber-50",
      requiredAnyCaps: [
        "vacation.approve",
        "vacation.lock",
        "absence.create",
      ],
    },
    {
      title: "Mitarbeiter & Kompetenzen",
      description: "Stammdaten, Qualifikationen und Rollen verwalten.",
      icon: Users,
      action: () => setLocation("/admin/employees"),
      color: "text-blue-600",
      bg: "bg-blue-50",
      requiredAnyCaps: ["users.manage"],
    },
    {
      title: "Arbeitsplätze & Räume",
      description: "Arbeitsplätze konfigurieren und physische Räume zuordnen.",
      icon: Building2,
      action: () => setLocation("/admin/resources"),
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      requiredAnyCaps: ["resources.manage"],
    },
    {
      title: "SOPs und Projekte verwalten",
      description: "SOPs, Projekte und Freigaben zentral steuern.",
      icon: Briefcase,
      action: () => setLocation("/admin/projects"),
      color: "text-amber-600",
      bg: "bg-amber-50",
      requiredAnyCaps: [
        "sop.manage",
        "sop.publish",
        "project.manage",
        "project.delete",
      ],
    },
    {
      title: "Abteilungs-Einstellungen",
      description: "Abteilungs-Informationen, Zeitzone und Logo verwalten.",
      icon: Building,
      action: () => setLocation("/admin/clinic"),
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      requiredAnyCaps: ["departments.manage"],
    },
    {
      title: "Widgets bearbeiten",
      description: "Dashboard-Widgets pro Benutzer ein-/ausblenden.",
      icon: Building2,
      action: () => setLocation("/admin/widgets"),
      color: "text-cyan-600",
      bg: "bg-cyan-50",
      requiredAnyCaps: ["widgets.manage"],
    },
  ];

  const visibleModules = isSuperuser
    ? modules
    : modules.filter((module) =>
        (module.requiredAnyCaps ?? []).length === 0
          ? true
          : canAny(module.requiredAnyCaps),
      );

  const canCreateAbsence = isSuperuser || canAny(["absence.create"]);
  const canManageResources = isSuperuser || canAny(["resources.manage"]);
  const canManageUsers = isSuperuser || canAny(["users.manage"]);

  return (
    <Layout title="Planungs-Cockpit (Sekretariat)">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Verwaltungsebene
          </h2>
          <p className="text-muted-foreground">
            Zentrale Steuerung für Stammdaten, Arbeitsplätze und Dienstplanung.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleModules.length === 0 && (
            <Card
              className="md:col-span-2 border-dashed bg-secondary/20"
              data-testid="card-module-empty"
            >
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg">Keine Verwaltungsrechte</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Du hast aktuell keine Verwaltungsrechte. Bitte wende dich an die Administration.
                </p>
              </CardContent>
            </Card>
          )}
          {visibleModules.map((module) => (
            <Card
              key={module.title}
              className="border-none kabeg-shadow hover:shadow-md transition-all cursor-pointer group"
              onClick={module.action}
              data-testid={`card-module-${module.title}`}
            >
              <CardContent className="p-6 flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl ${module.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}
                >
                  <module.icon className={`w-6 h-6 ${module.color}`} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                    {module.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {module.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-none shadow-sm bg-secondary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Schnellzugriff: Status-Änderungen
            </CardTitle>
            <CardDescription>
              Aktuelle Meldungen und kurzfristige Ausfälle bearbeiten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {canCreateAbsence && (
                <Button
                  variant="outline"
                  className="bg-background border-dashed border-border"
                  onClick={() => console.log("Krankmeldung erfassen clicked")}
                  data-testid="button-sick-report"
                >
                  + Krankmeldung erfassen
                </Button>
              )}
              {canManageResources && (
                <Button
                  variant="outline"
                  className="bg-background border-dashed border-border"
                  onClick={() =>
                    console.log("Arbeitsplatz kurzfristig sperren clicked")
                  }
                  data-testid="button-lock-room"
                >
                  + Arbeitsplatz kurzfristig sperren
                </Button>
              )}
              {canManageUsers && (
                <Button
                  variant="outline"
                  className="bg-background border-dashed border-border"
                  onClick={() => console.log("User neu anlegen clicked")}
                  data-testid="button-new-user"
                >
                  + User neu anlegen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
