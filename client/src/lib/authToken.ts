const TOKEN_KEY = "cliniq_auth_token";

type KeyValuePlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

function getSecurePluginCandidates(): KeyValuePlugin[] {
  const cap = (globalThis as any).Capacitor;
  const plugins = cap?.Plugins ?? {};
  const candidates = [
    plugins.CapacitorSecureStoragePlugin,
    plugins.SecureStoragePlugin,
  ];
  return candidates.filter(Boolean) as KeyValuePlugin[];
}

let tokenCache: string | null | undefined;

function isNative(): boolean {
  const cap = (globalThis as any).Capacitor;
  if (typeof cap?.isNativePlatform === "function") {
    return Boolean(cap.isNativePlatform());
  }
  return false;
}

function readLocalToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLocalToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function clearLocalToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function readSecureToken(): Promise<string | null> {
  for (const plugin of getSecurePluginCandidates()) {
    try {
      const result = await plugin.get({ key: TOKEN_KEY });
      return result.value ?? null;
    } catch {
      // try next plugin candidate
    }
  }
  return null;
}

async function writeSecureToken(token: string): Promise<boolean> {
  for (const plugin of getSecurePluginCandidates()) {
    try {
      await plugin.set({ key: TOKEN_KEY, value: token });
      return true;
    } catch {
      // try next plugin candidate
    }
  }
  return false;
}

async function clearSecureToken(): Promise<boolean> {
  for (const plugin of getSecurePluginCandidates()) {
    try {
      await plugin.remove({ key: TOKEN_KEY });
      return true;
    } catch {
      // try next plugin candidate
    }
  }
  return false;
}

export async function hydrateAuthToken(): Promise<string | null> {
  if (isNative()) {
    const secureValue = await readSecureToken();
    if (secureValue) {
      tokenCache = secureValue;
      return secureValue;
    }
    const localFallback = readLocalToken();
    tokenCache = localFallback;
    return localFallback;
  }

  const local = readLocalToken();
  tokenCache = local;
  return local;
}

export function readAuthToken(): string | null {
  if (typeof tokenCache !== "undefined") {
    return tokenCache;
  }

  const local = readLocalToken();
  tokenCache = local;
  return local;
}

export async function writeAuthToken(token: string): Promise<void> {
  tokenCache = token;
  if (isNative()) {
    const stored = await writeSecureToken(token);
    if (!stored) {
      writeLocalToken(token);
    }
    return;
  }
  writeLocalToken(token);
}

export async function clearAuthToken(): Promise<void> {
  tokenCache = null;
  if (isNative()) {
    const cleared = await clearSecureToken();
    if (!cleared) {
      clearLocalToken();
    }
    return;
  }
  clearLocalToken();
}
