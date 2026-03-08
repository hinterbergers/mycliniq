import type { DashboardDay } from "@/lib/api";
import { getApiBase } from "@/lib/apiBase";
import { Capacitor, registerPlugin } from "@capacitor/core";

export const WIDGET_TODAY_SNAPSHOT_KEY = "mycliniq_widget_today_v1";

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
  version: 2;
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

export function buildWidgetTodaySnapshot(input: {
  today: DashboardDay | null;
  personName: string | null;
  teammateNames: string[];
  nextDays: DashboardDay[];
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
  return {
    version: 2,
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
  };
}

export async function syncWidgetTodaySnapshot(
  snapshot: WidgetTodaySnapshotV2,
): Promise<void> {
  try {
    localStorage.setItem(WIDGET_TODAY_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore local storage issues
  }

  try {
    if (Capacitor.isNativePlatform()) {
      await MycliniqWidgetBridge.setTodaySnapshot({
        snapshotJson: JSON.stringify(snapshot),
      });
      return;
    }
  } catch {
    // fall through to iOS message handler
  }

  try {
    const iosBridge = getIosBridge();
    iosBridge?.postMessage(snapshot);
  } catch {
    // ignore
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
    if (!res.ok) return;

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
    if (!payload?.today) return;

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
    // ignore widget snapshot sync failures
  }
}
