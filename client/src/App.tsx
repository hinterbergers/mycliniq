import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Dashboard from "@/pages/Dashboard";
import Personal from "@/pages/Personal";
import Guidelines from "@/pages/Guidelines";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import ShiftWishes from "@/pages/ShiftWishes";
import PlanningCockpit from "@/pages/admin/PlanningCockpit";
import EmployeeManagement from "@/pages/admin/EmployeeManagement";
import ResourceManagement from "@/pages/admin/ResourceManagement";
import VacationPlanEditor from "@/pages/admin/VacationPlanEditor";
import RosterPlan from "@/pages/admin/RosterPlan";
import WeeklyPlan from "@/pages/admin/WeeklyPlan";
import AdminProjects from "@/pages/admin/Projects";
import ProjectDetail from "@/pages/admin/ProjectDetail";
import ClinicSettings from "@/pages/admin/ClinicSettings";
import WidgetManagement from "@/pages/admin/WidgetManagement";
import Tools from "@/pages/Tools";
import Messages from "@/pages/Messages";
import NotFound from "@/pages/not-found";
import Tasks from "@/pages/Tasks";
import PersonCard from "@/pages/PersonCard";
import TrainingVideos from "@/pages/training/TrainingVideos";
import TrainingPresentations from "@/pages/training/TrainingPresentations";
import PublicWeeklyPlan from "@/pages/PublicWeeklyPlan";
import PublicRosterPlan from "@/pages/PublicRosterPlan";
import { Loader2 } from "lucide-react";
import { TrainingRoute } from "@/components/training/TrainingRoute";
import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#0F5BA7]" />
          <p className="text-muted-foreground">Lade...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const routeFromUrl = (urlString: string | undefined | null) => {
      if (!urlString) return null;

      try {
        const url = new URL(urlString);

        if (url.protocol === "mycliniq:") {
          const host = url.host ? `/${url.host}` : "";
          const path = url.pathname === "/" ? "" : url.pathname;
          return `${host}${path}${url.search}${url.hash}` || "/";
        }

        if (
          (url.protocol === "https:" || url.protocol === "http:") &&
          url.hostname === "mycliniq.info"
        ) {
          return `${url.pathname}${url.search}${url.hash}` || "/";
        }
      } catch {
        return null;
      }

      return null;
    };

    let removed = false;

    const handleUrl = (urlString: string | undefined | null) => {
      if (removed) return;
      const route = routeFromUrl(urlString);
      if (route) {
        setLocation(route);
      }
    };

    void CapacitorApp.getLaunchUrl().then((launch) => {
      handleUrl(launch?.url);
    });

    const listenerPromise = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      handleUrl(url);
    });

    return () => {
      removed = true;
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [setLocation]);

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/wochenplan-public" component={PublicWeeklyPlan} />
      <Route path="/dienstplan-public" component={PublicRosterPlan} />

      <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>

      {/* Main Navigation */}
      <Route path="/dienstplaene">
        {() => <ProtectedRoute component={Personal} />}
      </Route>
      <Route path="/wissen">
        {() => <ProtectedRoute component={Guidelines} />}
      </Route>
      <Route path="/aufgaben">
        {() => <ProtectedRoute component={Tasks} />}
      </Route>
      <Route path="/projekte">
        <Redirect to="/aufgaben" />
      </Route>
      <Route path="/tools">{() => <ProtectedRoute component={Tools} />}</Route>
      <Route path="/nachrichten">
        {() => <ProtectedRoute component={Messages} />}
      </Route>
      <Route path="/kontakte/:id">
        {() => <ProtectedRoute component={PersonCard} />}
      </Route>
      <Route path="/fortbildung/videos">
        {() => <TrainingRoute component={TrainingVideos} />}
      </Route>
      <Route path="/fortbildung/presentations">
        {() => (
          <TrainingRoute component={TrainingPresentations} />
        )}
      </Route>
      <Route path="/projekte/:id">
        {(params) => <Redirect to={`/admin/projects/${params.id}`} />}
      </Route>
      <Route path="/einstellungen">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route path="/einstellungen/:userId">
        {() => <ProtectedRoute component={Settings} />}
      </Route>

      {/* Shift Wishes */}
      <Route path="/dienstwuensche">
        {() => <ProtectedRoute component={ShiftWishes} />}
      </Route>

      {/* Legacy routes redirect */}
      <Route path="/personal">
        {() => <ProtectedRoute component={Personal} />}
      </Route>

      {/* Admin / Verwaltung Routes */}
      <Route path="/admin">
        {() => <ProtectedRoute component={PlanningCockpit} />}
      </Route>
      <Route path="/admin/employees">
        {() => <ProtectedRoute component={EmployeeManagement} />}
      </Route>
      <Route path="/admin/resources">
        {() => <ProtectedRoute component={ResourceManagement} />}
      </Route>
      <Route path="/admin/urlaubsplan">
        {() => <ProtectedRoute component={VacationPlanEditor} />}
      </Route>
      <Route path="/admin/roster">
        {() => <ProtectedRoute component={RosterPlan} />}
      </Route>
      <Route path="/admin/weekly">
        {() => <ProtectedRoute component={WeeklyPlan} />}
      </Route>
      <Route path="/admin/projects">
        {() => <ProtectedRoute component={AdminProjects} />}
      </Route>
      <Route path="/admin/projects/:id">
        {() => <ProtectedRoute component={ProjectDetail} />}
      </Route>
      <Route path="/admin/clinic">
        {() => <ProtectedRoute component={ClinicSettings} />}
      </Route>
      <Route path="/admin/widgets">
        {() => <ProtectedRoute component={WidgetManagement} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
