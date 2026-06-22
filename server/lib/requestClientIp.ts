import type { Request } from "express";

function normalizeIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }

  return trimmed;
}

export function getForwardedForHeader(req: Request): string | null {
  const raw = req.headers["x-forwarded-for"];

  if (Array.isArray(raw)) {
    const joined = raw.join(", ").trim();
    return joined.length > 0 ? joined : null;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

export function getClientIp(req: Request): string | null {
  const forwardedFor = getForwardedForHeader(req);
  if (forwardedFor) {
    const firstForwarded = forwardedFor
      .split(",")
      .map((part) => normalizeIp(part))
      .find(Boolean);
    if (firstForwarded) return firstForwarded;
  }

  return (
    normalizeIp(req.ip) ??
    normalizeIp(req.socket.remoteAddress) ??
    normalizeIp(req.connection.remoteAddress)
  );
}
