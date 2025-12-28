import { Switch, Route, Redirect } from "wouter";
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
import DailyPlanEditor from "@/pages/admin/DailyPlanEditor";
import RosterPlan from "@/pages/admin/RosterPlan";
import WeeklyPlan from "@/pages/admin/WeeklyPlan";
import Projects from "@/pages/admin/Projects";
import ProjectDetail from "@/pages/admin/ProjectDetail";
import ClinicSettings from "@/pages/admin/ClinicSettings";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
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
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      
      {/* Main Navigation */}
      <Route path="/dienstplaene">
        {() => <ProtectedRoute component={Personal} />}
      </Route>
      <Route path="/wissen">
        {() => <ProtectedRoute component={Guidelines} />}
      </Route>
      <Route path="/projekte">
        {() => <ProtectedRoute component={Projects} />}
      </Route>
      <Route path="/projekte/:id">
        {() => <ProtectedRoute component={ProjectDetail} />}
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

            {/* Verwaltung aliases (compat) */}
            <Route path="/verwaltung">
        {() => <Redirect to="/admin" />}
      </Route>

      <Route path="/verwaltung/employees">
        {() => <Redirect to="/admin/employees" />}
      </Route>

      <Route path="/verwaltung/resources">
        {() => <Redirect to="/admin/resources" />}
      </Route>

      <Route path="/verwaltung/daily-plan">
        {() => <Redirect to="/admin/daily-plan" />}
      </Route>

      <Route path="/verwaltung/roster">
        {() => <Redirect to="/admin/roster" />}
      </Route>

      <Route path="/verwaltung/weekly">
        {() => <Redirect to="/admin/weekly" />}
      </Route>

      <Route path="/verwaltung/projects">
        {() => <Redirect to="/admin/projects" />}
      </Route>

      <Route path="/verwaltung/projects/:id">
        {() => <Redirect to="/admin/projects/:id" />}
      </Route>

      <Route path="/verwaltung/clinic">
        {() => <Redirect to="/admin/clinic" />}
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
      <Route path="/admin/daily-plan">
        {() => <ProtectedRoute component={DailyPlanEditor} />}
      </Route>
      <Route path="/admin/roster">
        {() => <ProtectedRoute component={RosterPlan} />}
      </Route>
      <Route path="/admin/weekly">
        {() => <ProtectedRoute component={WeeklyPlan} />}
      </Route>
      <Route path="/admin/projects">
        {() => <ProtectedRoute component={Projects} />}
      </Route>
      <Route path="/admin/projects/:id">
        {() => <ProtectedRoute component={ProjectDetail} />}
      </Route>
      <Route path="/admin/clinic">
        {() => <ProtectedRoute component={ClinicSettings} />}
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
