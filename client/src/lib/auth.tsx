// client/src/lib/auth.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AppRole = "Admin" | "Editor" | "User";
type SystemRole = "employee" | "department_admin" | "clinic_admin" | "system_admin";

export interface ApiMeResponse {
  success: true;
  data: {
    user: {
      id: number;
      employeeId: number;
      name: string;
      lastName: string;
      email?: string;
      systemRole: SystemRole;
      appRole: AppRole;
      isAdmin: boolean;
    };
    department?: { id: number; name: string; slug: string } | null;
    clinic?: { id: number; name: string; slug: string; timezone: string } | null;
    capabilities: string[];
  };
}

export interface LoginResponse {
  token: string;
  employee?: any;
  expiresAt?: string;
}

export interface AuthMeResponse {
  success: true;
  user: {
    id: number;
    employeeId: number;
    appRole: AppRole;
    systemRole: SystemRole;
    isAdmin: boolean;
    name: string;
    lastName: string;
    departmentId?: number;
    clinicId?: number;
    capabilities?: string[];
  };
}

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  me: ApiMeResponse["data"] | null;

  // convenience flags
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (args: { email: string; password: string; rememberMe?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ✅ IMPORTANT: must match the rest of your app
const TOKEN_KEY = "cliniq_auth_token";

/**
 * Safe localStorage helpers
 */
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeStoredToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    // ignore
  }
}
function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Helper: fetch wrapper that adds Bearer token if present
 */
async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  token: string | null = null
) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(input, { ...init, headers });

  // read text first to gracefully handle empty/non-json bodies
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      json?.error ||
      json?.message ||
      (typeof json === "string" ? json : null) ||
      `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    (err as any).status = res.status;
    (err as any).payload = json;
    throw err;
  }

  return json;
}

/**
 * Fetch /api/me (new canonical endpoint)
 */
async function fetchApiMe(token: string): Promise<ApiMeResponse["data"]> {
  const res = (await apiFetch("/api/me", { method: "GET" }, token)) as any;

  // Expected: { success:true, data:{...} }
  if (res?.success === true && res?.data?.user) {
    return res.data as ApiMeResponse["data"];
  }

  // Some servers might return already {data:{...}} without success envelope
  if (res?.data?.user) return res.data as ApiMeResponse["data"];

  throw new Error("Unerwartetes Format von /api/me");
}

/**
 * Fetch /api/auth/me (fallback)
 * Expected: { success:true, user:{...} }
 */
async function fetchAuthMe(token: string): Promise<AuthMeResponse["user"]> {
  const res = (await apiFetch("/api/auth/me", { method: "GET" }, token)) as any;
  if (res?.success === true && res?.user) return res.user as AuthMeResponse["user"];
  throw new Error("Unerwartetes Format von /api/auth/me");
}

function toMeDataFromAuthMe(user: AuthMeResponse["user"]): ApiMeResponse["data"] {
  return {
    user: {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      lastName: user.lastName,
      systemRole: user.systemRole,
      appRole: user.appRole,
      isAdmin: user.isAdmin,
      // email unknown here
    },
    department: null,
    clinic: null,
    capabilities: Array.isArray(user.capabilities) ? user.capabilities : [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<ApiMeResponse["data"] | null>(null);

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated" && !!token && !!me?.user;

  // bootstrap token once
  useEffect(() => {
    const saved = readStoredToken();
    if (saved) {
      setToken(saved);
      setStatus("loading");
    } else {
      setStatus("anonymous");
    }
  }, []);

  const clearAuth = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setMe(null);
    setStatus("anonymous");
  }, []);

  const refreshMe = useCallback(async () => {
    const t = token ?? readStoredToken();
    if (!t) {
      setMe(null);
      setStatus("anonymous");
      return;
    }

    // Make sure state knows the token
    setToken(t);
    setStatus("loading");

    try {
      // 1) primary
      const meData = await fetchApiMe(t);
      setMe(meData);
      setStatus("authenticated");
      return;
    } catch (e1) {
      // 2) fallback
      try {
        const u = await fetchAuthMe(t);
        setMe(toMeDataFromAuthMe(u));
        setStatus("authenticated");
        return;
      } catch (e2: any) {
        console.warn("[auth] refreshMe failed:", e2?.message || e2);
        clearAuth();
      }
    }
  }, [token, clearAuth]);

  // whenever token changes -> refresh
  useEffect(() => {
    if (token) {
      void refreshMe();
    } else if (status !== "loading") {
      // keep anonymous if no token
      setMe(null);
      setStatus("anonymous");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(
    async ({ email, password, rememberMe }: { email: string; password: string; rememberMe?: boolean }) => {
      setStatus("loading");

      const payload = { email, password, rememberMe: !!rememberMe };

      const res = (await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as LoginResponse;

      if (!res?.token) {
        setStatus("anonymous");
        throw new Error("Login fehlgeschlagen: kein Token erhalten");
      }

      // persist + set state
      writeStoredToken(res.token);
      setToken(res.token);

      // immediately fetch /api/me (fallback to /api/auth/me inside refreshMe)
      await (async () => {
        try {
          const meData = await fetchApiMe(res.token);
          setMe(meData);
          setStatus("authenticated");
        } catch {
          const u = await fetchAuthMe(res.token);
          setMe(toMeDataFromAuthMe(u));
          setStatus("authenticated");
        }
      })();
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      const t = token ?? readStoredToken();
      if (t) {
        await apiFetch("/api/auth/logout", { method: "POST" }, t);
      }
    } catch (e) {
      // ignore network/server errors on logout
      console.warn("[auth] logout error:", e);
    } finally {
      clearAuth();
    }
  }, [token, clearAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      me,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshMe,
    }),
    [status, token, me, isLoading, isAuthenticated, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}