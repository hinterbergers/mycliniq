// client/src/lib/auth.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Employee } from "@shared/schema";
import { clearAuthToken, readAuthToken, writeAuthToken } from "./authToken";

type SystemRole = "employee" | "department_admin" | "clinic_admin" | "system_admin";

export interface UserData {
  id: number;
  employeeId: number;
  name: string;
  lastName: string;
  email?: string;
  systemRole: SystemRole;
  appRole: string;
  isAdmin: boolean;
}

export interface MeData {
  user: UserData;
  department?: any;
  clinic?: any;
  capabilities?: string[];
  // manche Server liefern optional employee mit
  employee?: Omit<Employee, "passwordHash"> | null;
}

export interface AuthContextType {
  employee: Omit<Employee, "passwordHash"> | null;
  user: UserData | null;
  token: string | null;

  isLoading: boolean;
  isAuthenticated: boolean;

  // inhaltliche Admin-Rechte (Menü)
  isAdmin: boolean;

  // technische Admin-Rechte (Setup/Verwaltung)
  isTechnicalAdmin: boolean;

  capabilities: string[];

  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ADMIN_ROLES = ["Primararzt", "1. Oberarzt", "Sekretariat"] as const;

// Legacy helper used by some admin pages
export function getAuthToken() {
  return readAuthToken();
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function buildUserFromEmployee(emp: any): UserData {
  return {
    id: emp.id,
    employeeId: emp.id,
    name: emp.name ?? "",
    lastName: emp.lastName ?? "",
    email: emp.email,
    systemRole: (emp.systemRole ?? "employee") as SystemRole,
    appRole: emp.appRole ?? "User",
    isAdmin: !!emp.isAdmin,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Omit<Employee, "passwordHash"> | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ WICHTIG: nicht mehr employee als Gatekeeper verwenden
  const isAuthenticated = useMemo(() => !!token && !!user, [token, user]);

  const isAdmin = useMemo(() => {
    // primär aus user
    if (user?.isAdmin) return true;

    // fallback: aus employee.role (falls vorhanden)
    if (employee) {
      const role = (employee as any).role;
      if (employee.isAdmin) return true;
      if (typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role)) return true;
    }
    return false;
  }, [user, employee]);

  const isTechnicalAdmin = useMemo(() => {
    if (!user) return false;
    return user.systemRole !== "employee";
  }, [user]);

  const resetAuthState = () => {
    clearAuthToken();
    setToken(null);
    setEmployee(null);
    setUser(null);
    setCapabilities([]);
  };

  const applyAuthState = (next: {
    token?: string | null;
    employee?: Omit<Employee, "passwordHash"> | null;
    user?: UserData | null;
    capabilities?: string[];
  }) => {
    if (typeof next.token !== "undefined") setToken(next.token);
    if (typeof next.employee !== "undefined") setEmployee(next.employee);
    if (typeof next.user !== "undefined") setUser(next.user);
    if (typeof next.capabilities !== "undefined") setCapabilities(next.capabilities);
  };

  // -------- API Calls --------

  const fetchMe = async (authToken: string) => {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${authToken}`, Accept: "application/json" },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  };

  const fetchAuthMe = async (authToken: string) => {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${authToken}`, Accept: "application/json" },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  };

  const verifyToken = useCallback(
    async (authToken: string) => {
      try {
        setIsLoading(true);

        // 1) Primär: /api/me  -> { success:true, data:{ user, department, clinic, capabilities, employee? } }
        const primary = await fetchMe(authToken);
        const primaryData = primary.data?.data ?? primary.data;
        if (primary.ok && primary.data?.success !== false && primaryData?.user) {
          const meData = primaryData as MeData;

          applyAuthState({
            user: meData.user,
            capabilities: Array.isArray(meData.capabilities) ? meData.capabilities : [],
            employee: (meData.employee ?? null) as Omit<Employee, "passwordHash"> | null,
          });

          // Wenn employee fehlt: optionaler Fallback, aber NICHT mehr auth-blocking
          if (!meData.employee) {
            const fb = await fetchAuthMe(authToken);
            if (fb.ok) {
              const fbData = fb.data?.data ?? fb.data;
              if (fbData?.employee) {
                applyAuthState({ employee: fbData.employee as Omit<Employee, "passwordHash"> });
              }
              if (!meData.user && fbData?.user) {
                applyAuthState({ user: fbData.user as UserData });
              }
            }
          }
          }

          return;
        }

        // 2) Fallback: /api/auth/me
        const fallback = await fetchAuthMe(authToken);
        if (fallback.ok && fallback.data?.success !== false) {
          const fbData = fallback.data?.data ?? fallback.data;
          const fbUser = fbData?.user as UserData | undefined;
          const fbEmployee = fbData?.employee as Omit<Employee, "passwordHash"> | undefined;
          const fbCapabilities = Array.isArray(fbData?.capabilities) ? fbData.capabilities : [];

          if (fbUser) {
            applyAuthState({
              user: fbUser,
              capabilities: fbCapabilities,
              employee: fbEmployee ?? null,
            });
            return;
          }

          // falls nur employee geliefert würde:
          if (fbEmployee) {
            applyAuthState({
              employee: fbEmployee,
              user: buildUserFromEmployee(fbEmployee),
              capabilities: fbCapabilities,
            });
            return;
          }
        }

        // Wenn beides fehlschlägt -> reset
        resetAuthState();
      } catch (err) {
        console.error("[Auth] verification failed:", err);
        resetAuthState();
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Initial: Token laden + verifizieren
  useEffect(() => {
    const saved = readAuthToken();
    if (saved) {
      setToken(saved);
      void verifyToken(saved);
    } else {
      setIsLoading(false);
    }
  }, [verifyToken]);

  const login = useCallback(
    async (email: string, password: string, rememberMe?: boolean) => {
      setIsLoading(true);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email, password, rememberMe: !!rememberMe }),
        });

        const data = await safeJson(res);

        if (!res.ok) {
          throw new Error(data?.error || "Anmeldung fehlgeschlagen");
        }

        const authToken = data?.token as string | undefined;
        if (!authToken) {
          throw new Error("Login: Token fehlt in Response");
        }

        setToken(authToken);
        writeAuthToken(authToken);

        // schneller UI-Boost falls employee in login-response
        if (data?.employee) {
          const emp = data.employee as Omit<Employee, "passwordHash">;
          applyAuthState({
            employee: emp,
            user: data.user ? (data.user as UserData) : buildUserFromEmployee(emp),
            capabilities: [],
          });
        }

        // danach immer verifizieren (single source of truth)
        await verifyToken(authToken);
      } finally {
        setIsLoading(false);
      }
    },
    [verifyToken]
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
      }
    } catch {
      // ignore
    } finally {
      resetAuthState();
      setIsLoading(false);
    }
  }, [token]);

  const refreshAuth = useCallback(async () => {
    const saved = readAuthToken();
    if (!saved) {
      resetAuthState();
      setIsLoading(false);
      return;
    }
    setToken(saved);
    await verifyToken(saved);
  }, [verifyToken]);

  const value = useMemo<AuthContextType>(
    () => ({
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
    }),
    [
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
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
