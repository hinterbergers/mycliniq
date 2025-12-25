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

  isAdmin: boolean;
  isTechnicalAdmin: boolean;

  capabilities: string[];

  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ADMIN_ROLES = ['Primararzt', '1. Oberarzt', 'Sekretariat'] as const;
const TOKEN_KEY = 'cliniq_auth_token';

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
  const v = String(x || '').toLowerCase();
  if (v === 'system_admin') return 'system_admin';
  if (v === 'clinic_admin') return 'clinic_admin';
  if (v === 'department_admin') return 'department_admin';
  return 'employee';
}

function buildUserFromEmployee(emp: any): UserData {
  const isAdmin = !!emp?.isAdmin;
  const empRole = normalizeSystemRole(emp?.systemRole); // optional: wenn server das liefert
  const systemRole: SystemRole = empRole !== 'employee'
    ? empRole
    : (isAdmin ? 'department_admin' : 'employee');

  return {
    id: emp.id,
    employeeId: emp.id,
    name: emp.name ?? '',
    lastName: emp.lastName ?? '',
    email: emp.email,
    systemRole,
    appRole: emp.appRole ?? 'User',
    isAdmin,
  };
}

// Erstellt ein vollständiges Employee-Objekt aus User-Daten oder einem partiellen Employee
// Wichtig: Stellt sicher, dass alle erforderlichen Felder vorhanden sind, insbesondere 'role'
function ensureCompleteEmployee(emp: any, fallbackRole?: string): Omit<Employee, 'passwordHash'> | null {
  if (!emp || !emp.id) return null;
  
  // Wenn bereits ein vollständiges Employee-Objekt vorhanden ist, verwende es
  if (emp.role && typeof emp.role === 'string') {
    return emp as Omit<Employee, 'passwordHash'>;
  }
  
  // Ansonsten konstruiere ein vollständiges Employee-Objekt mit Standardwerten
  return {
    ...emp,
    role: emp.role || fallbackRole || 'Assistenzarzt', // Standard-Rolle falls nicht vorhanden
    competencies: Array.isArray(emp.competencies) ? emp.competencies : [],
    diplomas: Array.isArray(emp.diplomas) ? emp.diplomas : [],
    isActive: emp.isActive !== undefined ? emp.isActive : true,
    isAdmin: emp.isAdmin !== undefined ? emp.isAdmin : false,
    takesShifts: emp.takesShifts !== undefined ? emp.takesShifts : true,
    showPrivateContact: emp.showPrivateContact !== undefined ? emp.showPrivateContact : false,
  } as Omit<Employee, 'passwordHash'>;
}

