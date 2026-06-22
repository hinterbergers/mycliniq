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
import {
  clearAuthToken,
  hydrateAuthToken,
  readAuthToken,
  writeAuthToken,
} from "./authToken";
import { getApiBase } from "./apiBase";
import { syncWidgetTodaySnapshotFromApi } from "./mobileWidget";
import { clearNativeNotificationBadge, syncNativeNotificationBadge } from "./nativeBadge";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const AUTH_API_BASE = getApiBase();

type SystemRole = 
  | "employee"
  | "department_admin"
  | "clinic_admin"
  | "system_admin";

export interface UserData {
  id: number;
  employeeId: number;
  name: string;
  lastName: string;
  email?: string;
  systemRole: SystemRole;
  appRole: string;
  isAdmin: boolean;
  accessScope?: "full" | "external_duty";
  trainingEnabled: boolean;
}

const CAPABILITY_ALIASES: Record<string, string[]> = {
  "project.manage": ["project.manage", "perm.project_manage"],
  "project.delete": ["project.delete", "perm.project_delete"],
  "sop.publish": ["sop.publish", "perm.sop_publish"],
  "sop.manage": ["sop.manage", "perm.sop_manage"],
  "message_group.manage": ["message_group.manage", "perm.message_group_manage"],
};

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

  // reale Admin-Rechte (ohne View-As-User)
  isAdminActual: boolean;
  isTechnicalAdminActual: boolean;

  // Admin-Ansicht als Benutzer simulieren
  viewMode: "default" | "user" | "trainer";
  setViewMode: (value: "default" | "user" | "trainer") => void;
  viewAsUser: boolean;
  setViewAsUser: (value: boolean) => void;

  canViewTraining: boolean;
  canViewEducation: boolean;
  canManageEducationCatalog: boolean;
  canViewTrainerCockpit: boolean;

  capabilities: string[];
  can: (capability: string) => boolean;
  canAny: (caps: string[]) => boolean;
  isSuperuser: boolean;

  login: (
    identifier: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// const ADMIN_ROLES = ["Primararzt", "1. Oberarzt", "Sekretariat"] as const;
const VIEW_MODE_KEY = "cliniq_view_mode";

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
    trainingEnabled: Boolean(emp.trainingEnabled),
  };
}

