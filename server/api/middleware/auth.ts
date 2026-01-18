import type { Request, Response, NextFunction } from "express";
import { addMonths } from "date-fns";
import { db, eq, and } from "../../lib/db";
import {
  employees,
  sessions,
  departments,
  userPermissions,
  permissions,
} from "@shared/schema";

/**
 * User context attached to authenticated requests
 */
export interface AuthUser {
  id: number;
  oderId?: string;
  employeeId: number;
  appRole: "Admin" | "Editor" | "User";
  systemRole: "employee" | "department_admin" | "clinic_admin" | "system_admin";
  isAdmin: boolean;
  name: string;
  lastName: string;
  departmentId?: number;
  clinicId?: number;
  capabilities: string[]; // Permission keys for current department
  accessScope: "full" | "external_duty";
}

/**
 * Session data interface
 */
interface SessionData {
  employeeId?: number;
  userId?: string;
}

interface ShiftPreferences {
  externalDutyOnly?: boolean;
}

class AccessDeniedError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "AccessDeniedError";
    this.statusCode = statusCode;
  }
}

/**
 * Extend Express Request to include user
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: SessionData & Record<string, any>;
    }
  }
}

/**
 * Extract token from request
 * Checks Authorization header for Bearer token
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  const queryToken = req.query?.token;
  if (typeof queryToken === "string" && queryToken.trim().length > 0) {
    return queryToken.trim();
  }
  return null;
}

/**
 * Get AuthUser from employee ID with capabilities
 */
async function getAuthUserByEmployeeId(
  employeeId: number,
): Promise<AuthUser | null> {
  try {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId));

    if (!employee || !employee.isActive) {
      return null;
    }

    // Resolve numeric userId (permissions are stored by userId, not employeeId)
    const userId = employee.userId ? parseInt(employee.userId) : employee.id;

    // Get department and clinic info
    let departmentId: number | undefined;
    let clinicId: number | undefined;

    if (employee.departmentId) {
      departmentId = employee.departmentId;
    } else {
      // Fallback: infer departmentId from any stored permissions (department-scoped)
      const [permDept] = await db
        .select({ departmentId: userPermissions.departmentId })
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId))
        .limit(1);
      if (permDept?.departmentId) {
        departmentId = permDept.departmentId;
      }
    }

    if (departmentId) {
      const [department] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, departmentId));

      if (department) {
        clinicId = department.clinicId;
      }
    }

    // Get user capabilities (DB-backed permissions). If departmentId is missing,
    // fall back to all permissions for the user.
    let capabilities: string[] = [];
    const userPerms = await db
      .select({
        key: permissions.key,
        departmentId: userPermissions.departmentId,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(
        departmentId
          ? and(
              eq(userPermissions.userId, userId),
              eq(userPermissions.departmentId, departmentId),
            )
          : eq(userPermissions.userId, userId),
      );

    // If we had no departmentId but permissions exist, pick the first as default
    if (!departmentId && userPerms[0]?.departmentId) {
      departmentId = userPerms[0].departmentId;
      const [department] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, departmentId));
      if (department) {
        clinicId = department.clinicId;
      }
    }

    capabilities = userPerms.map((p) => p.key);

    const capabilityAliases: Record<string, string[]> = {
      // SOP
      "sop.approve": ["perm.sop_manage", "perm.sop_publish"],
      "perm.sop_manage": ["sop.approve", "sop.manage"],
      "perm.sop_publish": ["sop.approve", "sop.publish"],

      // Projects
      "project.close": ["perm.project_manage"],
      "perm.project_manage": ["project.close", "project.manage"],
      "project.delete": ["perm.project_delete"],
      "perm.project_delete": ["project.delete"],

      // Message groups
      "perm.message_group_manage": ["message_group.manage"],
    };
    if (capabilities.length) {
      const expanded = new Set(capabilities);
      capabilities.forEach((cap) => {
        const aliases = capabilityAliases[cap];
        if (aliases) {
          aliases.forEach((alias) => expanded.add(alias));
        }
      });
      capabilities = [...expanded];
    }

    // Determine system role and if user is technical admin
    const systemRole = (employee.systemRole || "employee") as
      | "employee"
      | "department_admin"
      | "clinic_admin"
      | "system_admin";
    const isTechnicalAdmin = systemRole !== "employee";
    const employmentFrom = employee.employmentFrom
      ? new Date(employee.employmentFrom)
      : null;
    const prefsRaw = employee.shiftPreferences;
    let shiftPrefs: ShiftPreferences | null = null;
    if (prefsRaw && typeof prefsRaw === "string") {
      try {
        shiftPrefs = JSON.parse(prefsRaw);
      } catch {
        shiftPrefs = null;
      }
    } else if (prefsRaw && typeof prefsRaw === "object") {
      shiftPrefs = prefsRaw as ShiftPreferences;
    }

    let accessScope: "full" | "external_duty" = "full";
    if (employmentFrom) {
      const start = new Date(employmentFrom);
      start.setHours(0, 0, 0, 0);
      const end =
        employee.employmentUntil && typeof employee.employmentUntil === "string"
          ? (() => {
              const d = new Date(employee.employmentUntil);
              d.setHours(0, 0, 0, 0);
              return d;
            })()
          : null;
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (now.getTime() < start.getTime()) {
        // Before the employment window opens we only allow external-duty scope.
        accessScope = "external_duty";
      } else {
        const fullUntil = addMonths(start, 3);
        fullUntil.setHours(0, 0, 0, 0);
        let fullAccessEnd = fullUntil;
        if (end && end.getTime() < fullAccessEnd.getTime()) {
          fullAccessEnd = end;
        }

        if (now.getTime() <= fullAccessEnd.getTime()) {
          accessScope = "full";
        } else if (shiftPrefs?.externalDutyOnly) {
          accessScope = "external_duty";
        } else {
          throw new AccessDeniedError("Befristete Anwesenheit abgelaufen");
        }
      }
    }

    if (accessScope === "external_duty") {
      const externalDutyCaps = [
        "duty_plan.read",
        "shift_wishes.read",
        "shift_wishes.write",
        "service_lines.read",
        "auth.logout",
      ];
      const expanded = new Set(capabilities);
      externalDutyCaps.forEach((cap) => expanded.add(cap));
      capabilities = [...expanded];
    }

    return {
      id: userId,
      employeeId: employee.id,
      appRole: employee.appRole as "Admin" | "Editor" | "User",
      systemRole,
      isAdmin:
        employee.isAdmin || employee.appRole === "Admin" || isTechnicalAdmin,
      name: employee.name,
      lastName: employee.lastName || "",
      departmentId,
      clinicId,
      capabilities,
      accessScope,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      throw error;
    }
    console.error("[Auth] Error fetching employee:", error);
    return null;
  }
}

