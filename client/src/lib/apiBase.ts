const EXTERNAL_API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const NATIVE_FALLBACK_API_BASE = "https://mycliniq.info/api";

function isNativePlatform(): boolean {
  const cap = (globalThis as any)?.Capacitor;
  if (typeof cap?.isNativePlatform === "function") {
    return Boolean(cap.isNativePlatform());
  }
  return false;
}

function normalizeApiBase(rawBase: string): string {
  const normalized = rawBase.replace(/\/+$/, "");
  if (!normalized) return "/api";
  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

export function getApiBase(): string {
  if (EXTERNAL_API_BASE) {
    return normalizeApiBase(EXTERNAL_API_BASE);
  }
  if (isNativePlatform()) {
    return normalizeApiBase(NATIVE_FALLBACK_API_BASE);
  }
  return "/api";
}

export function resolveApiUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;

  const base = getApiBase();

  if (url.startsWith("/api/")) {
    const suffix = url.slice(4);
    return `${base}${suffix}`;
  }

  if (url === "/api") {
    return base;
  }

  return url;
}
