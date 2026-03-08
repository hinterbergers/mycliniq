import type { DashboardAttendanceWidget, DashboardDay } from "@/lib/api";
import { getApiBase } from "@/lib/apiBase";
import { Capacitor, registerPlugin } from "@capacitor/core";

export const WIDGET_TODAY_SNAPSHOT_KEY = "mycliniq_widget_today_v1";
export const WIDGET_SYNC_DEBUG_KEY = "mycliniq_widget_sync_debug_v1";

export type WidgetSyncDebugStatus = {
  at: string;
  stage: string;
  ok: boolean;
  detail: string;
};

export type WidgetNextDaySnapshot = {
  date: string;
  statusLabel: string | null;
  workplace: string | null;
  absenceReason: string | null;
  dutyLabel: string | null;
  isDuty: boolean;
  teammates: string[];
};

export type WidgetTodaySnapshotV2 = {
  version: number;
  generatedAt: string;
  date: string | null;
  personName: string | null;
  statusLabel: string | null;
  workplace: string | null;
  absenceReason: string | null;
  dutyLabel: string | null;
  isDuty: boolean;
  teammates: string[];
  nextDays: WidgetNextDaySnapshot[];
  adminSummary?: {
    enabled: boolean;
    presentToday: number;
    absentToday: number;
    dutyToday: number;
    presentTomorrow: number;
    dutyTomorrow: number;
  } | null;
};

function getIosBridge() {
  return (globalThis as any)?.webkit?.messageHandlers?.mycliniqWidget;
}

type MycliniqWidgetBridgePlugin = {
  setTodaySnapshot(options: { snapshotJson: string }): Promise<void>;
};

const MycliniqWidgetBridge = registerPlugin<MycliniqWidgetBridgePlugin>(
  "MycliniqWidgetBridge",
);

function setWidgetSyncDebugStatus(status: WidgetSyncDebugStatus): void {
  try {
    localStorage.setItem(WIDGET_SYNC_DEBUG_KEY, JSON.stringify(status));
  } catch {
    // ignore local storage issues
  }
}

export function readWidgetSyncDebugStatus(): WidgetSyncDebugStatus | null {
  try {
    const raw = localStorage.getItem(WIDGET_SYNC_DEBUG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetSyncDebugStatus;
  } catch {
    return null;
  }
}

export function buildWidgetTodaySnapshot(input: {
  today: DashboardDay | null;
  personName: string | null;
  teammateNames: string[];
  nextDays: DashboardDay[];
  attendanceWidget?: DashboardAttendanceWidget | null;
  isAdmin?: boolean;
}): WidgetTodaySnapshotV2 {
  const dutyLabel = input.today?.duty?.labelShort ?? input.today?.duty?.serviceType ?? null;
  const todayStatusLabel =
    input.today?.statusLabel ??
    input.today?.absenceReason ??
    (dutyLabel ? `Dienst${dutyLabel ? ` (${dutyLabel})` : ""}` : null) ??
    input.today?.workplace ??
    null;
  const todayDate = input.today?.date ?? null;
  const nextDays = input.nextDays
    .filter((day) => {
      if (!todayDate) return true;
      return day.date > todayDate;
    })
    .slice(0, 7)
    .map((day) => {
      const nextDutyLabel = day.duty?.labelShort ?? day.duty?.serviceType ?? null;
      const teammateNames = (day.teammates ?? [])
        .map((t) => [t.firstName, t.lastName].filter(Boolean).join(" ").trim())
        .filter(Boolean);
      const normalizedStatusLabel =
        day.statusLabel ??
        day.absenceReason ??
        (nextDutyLabel ? `Dienst${nextDutyLabel ? ` (${nextDutyLabel})` : ""}` : null) ??
        day.workplace ??
        "Kein Eintrag";

      return {
        date: day.date,
        statusLabel: normalizedStatusLabel,
        workplace: day.workplace ?? null,
        absenceReason: day.absenceReason ?? null,
        dutyLabel: nextDutyLabel,
        isDuty: Boolean(day.duty || nextDutyLabel),
        teammates: teammateNames,
      };
    });
  const todayMembers = input.attendanceWidget?.today?.members ?? [];
  const tomorrowMembers = input.attendanceWidget?.tomorrow?.members ?? [];
  const adminSummary =
    input.isAdmin && input.attendanceWidget
      ? {
          enabled: true,
          presentToday: todayMembers.length,
          absentToday:
            typeof input.attendanceWidget.today?.absentCount === "number"
              ? input.attendanceWidget.today.absentCount
              : 0,
          dutyToday: todayMembers.filter((m) => Boolean(m.isDuty)).length,
          presentTomorrow: tomorrowMembers.length,
          dutyTomorrow: tomorrowMembers.filter((m) => Boolean(m.isDuty)).length,
        }
      : null;

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    date: input.today?.date ?? null,
    personName: input.personName,
    statusLabel: todayStatusLabel,
    workplace: input.today?.workplace ?? null,
    absenceReason: input.today?.absenceReason ?? null,
    dutyLabel,
    isDuty: Boolean(input.today?.duty || dutyLabel),
    teammates: input.teammateNames,
    nextDays,
    adminSummary,
  };
}

