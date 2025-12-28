import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Employee } from "@shared/schema";

type SystemRole = "employee" | "department_admin" | "clinic_admin" | "system_admin";

export interface UserData {
  id: number;
  employeeId: number;
  name: string;
  lastName: string;
  email?: string;
  systemRole: SystemRole;
  appRole: "Admin" | "Editor" | "User" | string;
  isAdmin: boolean;
}

export interface AuthContextType {
  employee: Omit<Employee, "passwordHash"> | null;
  user: UserData | null;
  token: string | null;

  isLoading: boolean;
  isAuthenticated: boolean;

  isAdmin: boolean;
  isTechnicalAdmin: boolean;

  capabilities: string[];

  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "cliniq_auth_token";

function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

async function safeJson(res: Response): Promise<any | null> {
  try { return await res.json(); } catch { return null; }
}

function normalizeSystemRole(x: any): SystemRole {
  const v = String(x || "").toLowerCase();
  if (v === "system_admin") return "system_admin";
  if (v === "clinic_admin") return "clinic_admin";
  if (v === "department_admin") return "department_admin";
  return "employee";
}

// /api/me kann verschiedene Shapes liefern -> wir ziehen sauber heraus, was wir brauchen
function extractMe(payload: any): { user: UserData | null; employee: any | null; capabilities: string[] } {
  if (!payload) return { user: null, employee: null, capabilities: [] };

  const root = payload.success && payload.data ? payload.data : payload;

  const userRaw = root.user ?? null;
  const employeeRaw = root.employee ?? null;

  const capsRaw = root.capabilities;
  const capabilities = Array.isArray(capsRaw) ? capsRaw.filter((x: any) => typeof x === "string") : [];

  // userRaw ist idealerweise dein serverseitiges AuthUser/UserData-Objekt
  const user: UserData | null = userRaw
    ? {
        id: Number(userRaw.id),
        employeeId: Number(userRaw.employeeId ?? userRaw.employee_id ?? userRaw.employee ?? userRaw.id),
        name: String(userRaw.name ?? ""),
        lastName: String(userRaw.lastName ?? userRaw.last_name ?? ""),
        email: userRaw.email ? String(userRaw.email) : undefined,
        systemRole: normalizeSystemRole(userRaw.systemRole),
        appRole: userRaw.appRole ?? "User",
        isAdmin: !!userRaw.isAdmin,
      }
    : null;

  return { user, employee: employeeRaw, capabilities };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Omit<Employee, "passwordHash"> | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = useMemo(() => !!token && !!user, [token, user]);

  const isAdmin = useMemo(() => !!user?.isAdmin || user?.appRole === "Admin", [user]);

  const isTechnicalAdmin = useMemo(() => {
    const role = user?.systemRole;
    return role ? role !== "employee" : false;
  }, [user]);

  const resetAuthState = () => {
    clearToken();
    setToken(null);
    setEmployee(null);
    setUser(null);
    setCapabilities([]);
  };

  async function fetchMe(authToken: string) {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  }

  const verifyToken = async (authToken: string) => {
    setIsLoading(true);
    try {
      const me = await fetchMe(authToken);

      // 401/403 = Token ungültig -> sauber resetten
      if (!me.ok) {
        if (me.status === 401 || me.status === 403) {
          resetAuthState();
          return;
        }

        // andere Serverfehler -> Token behalten, aber nichts überschreiben
        console.warn("[Auth] /api/me failed:", me.status, me.data);
        return;
      }

      const { user: u, employee: empRaw, capabilities: caps } = extractMe(me.data);

      if (!u) {
        // /api/me ok aber ohne user? -> als invalid behandeln
        resetAuthState();
        return;
      }

      setUser(u);
      setCapabilities(caps);

      // employee ist optional UI-Daten – wenn vorhanden setzen, sonst null lassen
      setEmployee(empRaw ? (empRaw as Omit<Employee, "passwordHash">) : null);
    } catch (err) {
      console.error("[Auth] verifyToken failed:", err);
      // Netzwerkfehler: Token NICHT löschen (sonst nervig bei kurzen Aussetzern)
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const saved = readToken();
    if (saved) {
      setToken(saved);
      verifyToken(saved);
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string, rememberMe?: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "Anmeldung fehlgeschlagen");

      const authToken = data?.token as string | undefined;
      if (!authToken) throw new Error("Login: token fehlt in Response");

      setToken(authToken);
      writeToken(authToken);

      // Login-Response NICHT mehr “zusammenbasteln” -> direkt /api/me als Wahrheit
      await verifyToken(authToken);
    } catch (err) {
      console.error("[Auth] login failed:", err);
      resetAuthState();
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      console.error("[Auth] logout error:", err);
    } finally {
      resetAuthState();
    }
  };

  const refreshAuth = async () => {
    const saved = readToken();
    if (saved) {
      setToken(saved);
      await verifyToken(saved);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        employee,
        user,
        token,

        isLoading,
        isAuthenticated,

        isAdmin,
        isTechnicalAdmin,

        capabilities,

        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export function getAuthToken(): string | null {
  return readToken();
}