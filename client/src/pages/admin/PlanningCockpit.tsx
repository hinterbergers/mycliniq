import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, CalendarClock, Settings2, ShieldAlert, UserCog, CalendarRange, Briefcase } from "lucide-react";
import { useLocation } from "wouter";

export default function PlanningCockpit() {
  const [, setLocation] = useLocation();

  const modules = [
    {
      title: "Mitarbeiter & Kompetenzen",
      description: "Stammdaten, Qualifikationen und Rollen verwalten",
      icon: Users,
      action: () => setLocation("/admin/employees"),
      color: "text-blue-600",
      bg: "bg-blue-50"
    },
    {
      title: "Ressourcen & Räume",
      description: "Ambulanzen sperren/öffnen, Raumverfügbarkeit",
      icon: Building2,
      action: () => setLocation("/admin/resources"),
      color: "text-emerald-600",
      bg: "bg-emerald-50"
    },
    {
      title: "Dienstplan Editor",
      description: "Monatsplanung, Urlaubsübersicht und Statistik",
      icon: CalendarClock,
      action: () => setLocation("/admin/roster"),
      color: "text-primary",
      bg: "bg-primary/10"
    },
    {
      title: "Einsatzplanung",
      description: "Wöchentliche Zuteilung nach Bereichen (Stationen, Ambulanzen, OP)",
      icon: CalendarRange,
      action: () => setLocation("/admin/weekly"),
      color: "text-primary",
      bg: "bg-primary/10"
    },
    {
      title: "Tageseinsatzplan",
      description: "Manuelle Zuteilung und Korrektur des Tagesplans",
      icon: CalendarClock,
      action: () => setLocation("/admin/daily-plan"),
      color: "text-purple-600",
      bg: "bg-purple-50"
    },
    {
      title: "Projektmanagement",
      description: "SOPs, Leitlinien und Dokumente erstellen, delegieren und freigeben",
      icon: Briefcase,
      action: () => setLocation("/admin/projects"),
      color: "text-amber-600",
      bg: "bg-amber-50"
    },
    {
      title: "Berechtigungen",
      description: "Zugriffsrechte für Primar, OA, AA, etc.",
      icon: ShieldAlert,
      action: () => {},
      color: "text-orange-600",
      bg: "bg-orange-50",
      disabled: true
    }
  ];

  return (
    <Layout title="Planungs-Cockpit (Sekretariat)">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Verwaltungsebene</h2>
          <p className="text-muted-foreground">
            Zentrale Steuerung für Stammdaten, Ressourcen und Dienstplanung.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((module, i) => (
            <Card 
              key={i} 
              className={`border-none kabeg-shadow hover:shadow-md transition-all cursor-pointer group ${module.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={!module.disabled ? module.action : undefined}
            >
              <CardContent className="p-6 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${module.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                  <module.icon className={`w-6 h-6 ${module.color}`} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                    {module.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {module.description}
                  </p>
                  {module.disabled && (
                    <Badge variant="outline" className="mt-2 text-xs">Demnächst</Badge>
                  )}
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
              <Button variant="outline" className="bg-background border-dashed border-border">
                + Krankmeldung erfassen
              </Button>
              <Button variant="outline" className="bg-background border-dashed border-border">
                + Raum kurzfristig sperren
              </Button>
              <Button variant="outline" className="bg-background border-dashed border-border">
                + Student neu anlegen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
