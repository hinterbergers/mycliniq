import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import Personal from "@/pages/Personal";
import Guidelines from "@/pages/Guidelines";
import PlanningCockpit from "@/pages/admin/PlanningCockpit";
import EmployeeManagement from "@/pages/admin/EmployeeManagement";
import ResourceManagement from "@/pages/admin/ResourceManagement";
import DailyPlanEditor from "@/pages/admin/DailyPlanEditor";
import RosterPlan from "@/pages/admin/RosterPlan";
import WeeklyPlan from "@/pages/admin/WeeklyPlan";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/personal" component={Personal} />
      <Route path="/wissen" component={Guidelines} />
      
      {/* Admin / Secretary Routes */}
      <Route path="/admin" component={PlanningCockpit} />
      <Route path="/admin/employees" component={EmployeeManagement} />
      <Route path="/admin/resources" component={ResourceManagement} />
      <Route path="/admin/daily-plan" component={DailyPlanEditor} />
      <Route path="/admin/roster" component={RosterPlan} />
      <Route path="/admin/weekly" component={WeeklyPlan} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