function buildDisplayName(
  user: UserData | null | undefined,
  employee: Omit<Employee, "passwordHash"> | null | undefined,
): string | null {
  const employeeFirstName = (employee as any)?.firstName as string | undefined;
  const employeeLastName = (employee as any)?.lastName as string | undefined;
  const employeeName = [employeeFirstName, employeeLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (employeeName) return employeeName;

  const userName = [user?.name, user?.lastName].filter(Boolean).join(" ").trim();
  return userName || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Omit<
    Employee,
    "passwordHash"
  > | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<"default" | "user" | "trainer">(
    "default",
  );
  const viewAsUser = viewMode === "user";

  // ✅ WICHTIG: nicht mehr employee als Gatekeeper verwenden
  const isAuthenticated = useMemo(() => !!token && !!user, [token, user]);

  const isAdminActual = useMemo(() => {
    if (user?.isAdmin) return true;
    // Fallback for older responses where user may be missing; no title-based logic.
    return !!employee?.isAdmin;
  }, [user, employee]);

  const isTechnicalAdminActual = useMemo(() => {
    if (!user) return false;
    return user.systemRole !== "employee";
  }, [user]);

  const canUseViewMode = useMemo(() => {
    if (!user) return false;
    return (
      isAdminActual ||
      user.appRole === "Editor" ||
      user.appRole === "Ausbilder"
    );
  }, [user, isAdminActual]);

  const isAdmin = useMemo(
    () => isAdminActual && viewMode === "default",
    [isAdminActual, viewMode],
  );

  const isTechnicalAdmin = useMemo(
    () => isTechnicalAdminActual && viewMode === "default",
    [isTechnicalAdminActual, viewMode],
  );

  const effectiveCapabilities = useMemo(
    () => (viewMode === "user" ? [] : capabilities),
    [capabilities, viewMode],
  );
  const isSuperuser = useMemo(() => {
    if (!user) return false;
    const actual = user.isAdmin || user.systemRole !== "employee";
    return actual && viewMode === "default";
  }, [user, viewMode]);

  const trainingEnabledFromEmployee = useMemo(
    () => Boolean(employee?.trainingEnabled),
    [employee],
  );

  const trainingEnabledFromUser = useMemo(
    () => Boolean(user?.trainingEnabled),
    [user],
  );

  const isTrainerRole = useMemo(
    () => user?.appRole === "Ausbilder" || viewMode === "trainer",
    [user?.appRole, viewMode],
  );

  const isEducationParticipantRole = useMemo(() => {
    const role = String(employee?.role ?? "").toLowerCase();
    return (
      role.includes("assistenz") ||
      role.includes("facharzt") ||
      role.includes("turnus") ||
      role.includes("kpj") ||
      role.includes("famul")
    );
  }, [employee?.role]);

  const canViewTraining = useMemo(
    () =>
      isSuperuser ||
      trainingEnabledFromEmployee ||
      trainingEnabledFromUser,
    [isSuperuser, trainingEnabledFromEmployee, trainingEnabledFromUser],
  );

  const can = useCallback(
    (capability: string) => {
      if (isSuperuser) return true;
      const targets = CAPABILITY_ALIASES[capability] ?? [capability];
      return targets.some((key) => effectiveCapabilities.includes(key));
    },
    [effectiveCapabilities, isSuperuser],
  );

  const canAny = useCallback(
    (caps: string[]) => caps.some((cap) => can(cap)),
    [can],
  );

  const canManageEducationCatalog = useMemo(
    () => isSuperuser || isTrainerRole || can("training.edit"),
    [isSuperuser, isTrainerRole, can],
  );

  const canViewTrainerCockpit = useMemo(
    () =>
      isSuperuser ||
      isTrainerRole ||
      can("training.supervise") ||
      can("training.edit"),
    [isSuperuser, isTrainerRole, can],
  );

  const canViewEducation = useMemo(
    () =>
      isSuperuser ||
      isTrainerRole ||
      isEducationParticipantRole ||
      trainingEnabledFromEmployee ||
      trainingEnabledFromUser ||
      can("training.supervise") ||
      can("training.edit"),
    [
      isSuperuser,
      isTrainerRole,
      isEducationParticipantRole,
      trainingEnabledFromEmployee,
      trainingEnabledFromUser,
      can,
    ],
  );

  const setViewMode = useCallback(
    (value: "default" | "user" | "trainer") => {
      if (!canUseViewMode) return;
      setViewModeState(value);
    },
    [canUseViewMode],
  );

  const setViewAsUser = useCallback(
    (value: boolean) => {
      if (!canUseViewMode) return;
      setViewModeState(value ? "user" : "default");
    },
    [canUseViewMode],
  );

  const resetAuthState = () => {
    void clearAuthToken();
    setToken(null);
    setEmployee(null);
    setUser(null);
    setCapabilities([]);
    setViewModeState("default");
    try {
      localStorage.removeItem(VIEW_MODE_KEY);
    } catch {
      // ignore
    }
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
    if (typeof next.capabilities !== "undefined")
      setCapabilities(next.capabilities);
  };

  // -------- API Calls --------

  const fetchMe = async (authToken: string) => {
    const res = await fetch(`${AUTH_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
      },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  };

  const fetchAuthMe = async (authToken: string) => {
    const res = await fetch(`${AUTH_API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
      },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  };

  const verifyToken = useCallback(
    async (authToken: string): Promise<{ success: boolean; errorMessage?: string }> => {
      let failureMessage: string | undefined;
      try {
        setIsLoading(true);

        const primary = await fetchMe(authToken);
        const primaryData = primary.data?.data ?? primary.data;
        if (
          primary.ok &&
          primary.data?.success !== false &&
          primaryData?.user
        ) {
          const meData = primaryData as MeData;

          applyAuthState({
            user: meData.user,
            capabilities: Array.isArray(meData.capabilities)
              ? meData.capabilities
              : [],
            employee: (meData.employee ?? null) as Omit<
              Employee,
              "passwordHash"
            > | null,
          });

          if (!meData.employee) {
            const fb = await fetchAuthMe(authToken);
            if (fb.ok) {
              const fbData = fb.data?.data ?? fb.data;
              if (fbData?.employee) {
                applyAuthState({
                  employee: fbData.employee as Omit<Employee, "passwordHash">,
                });
              }
              if (!meData.user && fbData?.user) {
                applyAuthState({ user: fbData.user as UserData });
              }
            }
          }
          void syncWidgetTodaySnapshotFromApi(
            authToken,
            buildDisplayName(meData.user, meData.employee ?? null),
          );
          void syncNativeNotificationBadge(authToken);
          return { success: true };
        }

        if (!primary.ok || primary.data?.success === false) {
          failureMessage = primary.data?.error ?? failureMessage;
        }

        const fallback = await fetchAuthMe(authToken);
        if (fallback.ok && fallback.data?.success !== false) {
          const fbData = fallback.data?.data ?? fallback.data;
          const fbUser = fbData?.user as UserData | undefined;
          const fbEmployee = fbData?.employee as
            | Omit<Employee, "passwordHash">
            | undefined;
          const fbCapabilities = Array.isArray(fbData?.capabilities)
            ? fbData.capabilities
            : [];

          if (fbUser) {
            applyAuthState({
              user: fbUser,
              capabilities: fbCapabilities,
              employee: fbEmployee ?? null,
            });
            void syncWidgetTodaySnapshotFromApi(
              authToken,
              buildDisplayName(fbUser, fbEmployee ?? null),
            );
            void syncNativeNotificationBadge(authToken);
            return { success: true };
          }

          if (fbEmployee) {
            applyAuthState({
              employee: fbEmployee,
              user: buildUserFromEmployee(fbEmployee),
              capabilities: fbCapabilities,
            });
            void syncWidgetTodaySnapshotFromApi(
              authToken,
              buildDisplayName(null, fbEmployee),
            );
            void syncNativeNotificationBadge(authToken);
            return { success: true };
          }
        } else if (fallback.data?.success === false || !fallback.ok) {
          failureMessage = fallback.data?.error ?? failureMessage;
        }

        resetAuthState();
        return {
          success: false,
          errorMessage: failureMessage ?? "Authentifizierung fehlgeschlagen",
        };
      } catch (err) {
        console.error("[Auth] verification failed:", err);
        resetAuthState();
        const errMessage =
          failureMessage ??
          (err instanceof Error ? err.message : "Authentifizierung fehlgeschlagen");
        return { success: false, errorMessage: errMessage };
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Initial: Token laden + verifizieren
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const saved = await hydrateAuthToken();
      if (cancelled) return;
      if (saved) {
        setToken(saved);
        await verifyToken(saved);
      } else {
        setIsLoading(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [verifyToken]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === null) {
        setViewModeState(
          user?.appRole === "Editor" || user?.appRole === "Ausbilder"
            ? "user"
            : "default",
        );
      } else {
        setViewModeState(
          stored === "user" || stored === "trainer" ? stored : "default",
        );
      }
    } catch {
      // ignore
    }
  }, [user?.appRole]);

  useEffect(() => {
    if (!canUseViewMode && viewMode !== "default") {
      setViewModeState("default");
    }
  }, [canUseViewMode, viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    if (!token || !isAuthenticated || !Capacitor.isNativePlatform()) return;

    let active = true;

    const syncBadge = async () => {
      if (!active) return;
      await syncNativeNotificationBadge(token);
    };

    void syncBadge();
    const intervalId = window.setInterval(() => {
      void syncBadge();
    }, 60000);

    const listenerPromise = CapacitorApp.addListener("resume", () => {
      void syncBadge();
    });

    return () => {
      active = false;
      window.clearInterval(intervalId);
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [isAuthenticated, token]);

  const login = useCallback(
    async (identifier: string, password: string, rememberMe?: boolean) => {
      setIsLoading(true);

      try {
        const res = await fetch(`${AUTH_API_BASE}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            identifier,
            email: identifier,
            password,
            rememberMe: !!rememberMe,
          }),
        });

        const data = await safeJson(res);

        if (!res.ok) {
          throw new Error(data?.error || "Anmeldung fehlgeschlagen");
        }

        const payload = (data?.data ?? data) as
          | {
              token?: string;
              employee?: Omit<Employee, "passwordHash">;
              user?: UserData;
            }
          | null
          | undefined;

        const authToken = payload?.token as string | undefined;
        if (!authToken) {
          throw new Error("Login: Token fehlt in Response");
        }

        setToken(authToken);
        await writeAuthToken(authToken);

        // schneller UI-Boost falls employee in login-response
        if (payload?.employee) {
          const emp = payload.employee as Omit<Employee, "passwordHash">;
          applyAuthState({
            employee: emp,
            user: payload.user
              ? (payload.user as UserData)
              : buildUserFromEmployee(emp),
            capabilities: [],
          });
        }

        // danach immer verifizieren (single source of truth)
        const verification = await verifyToken(authToken);
        if (!verification.success) {
          throw new Error(
            verification.errorMessage || "Authentifizierung fehlgeschlagen",
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [verifyToken],
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${AUTH_API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      }
    } catch {
      // ignore
    } finally {
      void clearNativeNotificationBadge();
      resetAuthState();
      setIsLoading(false);
    }
  }, [token]);

  const refreshAuth = useCallback(async () => {
    const saved = (await hydrateAuthToken()) ?? readAuthToken();
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
      isAdminActual,
      isTechnicalAdminActual,
      viewMode,
      setViewMode,
      viewAsUser,
      setViewAsUser,
      capabilities: effectiveCapabilities,
      can,
      canAny,
      isSuperuser,
      canViewTraining,
      canViewEducation,
      canManageEducationCatalog,
      canViewTrainerCockpit,
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
      isAdminActual,
      isTechnicalAdminActual,
      viewMode,
      setViewMode,
      viewAsUser,
      setViewAsUser,
      effectiveCapabilities,
      can,
      canAny,
      isSuperuser,
      canViewTraining,
      canViewEducation,
      canManageEducationCatalog,
      canViewTrainerCockpit,
      login,
      logout,
      refreshAuth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
