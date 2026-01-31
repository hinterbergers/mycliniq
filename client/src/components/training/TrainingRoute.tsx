import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import type { ComponentType } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    return (
      <Layout title="Fortbildung">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Keine Berechtigung</CardTitle>
            <CardDescription>
              Ihr Account ist nicht für die Fortbildungsinhalte freigeschaltet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Wenden Sie sich an Ihren Administrator, wenn Sie Zugriff benötigen.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return <Component />;
}
