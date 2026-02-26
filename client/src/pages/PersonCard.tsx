import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { searchApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Loader2, Mail, Phone, UserRound } from "lucide-react";

const toMailto = (value?: string | null) => {
  const v = (value ?? "").trim();
  return v ? `mailto:${v}` : null;
};

const toTel = (value?: string | null) => {
  const v = (value ?? "").trim();
  if (!v) return null;
  const normalized = v.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
};

export default function PersonCard() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);

  const profileQuery = useQuery({
    queryKey: ["search", "person-profile", employeeId],
    queryFn: () => searchApi.personProfile(employeeId),
    enabled: Number.isFinite(employeeId),
  });

  const previewQuery = useQuery({
    queryKey: ["search", "person-preview", employeeId, 14],
    queryFn: () => searchApi.personPreview(employeeId, { days: 14 }),
    enabled: Number.isFinite(employeeId),
  });

  const person = profileQuery.data?.person ?? null;
  const preview = previewQuery.data;
  const loading = profileQuery.isLoading || previewQuery.isLoading;
  const hasError = profileQuery.isError || previewQuery.isError;

  const dutiesByDate = new Map<string, string[]>();
  (preview?.duties ?? []).forEach((duty) => {
    const list = dutiesByDate.get(duty.date) ?? [];
    list.push(duty.serviceType);
    dutiesByDate.set(duty.date, list);
  });

  const workplacesByDate = new Map<string, string[]>();
  (preview?.workplaces ?? []).forEach((entry) => {
    const list = workplacesByDate.get(entry.date) ?? [];
    if (!list.includes(entry.workplace)) list.push(entry.workplace);
    workplacesByDate.set(entry.date, list);
  });

  const overviewDays = preview?.days ?? [];

  return (
    <Layout title="Visitenkarte">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && (hasError || !person) && (
          <Card>
            <CardContent className="py-8">
              <p className="text-sm text-muted-foreground">
                Die Visitenkarte konnte nicht geladen werden.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && person && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <UserRound className="h-5 w-5 text-primary" />
                      <span>{person.displayName}</span>
                    </CardTitle>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {[person.title, person.role].filter(Boolean).join(" • ") ||
                        "Mitarbeiter:in"}
                    </p>
                  </div>
                  <Badge variant="outline">Nur Leseansicht</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      icon: Phone,
                      label: person.contacts.phoneWork,
                      href: toTel(person.contacts.phoneWork),
                    },
                    {
                      icon: Phone,
                      label: person.contacts.phonePrivate,
                      href: toTel(person.contacts.phonePrivate),
                    },
                    {
                      icon: Mail,
                      label: person.contacts.email,
                      href: toMailto(person.contacts.email),
                    },
                    {
                      icon: Mail,
                      label: person.contacts.emailPrivate,
                      href: toMailto(person.contacts.emailPrivate),
                    },
                  ]
                    .filter((item) => item.label && item.href)
                    .map((item) => (
                      <Button key={item.href} asChild variant="outline" size="sm">
                        <a href={item.href!}>
                          <item.icon className="mr-2 h-3.5 w-3.5" />
                          <span>{item.label}</span>
                        </a>
                      </Button>
                    ))}
                </div>
                {![
                  person.contacts.phoneWork,
                  person.contacts.phonePrivate,
                  person.contacts.email,
                  person.contacts.emailPrivate,
                ].some(Boolean) && (
                  <p className="text-sm text-muted-foreground">
                    Keine freigegebenen Kontaktdaten vorhanden.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Private Kontaktdaten werden nur angezeigt, wenn sie freigegeben sind.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Uebersicht naechste 2 Wochen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(preview?.absences?.length ?? 0) > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">Abwesenheiten</p>
                    <div className="space-y-2">
                      {preview!.absences.map((absence) => (
                        <div
                          key={absence.id}
                          className="rounded-md border px-3 py-2 text-sm"
                        >
                          <span className="font-medium">
                            {absence.startDate}
                            {absence.endDate !== absence.startDate
                              ? ` bis ${absence.endDate}`
                              : ""}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            • {absence.reason} • {absence.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1 text-sm font-medium">Abwesenheiten</p>
                    <p className="text-sm text-muted-foreground">
                      {preview?.visibility?.absences === false
                        ? "Keine Berechtigung zur Anzeige."
                        : "Keine eingetragenen Abwesenheiten."}
                    </p>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="mb-2 text-sm font-medium">Tagesuebersicht</p>
                  <div className="space-y-2">
                    {overviewDays.map((day) => {
                      const duties = dutiesByDate.get(day) ?? [];
                      const workplaces = workplacesByDate.get(day) ?? [];
                      return (
                        <div
                          key={day}
                          className="rounded-md border px-3 py-2 text-sm"
                        >
                          <div className="font-medium">{day}</div>
                          <div className="text-muted-foreground">
                            Dienste: {duties.length ? duties.join(", ") : "Keine"}
                          </div>
                          <div className="text-muted-foreground">
                            Arbeitsplaetze:{" "}
                            {workplaces.length ? workplaces.join(", ") : "Keine"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
