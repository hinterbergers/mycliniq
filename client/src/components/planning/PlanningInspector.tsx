import { useEffect, useMemo, useState } from "react";
import type { Employee } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { planningRestApi } from "@/lib/api";
import type { PlanningLock } from "@/lib/planningApi";
import type { ServiceType } from "@shared/shiftTypes";

export type SlotInspectorInfo = {
  slotId: string;
  date: string;
  roleId: ServiceType;
  employeeId: number | null;
  employeeName?: string | null;
};

type PlanningInspectorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  slot: SlotInspectorInfo | null;
  employees: Employee[];
  locks: PlanningLock[];
  onRefresh?: () => void;
};

export function PlanningInspector({
  open,
  onOpenChange,
  year,
  month,
  slot,
  employees,
  locks,
  onRefresh,
}: PlanningInspectorProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | "free">("free");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLock = useMemo(() => {
    if (!slot) return null;
    return locks.find((lock) => lock.slotId === slot.slotId) ?? null;
  }, [locks, slot]);

  useEffect(() => {
    if (slot) {
      if (currentLock) {
        setSelectedEmployeeId(
          currentLock.employeeId !== null ? String(currentLock.employeeId) : "free",
        );
      } else if (slot.employeeId !== null) {
        setSelectedEmployeeId(String(slot.employeeId));
      } else {
        setSelectedEmployeeId("free");
      }
    } else {
      setSelectedEmployeeId("free");
    }
  }, [slot, currentLock]);

  const positionEmployees = useMemo(
    () =>
      employees
        .filter((emp) => emp.isActive !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [employees],
  );

  const handleSave = async () => {
    if (!slot) return;
    setSaving(true);
    setError(null);
    try {
      const targetId =
        selectedEmployeeId === "free" ? null : Number(selectedEmployeeId);
      await planningRestApi.upsertLock(year, month, slot.slotId, targetId);
      onRefresh?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!slot) return;
    setSaving(true);
    setError(null);
    try {
      await planningRestApi.deleteLock(year, month, slot.slotId);
      onRefresh?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Slot-Inspector</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>ID: {slot?.slotId ?? "—"}</p>
          <p>Datum: {slot?.date ?? "—"}</p>
          <p>Rolle: {slot?.roleId ?? "—"}</p>
          <p>
            Aktuell:{" "}
            {slot?.employeeName
              ? slot.employeeName
              : slot?.employeeId
              ? `Mitarbeiter ${slot.employeeId}`
              : "offen"}
          </p>
        </div>
        <Separator className="my-2" />
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Sperre auf</label>
          <Select
            value={selectedEmployeeId}
            onValueChange={(value) => setSelectedEmployeeId(value as string)}
          >
            <SelectTrigger>
              <SelectValue>
                {selectedEmployeeId === "free"
                  ? "Slot frei"
                  : positionEmployees.find(
                      (emp) => String(emp.id) === selectedEmployeeId,
                    )?.name ?? "Unbekannt"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Slot frei lassen</SelectItem>
              {positionEmployees.map((emp) => (
                <SelectItem key={emp.id} value={String(emp.id)}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter className="justify-between">
          <Button
            variant="outline"
            onClick={handleUnlock}
            disabled={saving || !currentLock}
          >
            Unlock
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichert..." : "Lock speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
