import { Capacitor } from "@capacitor/core";
import { Badge } from "@capawesome/capacitor-badge";
import { getApiBase } from "./apiBase";

const BADGE_API_BASE = getApiBase();
let permissionsRequested = false;

async function canUseNativeBadge() {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android";
}

async function ensureBadgePermission() {
  if (!(await canUseNativeBadge())) return false;

  const status = await Badge.checkPermissions();
  if (status.display === "granted") return true;
  if (status.display === "denied") return false;
  if (permissionsRequested) return false;

  permissionsRequested = true;
  const requested = await Badge.requestPermissions();
  return requested.display === "granted";
}

export async function setNativeNotificationBadgeCount(count: number) {
  try {
    if (!(await ensureBadgePermission())) return;
    await Badge.set({ count: Math.max(0, count) });
  } catch (error) {
    console.error("[Badge] Failed to set badge count", error);
  }
}

export async function clearNativeNotificationBadge() {
  try {
    if (!(await canUseNativeBadge())) return;
    const status = await Badge.checkPermissions();
    if (status.display !== "granted") return;
    await Badge.set({ count: 0 });
  } catch (error) {
    console.error("[Badge] Failed to clear badge", error);
  }
}

export async function syncNativeNotificationBadge(authToken: string) {
  try {
    if (!(await ensureBadgePermission())) return;

    const res = await fetch(`${BADGE_API_BASE}/notifications`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Badge sync failed with status ${res.status}`);
    }

    const payload = await res.json().catch(() => null);
    const items = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    const unreadCount = items.filter((item: any) => !item?.isRead).length;
    await Badge.set({ count: unreadCount });
  } catch (error) {
    console.error("[Badge] Failed to sync notification badge", error);
  }
}