/**
 * Verify token and return user data
 * TODO: Replace with proper JWT verification in production
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    // Check if session exists and is valid
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      return null;
    }

    const now = new Date();
    const lastSeenAt = session.lastSeenAt ? new Date(session.lastSeenAt) : null;
    if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() > 2 * 60 * 1000) {
      await db
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(eq(sessions.id, session.id));
    }

    return await getAuthUserByEmployeeId(session.employeeId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      throw error;
    }
    console.error("[Auth] Token verification error:", error);
    return null;
  }
}

/**
 * Authentication middleware
 *
 * Checks for valid Bearer token and attaches user to request.
 * In development mode, allows unauthenticated access with a warning.
 *
 * Usage:
 *   app.use('/api', authenticate);  // Apply to all API routes
 *   // or
 *   router.get("/protected", authenticate, handler);  // Apply to specific route
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      // TODO: In production, uncomment to require authentication
      // res.status(401).json({ success: false, error: "Authentifizierung erforderlich" });
      // return;

      // DEV MODE: Allow through without auth, log warning
      if (process.env.NODE_ENV !== "production") {
        // Don't spam logs for common endpoints
        const skipLogPaths = ["/api/auth/me", "/api/roster-settings"];
        if (!skipLogPaths.some((p) => req.path.startsWith(p))) {
          console.warn(
            `[Auth] Unauthenticated access to ${req.method} ${req.path}`,
          );
        }
      }
      return next();
    }

    const user = await verifyToken(token);

    if (!user) {
      // Token invalid or expired
      res
        .status(401)
        .json({ success: false, error: "Ungültiges oder abgelaufenes Token" });
      return;
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      res
        .status(error.statusCode)
        .json({ success: false, error: error.message });
      return;
    }
    console.error("[Auth] Middleware error:", error);
    res.status(500).json({ success: false, error: "Authentifizierungsfehler" });
  }
}

/**
 * Require authentication - strict version
 * Returns 401 if no valid user attached to request
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }
  next();
}

/**
 * Require technical admin role (department_admin or higher)
 * Returns 403 if user is not technical admin
 */
