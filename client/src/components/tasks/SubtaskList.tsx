import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { TaskItem, TaskLifecycleStatus } from "@/lib/api";

const STATUS_BADGE_STYLES: Record<TaskLifecycleStatus, string> = {
  NOT_STARTED: "bg-slate-50 text-slate-900 border-slate-200",
  IN_PROGRESS: "bg-amber-50 text-amber-900 border-amber-200",
  SUBMITTED: "bg-blue-50 text-blue-900 border-blue-200",
  DONE: "bg-emerald-50 text-emerald-900 border-emerald-200",
};

const STATUS_LABELS: Record<TaskLifecycleStatus, string> = {
  NOT_STARTED: "Nicht begonnen",
  IN_PROGRESS: "In Arbeit",
  SUBMITTED: "Zur Freigabe eingereicht",
  DONE: "Abgeschlossen",
};

const TYPE_BADGE_STYLES: Record<"ONE_OFF" | "RESPONSIBILITY", string> = {
  ONE_OFF: "bg-slate-100 text-slate-700 border-slate-200",
  RESPONSIBILITY: "bg-violet-50 text-violet-900 border-violet-200",
};

const TYPE_LABELS: Record<"ONE_OFF" | "RESPONSIBILITY", string> = {
  ONE_OFF: "Einmalig",
  RESPONSIBILITY: "Verantwortung",
};

const formatAssignedName = (subtask: TaskItem) => {
  if (subtask.assignedTo) {
    const first = subtask.assignedTo.name ?? "";
    const last = subtask.assignedTo.lastName ?? "";
    const trimmed = `${first} ${last}`.trim();
    return trimmed || "Unassigned";
  }
  if (subtask.assignedToId) {
    return `ID ${subtask.assignedToId}`;
  }
  return "Unassigned";
};

type SubtaskListProps = {
  subtasks: TaskItem[];
  loading?: boolean;
  error?: string | null;
  assigneeOptions?: Array<{ value: string; label: string }>;
  onStatusChange?: (id: number, status: TaskLifecycleStatus) => void;
  onAssigneeChange?: (id: number, assignedToId: number | null) => void;
  onDueDateChange?: (id: number, dueDate: string | null) => void;
  updatingSubtaskId?: number | null;
};

export function SubtaskList({
  subtasks,
  loading,
  error,
  assigneeOptions,
  onStatusChange,
  onAssigneeChange,
  onDueDateChange,
  updatingSubtaskId,
}: SubtaskListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Unteraufgaben laden...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">{error}</p>
    );
  }

  if (subtasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Unteraufgaben vorhanden.
      </p>
    );
  }

  const hasControls =
    Boolean(onStatusChange) ||
    Boolean(onAssigneeChange) ||
    Boolean(onDueDateChange);

  return (
    <div className="space-y-3">
      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          className="rounded-lg border border-border bg-background p-3 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{subtask.title}</p>
            <div className="flex items-center gap-2">
              <Badge className={STATUS_BADGE_STYLES[subtask.status]}>
                {STATUS_LABELS[subtask.status]}
              </Badge>
              <Badge className={TYPE_BADGE_STYLES[subtask.type]}>
                {TYPE_LABELS[subtask.type]}
              </Badge>
            </div>
          </div>

          {hasControls ? (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {onStatusChange && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <Select
                    value={subtask.status}
                    onValueChange={(value) =>
                      onStatusChange(subtask.id, value as TaskLifecycleStatus)
                    }
                    disabled={updatingSubtaskId === subtask.id}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([status, label]) => (
                        <SelectItem key={status} value={status}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {onAssigneeChange && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Verantwortlich
                  </p>
                  <Select
                    value={
                      subtask.assignedToId
                        ? String(subtask.assignedToId)
                        : "unassigned"
                    }
                    onValueChange={(v) =>
                      onAssigneeChange(
                        subtask.id,
                        v === "unassigned" ? null : Number(v),
                      )
                    }
                    disabled={updatingSubtaskId === subtask.id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assigneeOptions?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {onDueDateChange && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Frist
                  </p>
                  <Input
                    type="date"
                    value={subtask.dueDate ?? ""}
                    onChange={(event) =>
                      onDueDateChange(
                        subtask.id,
                        event.target.value || null,
                      )
                    }
                    disabled={updatingSubtaskId === subtask.id}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{formatAssignedName(subtask)}</span>
              {subtask.dueDate && (
                <span>
                  Fällig: {new Date(subtask.dueDate).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
