import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";

import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { plannedAbsencesAdminApi, type PlannedAbsenceAdmin, type PlannedAbsenceMonthSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STATUS_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "Geplant", label: "Geplant" },
  { value: "Genehmigt", label: "Genehmigt" },
  { value: "Abgelehnt", label: "Abgelehnt" }
] as const;

const STATUS_STYLES: Record<string, string> = {
  Geplant: "bg-slate-50 text-slate-700 border-slate-200",
  Genehmigt: "bg-green-50 text-green-700 border-green-200",
  Abgelehnt: "bg-red-50 text-red-700 border-red-200"
};

export default function VacationPlanEditor() {
  const { employee } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
  const [summary, setSummary] = useState<PlannedAbsenceMonthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadAbsences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await plannedAbsencesAdminApi.getMonthSummary(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1
      );
      setSummary(data);
    } catch (error: any) {
      toast({
        title: "Urlaube konnten nicht geladen werden",
        description: error.message || "Bitte später erneut versuchen.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [currentDate, toast]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  const allAbsences = summary?.absences ?? [];

  const filteredAbsences = useMemo(() => {
    if (statusFilter === "all") return allAbsences;
    return allAbsences.filter((absence) => absence.status === statusFilter);
  }, [allAbsences, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: allAbsences.length,
      geplant: allAbsences.filter((a) => a.status === "Geplant").length,
      genehmigt: allAbsences.filter((a) => a.status === "Genehmigt").length,
      abgelehnt: allAbsences.filter((a) => a.status === "Abgelehnt").length
    };
  }, [allAbsences]);

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: de });

  const handleStatusUpdate = async (absence: PlannedAbsenceAdmin, status: "Geplant" | "Genehmigt" | "Abgelehnt") => {
    setUpdatingId(absence.id);
    try {
      const updated = await plannedAbsencesAdminApi.updateStatus(absence.id, status, employee?.id);
      setSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          absences: prev.absences.map((item) => (item.id === absence.id ? { ...item, ...updated } : item))
        };
      });
      toast({
        title: "Status aktualisiert",
        description: `Abwesenheit ist jetzt ${status}.`
      });
    } catch (error: any) {
      toast({
        title: "Status konnte nicht geändert werden",
        description: error.message || "Bitte später erneut versuchen.",
        variant: "destructive"
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Layout title="Urlaubsplan-Editor">
      <div className="space-y-6">
        <div className="bg-card p-4 rounded-xl kabeg-shadow space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="font-bold w-44 text-center text-lg">{monthLabel}</span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1">
                Gesamt: {counts.total}
              </Badge>
              <Badge variant="outline" className={STATUS_STYLES.Geplant}>
                Geplant: {counts.geplant}
              </Badge>
              <Badge variant="outline" className={STATUS_STYLES.Genehmigt}>
                Genehmigt: {counts.genehmigt}
              </Badge>
              <Badge variant="outline" className={STATUS_STYLES.Abgelehnt}>
                Abgelehnt: {counts.abgelehnt}
              </Badge>
            </div>
          </div>
        </div>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Urlaubs- und Fortbildungsantraege</CardTitle>
            <CardDescription>Uebersicht fuer {monthLabel} mit Statusverwaltung</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Eintraege werden geladen...
              </div>
            ) : filteredAbsences.length === 0 ? (
              <div className="text-muted-foreground text-center py-12">
                Keine Eintraege fuer diesen Zeitraum.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mitarbeiter</TableHead>
                      <TableHead>Zeitraum</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Anmerkung</TableHead>
                      <TableHead className="text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAbsences.map((absence) => {
                      const displayName = [absence.employeeLastName, absence.employeeName]
                        .filter(Boolean)
                        .join(" ");
                      const statusClass = STATUS_STYLES[absence.status] ?? STATUS_STYLES.Geplant;
                      return (
                        <TableRow key={absence.id}>
                          <TableCell className="font-medium">
                            {displayName || "Unbekannt"}
                            {absence.employeeRole ? (
                              <div className="text-xs text-muted-foreground">{absence.employeeRole}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {format(new Date(absence.startDate), "dd.MM.yyyy", { locale: de })} -{" "}
                            {format(new Date(absence.endDate), "dd.MM.yyyy", { locale: de })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{absence.reason}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusClass}>
                              {absence.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{absence.notes || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusUpdate(absence, "Geplant")}
                                disabled={updatingId === absence.id || absence.status === "Geplant"}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Geplant
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusUpdate(absence, "Genehmigt")}
                                disabled={updatingId === absence.id || absence.status === "Genehmigt"}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Genehmigen
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusUpdate(absence, "Abgelehnt")}
                                disabled={updatingId === absence.id || absence.status === "Abgelehnt"}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Ablehnen
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
