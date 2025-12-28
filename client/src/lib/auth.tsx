// client/src/lib/auth.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
      email: string;
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
  employee: any; // server returns safeEmployee; keep flexible for now
  expiresAt: string;
}

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  me: ApiMeResponse["data"] | null;
  login: (args: { email: string; password: string; rememberMe?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "mycliniq_token";

/**
 * Helper: fetch wrapper that adds Bearer token if present
 */
async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, token: string | null = null) {
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(input, { ...init, headers });
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-json
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<ApiMeResponse["data"] | null>(null);

  // load token from localStorage on first render
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    else setStatus("anonymous");
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setMe(null);
      setStatus("anonymous");
      return;
    }

    try {
      const data = (await apiFetch("/api/me", { method: "GET" }, token)) as ApiMeResponse;
      // Some implementations might return {error:"Nicht authentifiziert"} with 401.
      // Our apiFetch would throw in that case.
      setMe(data.data);
      setStatus("authenticated");
    } catch (e: any) {
      // token invalid/expired => clear
      console.warn("[auth] refreshMe failed:", e?.message || e);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setMe(null);
      setStatus("anonymous");
    }
  }, [token]);

  // Whenever token changes -> refresh /api/me
  useEffect(() => {
    if (token) {
      setStatus("loading");
      void refreshMe();
    }
  }, [token, refreshMe]);

  const login = useCallback(
    async ({ email, password, rememberMe }: { email: string; password: string; rememberMe?: boolean }) => {
      const payload = { email, password, rememberMe: !!rememberMe };

      const res = (await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as LoginResponse;

      if (!res?.token) throw new Error("Login fehlgeschlagen: kein Token erhalten");

      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);

      // Immediately fetch /api/me
      setStatus("loading");
      await (async () => {
        const meRes = (await apiFetch("/api/me", { method: "GET" }, res.token)) as ApiMeResponse;
        setMe(meRes.data);
        setStatus("authenticated");
      })();
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiFetch("/api/auth/logout", { method: "POST" }, token);
      }
    } catch (e) {
      // ignore network/server errors on logout
      console.warn("[auth] logout error:", e);
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setMe(null);
      setStatus("anonymous");
    }
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      me,
      login,
      logout,
      refreshMe,
    }),
    [status, token, me, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}