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

type EducationRouteMode = "general" | "catalog" | "trainer";

type EducationRouteProps = {
  component: ComponentType;
  mode?: EducationRouteMode;
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Lade Ausbildung…</p>
      </div>
    </div>
  );
}

export function EducationRoute({
  component: Component,
  mode = "general",
}: EducationRouteProps) {
  const {
    isAuthenticated,
    isLoading,
    canViewEducation,
    canManageEducationCatalog,
    canViewTrainerCockpit,
  } = useAuth();

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  const hasAccess =
    mode === "catalog"
      ? canManageEducationCatalog
      : mode === "trainer"
        ? canViewTrainerCockpit
        : canViewEducation;

  if (!hasAccess) {
    return (
      <Layout title="Ausbildung">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Keine Berechtigung</CardTitle>
            <CardDescription>
              Dieser Ausbildungsbereich ist fuer Ihren Account nicht freigeschaltet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Wenden Sie sich an die Administration, wenn Sie Zugriff benoetigen.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return <Component />;
}