export async function syncWidgetTodaySnapshot(
  snapshot: WidgetTodaySnapshotV2,
): Promise<void> {
  try {
    localStorage.setItem(WIDGET_TODAY_SNAPSHOT_KEY, JSON.stringify(snapshot));
    setWidgetSyncDebugStatus({
      at: new Date().toISOString(),
      stage: "local-cache",
      ok: true,
      detail: "Snapshot in localStorage gespeichert",
    });
  } catch {
    setWidgetSyncDebugStatus({
      at: new Date().toISOString(),
      stage: "local-cache",
      ok: false,
      detail: "localStorage schreiben fehlgeschlagen",
    });
  }

  try {
    if (Capacitor.isNativePlatform()) {
      await MycliniqWidgetBridge.setTodaySnapshot({
        snapshotJson: JSON.stringify(snapshot),
      });
      setWidgetSyncDebugStatus({
        at: new Date().toISOString(),
        stage: "native-bridge",
        ok: true,
        detail: "setTodaySnapshot erfolgreich",
      });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Bridge-Fehler";
    setWidgetSyncDebugStatus({
      at: new Date().toISOString(),
      stage: "native-bridge",
      ok: false,
      detail: message,
    });
    return;
  }

  try {
    const iosBridge = getIosBridge();
    if (iosBridge?.postMessage) {
      iosBridge.postMessage(snapshot);
      setWidgetSyncDebugStatus({
        at: new Date().toISOString(),
        stage: "webkit-fallback",
        ok: true,
        detail: "Message an iOS WebKit Handler gesendet",
      });
    } else {
      setWidgetSyncDebugStatus({
        at: new Date().toISOString(),
        stage: "webkit-fallback",
        ok: false,
        detail: "Kein iOS WebKit Handler vorhanden",
      });
    }
  } catch {
    setWidgetSyncDebugStatus({
      at: new Date().toISOString(),
      stage: "webkit-fallback",
      ok: false,
      detail: "iOS WebKit Handler Aufruf fehlgeschlagen",
    });
  }
}

export async function syncWidgetTodaySnapshotFromApi(
  authToken: string,
  personName: string | null,
): Promise<void> {
  try {
    const res = await fetch(`${getApiBase()}/dashboard`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      setWidgetSyncDebugStatus({
        at: new Date().toISOString(),
        stage: "api-dashboard",
        ok: false,
        detail: `Dashboard API Fehler: HTTP ${res.status}`,
      });
      return;
    }

    const raw = (await res.json()) as
      | {
          success?: boolean;
          data?: {
            today?: DashboardDay;
            weekPreview?: DashboardDay[];
          };
          today?: DashboardDay;
          weekPreview?: DashboardDay[];
        }
      | null;

    const payload = (raw?.data ?? raw) as
      | {
          today?: DashboardDay;
          weekPreview?: DashboardDay[];
        }
      | null
      | undefined;
    if (!payload?.today) {
      setWidgetSyncDebugStatus({
        at: new Date().toISOString(),
        stage: "api-dashboard",
        ok: false,
        detail: "Dashboard API ohne today-Daten",
      });
      return;
    }

    const today = payload.today;
    const teammateNames = (today.teammates ?? [])
      .map((t) => [t.firstName, t.lastName].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    const nextDays = (payload.weekPreview ?? []).filter(
      (entry) => entry.date !== today.date,
    );

    const snapshot = buildWidgetTodaySnapshot({
      today,
      personName,
      teammateNames,
      nextDays,
    });
    await syncWidgetTodaySnapshot(snapshot);
  } catch {
    setWidgetSyncDebugStatus({
      at: new Date().toISOString(),
      stage: "api-dashboard",
      ok: false,
      detail: "Dashboard API / Snapshot Sync fehlgeschlagen",
    });
  }
}