export function requireTechnicalAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }

  const isTechnicalAdmin =
    req.user.systemRole === "department_admin" ||
    req.user.systemRole === "clinic_admin" ||
    req.user.systemRole === "system_admin";

  if (!isTechnicalAdmin) {
    res.status(403).json({
      success: false,
      error: "Technische Admin-Berechtigung erforderlich",
    });
    return;
  }

  next();
}

/**
 * Require clinic admin or system admin
 */
export function requireClinicAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }

  const isClinicAdmin =
    req.user.systemRole === "clinic_admin" ||
    req.user.systemRole === "system_admin";

  if (!isClinicAdmin) {
    res.status(403).json({
      success: false,
      error: "Klinik-Admin-Berechtigung erforderlich",
    });
    return;
  }

  next();
}

/**
 * Require admin role (legacy - for backward compatibility)
 * Returns 403 if user is not admin
 *
 * Use for: employee management, room management, plan releases
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }

  if (!req.user.isAdmin && req.user.appRole !== "Admin") {
    res
      .status(403)
      .json({ success: false, error: "Admin-Berechtigung erforderlich" });
    return;
  }

  next();
}

/**
 * Require editor or admin role
 * Returns 403 if user is neither editor nor admin
 *
 * Use for: duty plan editing, weekly plan editing, daily overrides
 */
export function requireEditor(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }

  const allowedRoles = ["Admin", "Editor"];
  if (!req.user.isAdmin && !allowedRoles.includes(req.user.appRole)) {
    res
      .status(403)
      .json({ success: false, error: "Editor-Berechtigung erforderlich" });
    return;
  }

  next();
}

/**
 * Require ownership or admin
 * Returns 403 if user is not the owner and not admin
 *
 * Use for: own absences, own shift wishes, own preferences
 *
 * @param getOwnerId - Function to extract owner ID from request
 */
export function requireOwnerOrAdmin(getOwnerId: (req: Request) => number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      return;
    }

    // Admins can access all
    if (req.user.isAdmin || req.user.appRole === "Admin") {
      return next();
    }

    const ownerId = getOwnerId(req);

    if (req.user.employeeId !== ownerId) {
      res.status(403).json({
        success: false,
        error: "Zugriff nur auf eigene Daten erlaubt",
      });
      return;
    }

    next();
  };
}

/**
 * Helper to check if current user is technical admin
 */
export function isTechnicalAdmin(req: Request): boolean {
  if (!req.user) return false;
  return (
    req.user.systemRole === "department_admin" ||
    req.user.systemRole === "clinic_admin" ||
    req.user.systemRole === "system_admin"
  );
}

/**
 * Helper to check if current user has capability
 */
export function hasCapability(req: Request, capability: string): boolean {
  if (!req.user) return false;
  // Technical admins have all capabilities implicitly
  if (isTechnicalAdmin(req)) return true;
  return req.user.capabilities.includes(capability);
}

export function hasCap(req: Request, key: string): boolean {
  return Boolean(req.user?.capabilities?.includes(key));
}

/**
 * Helper to check if current user is admin (legacy)
 */
export function isAdmin(req: Request): boolean {
  return req.user?.isAdmin || req.user?.appRole === "Admin" || false;
}

/**
 * Helper to check if current user is editor or admin
 */
export function isEditorOrAdmin(req: Request): boolean {
  if (!req.user) return false;
  return req.user.isAdmin || ["Admin", "Editor"].includes(req.user.appRole);
}

/**
 * Helper to check if current user can access employee data
 */
export function canAccessEmployee(req: Request, employeeId: number): boolean {
  if (!req.user) return false;
  if (req.user.isAdmin || req.user.appRole === "Admin") return true;
  return req.user.employeeId === employeeId;
}

/**
 * Get owner ID extractors for common patterns
 */
export const getOwnerIdFrom = {
  params:
    (paramName: string = "employeeId") =>
    (req: Request) =>
      Number(req.params[paramName]),

  body:
    (fieldName: string = "employeeId") =>
    (req: Request) =>
      Number(req.body[fieldName]),

  query:
    (queryName: string = "employee_id") =>
    (req: Request) =>
      Number(req.query[queryName]),
};
