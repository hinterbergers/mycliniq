import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Employee } from '@shared/schema';

type SystemRole = 'employee' | 'department_admin' | 'clinic_admin' | 'system_admin';

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

export interface AuthContextType {
  employee: Omit<Employee, 'passwordHash'> | null;
  user: UserData | null;
  token: string | null;

  isLoading: boolean;
  isAuthenticated: boolean;

  // "inhaltliche" Admin-Rechte (z.B. Menü sichtbar)
  isAdmin: boolean;

  // "technische" Admin-Rechte (z.B. Verwaltung/Klinik-Setup)
  isTechnicalAdmin: boolean;

  // feingranulare Rechte (für später)
  capabilities: string[];

  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ADMIN_ROLES = ['Primararzt', '1. Oberarzt', 'Sekretariat'] as const;
const TOKEN_KEY = 'cliniq_auth_token';

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
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
    name: emp.name ?? '',
    lastName: emp.lastName ?? '',
    email: emp.email,
    systemRole: ((emp.systemRole ?? 'department_admin' : 'employee')) as SystemRole,
    appRole: emp.appRole ?? 'User',
    isAdmin: !!emp.isAdmin,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Omit<Employee, 'passwordHash'> | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = useMemo(() => !!token && (!!employee !!user), [token, employee, user]);

  const isAdmin = useMemo(() => {
    if (!employee) return false;
    // employee.role könnte string/enum sein -> defensive
    const role = (employee as any).role;
    return !!employee.isAdmin || (typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role));
  }, [employee]);

  const isTechnicalAdmin = useMemo(() => {
    if (!user) return false;
    return user.systemRole !== 'employee';
  }, [user]);

  const resetAuthState = () => {
    clearToken();
    setToken(null);
    setEmployee(null);
    setUser(null);
    setCapabilities([]);
  };

  const applyAuthState = (next: {
    token?: string | null;
    employee?: Omit<Employee, 'passwordHash'> | null;
    user?: UserData | null;
    capabilities?: string[];
  }) => {
    if (typeof next.token !== 'undefined') setToken(next.token);
    if (typeof next.employee !== 'undefined') setEmployee(next.employee);
    if (typeof next.user !== 'undefined') setUser(next.user);
    if (typeof next.capabilities !== 'undefined') setCapabilities(next.capabilities);
  };

  const fetchAuthMe = async (authToken: string) => {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await safeJson(res);
    return { ok: res.ok, data };
  };

  const fetchMe = async (authToken: string) => {
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await safeJson(res);
    return { ok: res.ok, data };
  };

  const verifyToken = async (authToken: string) => {
    try {
      // 1) Primär /api/me (neues Format)
      const primary = await fetchMe(authToken);

      if (primary.ok && primary.data) {
        const result = primary.data;

        // Neues Format: { success: true, data: { user, capabilities, employee? } }
        if (result.success && result.data) {
          const u = result.data.user as UserData | undefined;
          const caps = Array.isArray(result.data.capabilities) ? result.data.capabilities : [];

          // employee optional (falls server liefert)
          const emp = (result.data.employee ?? null) as Omit<Employee, 'passwordHash'> | null;

          if (u) {
            applyAuthState({
              user: u,
              capabilities: caps,
              employee: emp, // wenn null => wir versuchen /api/auth/me
            });

            // Wenn kein employee im /api/me: hole ihn von /api/auth/me
            if (!emp) {
              const fallback = await fetchAuthMe(authToken);
              if (fallback.ok && fallback.data?.employee) {
                const fbEmp = fallback.data.employee as Omit<Employee, 'passwordHash'>;
                applyAuthState({ employee: fbEmp });

                // Falls server /api/me keinen user korrekt geliefert hat: zur Sicherheit user aus employee ableiten
                if (!u?.systemRole) {
                  applyAuthState({ user: buildUserFromEmployee(fbEmp) });
                }
              } else {
                // not fatal, aber Admin-Menü könnte ohne employee.role fehlen
                // Wir lassen user drin, employee bleibt null -> isAuthenticated false.
              }
            }

            return;
          }
        }

        // Altes Format über /api/me: { employee: {...} }
        if (result.employee) {
          const emp = result.employee as Omit<Employee, 'passwordHash'>;
          const u = buildUserFromEmployee(emp);
          applyAuthState({ employee: emp, user: u, capabilities: [] });
          return;
        }
      }

      // 2) Fallback /api/auth/me
      const fallback = await fetchAuthMe(authToken);
      if (fallback.ok && fallback.data?.employee) {
        const emp = fallback.data.employee as Omit<Employee, 'passwordHash'>;
        const u = fallback.data.user
          ? (fallback.data.user as UserData)
          : buildUserFromEmployee(emp);

        applyAuthState({
          employee: emp,
          user: u,
          capabilities: Array.isArray(fallback.data.capabilities) ? fallback.data.capabilities : [],
        });
        return;
      }

      // Wenn alles fehlschlägt -> ausloggen
      resetAuthState();
    } catch (err) {
      console.error('[Auth] verification failed:', err);
      resetAuthState();
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || 'Anmeldung fehlgeschlagen');
      }

      const authToken = data?.token as string | undefined;
      if (!authToken) {
        throw new Error('Login: token fehlt in Response');
      }

      setToken(authToken);
      writeToken(authToken);

      // Optional employee direkt aus Login response (schneller UI)
      if (data?.employee) {
        const emp = data.employee as Omit<Employee, 'passwordHash'>;
        applyAuthState({
          employee: emp,
          user: buildUserFromEmployee(emp),
          capabilities: [],
        });
      }

      // Danach “single source of truth”: verifyToken
      await verifyToken(authToken);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      console.error('[Auth] logout error:', err);
    } finally {
      resetAuthState();
    }
  };

  const refreshAuth = async () => {
    const saved = readToken();
    if (saved) {
      setIsLoading(true);
      await verifyToken(saved);
      setIsLoading(false);
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
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function getAuthToken(): string | null {
  return readToken();
}