// Unterstützt mehrere Response-Shapes
function extractAuthPayload(payload: any): { employee?: any; user?: any; capabilities?: any } {
  if (!payload) return {};

  // Shape A: { success:true, data:{ user, employee, capabilities } }
  if (payload.success && payload.data) {
    return {
      employee: payload.data.employee ?? payload.data.emp ?? payload.data.currentEmployee,
      user: payload.data.user,
      capabilities: payload.data.capabilities,
    };
  }

  // Shape B: { token, employee, expiresAt } (login response)
  if (payload.employee || payload.user || payload.capabilities) {
    return {
      employee: payload.employee,
      user: payload.user,
      capabilities: payload.capabilities,
    };
  }

  // Shape C: { employee: {...} } (legacy)
  if (payload.employee) {
    return { employee: payload.employee };
  }

  return {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Omit<Employee, 'passwordHash'> | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Fix 2: OR statt AND
  const isAuthenticated = useMemo(
    () => !!token && (!!employee || !!user),
    [token, employee, user]
  );

  const isAdmin = useMemo(() => {
    if (!employee) return false;
    const role = (employee as any).role;
    return !!(employee as any).isAdmin || (typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role));
  }, [employee]);

  const isTechnicalAdmin = useMemo(() => {
    // bevorzugt user.systemRole, sonst fallback employee.systemRole
    const uRole = user?.systemRole;
    if (uRole) return uRole !== 'employee';
    const eRole = normalizeSystemRole((employee as any)?.systemRole);
    return eRole !== 'employee' || isAdmin;
  }, [user, employee, isAdmin]);

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

  const fetchWithToken = async (url: string, authToken: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  };

  const verifyToken = async (authToken: string) => {
    setIsLoading(true);
    try {
      // 1) Erst /api/me versuchen (Admin-Capabilities etc.)
      const primary = await fetchWithToken('/api/me', authToken);
      if (primary.ok && primary.data) {
        const { employee: empRaw, user: userRaw, capabilities: capsRaw } = extractAuthPayload(primary.data);
        
        // Employee sicherstellen: vollständig mit role-Feld
        const emp = empRaw ? ensureCompleteEmployee(empRaw) : null;
        
        // User erstellen: bevorzuge userRaw, sonst aus employee ableiten
        const u = userRaw 
          ? (userRaw as UserData) 
          : (emp ? buildUserFromEmployee(emp) : null);
        
        // Nur setzen, wenn Werte vorhanden sind (undefined = nicht setzen, behalte vorhandenen State)
        const updates: Parameters<typeof applyAuthState>[0] = {
          capabilities: Array.isArray(capsRaw) ? capsRaw : [],
        };
        if (emp) updates.employee = emp;
        if (u) updates.user = u;
        applyAuthState(updates);
        
        // Wenn employee gesetzt wurde, sind wir fertig
        if (emp) {
          return;
        }
      }

      // 2) Wenn /api/me fehlschlägt oder kein employee liefert -> Fallback /api/auth/me
      // WICHTIG: Nicht resettet, wenn /api/me fehlschlägt, sondern Fallback versuchen
      const fallback = await fetchWithToken('/api/auth/me', authToken);
      if (fallback.ok && fallback.data) {
        const { employee: empRaw, user: userRaw, capabilities: capsRaw } = extractAuthPayload(fallback.data);
        
        if (empRaw) {
          // Employee sicherstellen: vollständig mit role-Feld
          const emp = ensureCompleteEmployee(empRaw);
          if (emp) {
            const u = userRaw ? (userRaw as UserData) : buildUserFromEmployee(emp);
            applyAuthState({
              employee: emp,
              user: u,
              capabilities: Array.isArray(capsRaw) ? capsRaw : [],
            });
            return;
          }
        }
      }

      // 3) Nur wenn beide Endpunkte fehlschlagen ODER kein employee liefern -> dann reset
      // ABER: Wenn wir bereits employee/user haben, nicht resettet (könnte temporärer Server-Fehler sein)
      if (!employee && !user) {
        resetAuthState();
      } else {
        // Behalte vorhandene Auth-Daten, setze nur loading auf false
        console.warn('[Auth] verifyToken: Endpunkte lieferten keine Daten, behalte vorhandene Auth-Daten');
      }
    } catch (err) {
      console.error('[Auth] verifyToken failed:', err);
      // Bei Fehler: Nur resettet, wenn wir keine Auth-Daten haben
      if (!employee && !user) {
        resetAuthState();
      }
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
      if (!res.ok) throw new Error(data?.error || 'Anmeldung fehlgeschlagen');

      const authToken = data?.token as string | undefined;
      if (!authToken) throw new Error('Login: token fehlt in Response');

      setToken(authToken);
      writeToken(authToken);

      // Login-response kann employee, user und capabilities enthalten
      const { employee: empRaw, user: userRaw, capabilities: capsRaw } = extractAuthPayload(data);
      
      // Employee sicherstellen: vollständig mit role-Feld
      const emp = empRaw ? ensureCompleteEmployee(empRaw) : null;
      
      // User erstellen: bevorzuge userRaw, sonst aus employee ableiten
      const u = userRaw 
        ? (userRaw as UserData) 
        : (emp ? buildUserFromEmployee(emp) : null);
      
      // Setze initiale Auth-Daten aus Login-Response (für schnelle UI-Aktualisierung)
      if (emp || u) {
        applyAuthState({ 
          employee: emp ?? null, 
          user: u ?? null, 
          capabilities: Array.isArray(capsRaw) ? capsRaw : [] 
        });
      }

      // Danach verifyToken aufrufen für vollständige Daten (Capabilities, etc.)
      // Auch wenn verifyToken fehlschlägt, haben wir bereits employee/user gesetzt
      await verifyToken(authToken);
    } catch (err) {
      console.error('[Auth] login failed:', err);
      resetAuthState();
      throw err; // Weiterwerfen, damit UI den Fehler anzeigen kann
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      }
    } catch (err) {
      console.error('[Auth] logout error:', err);
    } finally {
      resetAuthState();
    }
  };

  const refreshAuth = async () => {
    const saved = readToken();
    if (saved) await verifyToken(saved);
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