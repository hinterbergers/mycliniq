import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import type { ComponentType } from "react";
import { useAuth } from "@/lib/auth";

type TrainingRouteProps = {
  component: ComponentType;
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Lade Fortbildungen…</p>
      </div>
    </div>
  );
}

export function TrainingRoute({ component: Component }: TrainingRouteProps) {
  const { isAuthenticated, isLoading, canViewTraining } = useAuth();

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!canViewTraining) {
    return <Redirect to="/dienstplaene" />;
  }

  return <Component />;
}
