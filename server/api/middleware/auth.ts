// server/api/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { db, eq, and } from "../../lib/db";
import { employees, sessions, departments, userPermissions, permissions } from "@shared/schema";

/**
 * User context attached to authenticated requests
 */
export interface AuthUser {
  id: number;
  employeeId: number;
  appRole: "Admin" | "Editor" | "User";
  systemRole: "employee" | "department_admin" | "clinic_admin" | "system_admin";
  isAdmin: boolean;
  name: string;
  lastName: string;
  departmentId?: number;
  clinicId?: number;
  capabilities: string[];
}

interface SessionData {
  employeeId?: number;
  userId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: SessionData & Record<string, any>;
    }
  }
}

/**
 * Extract Bearer token
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);
  return null;
}

async function getAuthUserByEmployeeId(employeeId: number): Promise<AuthUser | null> {
  try {
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));

    if (!employee || !employee.isActive) return null;

    let departmentId: number | undefined;
    let clinicId: number | undefined;

    if (employee.departmentId) {
      departmentId = employee.departmentId;
      const [department] = await db.select().from(departments).where(eq(departments.id, employee.departmentId));
      if (department) clinicId = department.clinicId;
    }

    let capabilities: string[] = [];
    if (departmentId) {
      const userPerms = await db
        .select({ key: permissions.key })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(and(eq(userPermissions.userId, employeeId), eq(userPermissions.departmentId, departmentId)));

      capabilities = userPerms.map((p) => p.key);
    }

    const systemRole = (employee.systemRole || "employee") as AuthUser["systemRole"];
    const isTechnicalAdmin = systemRole !== "employee";

    // ID: falls employee.userId eine UUID/ID-String ist, nicht parseInt erzwingen.
    // Für /api/me nutzt ihr ohnehin employeeId als echten Bezug.
    const numericId =
      typeof (employee as any).userId === "string" && /^\d+$/.test((employee as any).userId)
        ? parseInt((employee as any).userId, 10)
        : employee.id;

    return {
      id: numericId,
      employeeId: employee.id,
      appRole: employee.appRole as AuthUser["appRole"],
      systemRole,
      isAdmin: employee.isAdmin || employee.appRole === "Admin" || isTechnicalAdmin,
      name: employee.name,
      lastName: employee.lastName || "",
      departmentId,
      clinicId,
      capabilities,
    };
  } catch (error) {
    console.error("[Auth] Error fetching employee:", error);
    return null;
  }
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
    if (!session) return null;

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) return null;

    return await getAuthUserByEmployeeId(session.employeeId);
  } catch (error) {
    console.error("[Auth] Token verification error:", error);
    return null;
  }
}

/**
 * Authentication middleware:
 * - In production: if no token -> just next() (route decides via requireAuth)
 * - If token exists but invalid -> 401
 * This is the cleanest split: authenticate attaches req.user if possible,
 * requireAuth enforces it.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      // DEV logging only (optional)
      if (process.env.NODE_ENV !== "production") {
        const skipLogPaths = ["/api/roster-settings", "/api/health"];
        if (!skipLogPaths.some((p) => req.originalUrl.startsWith(p))) {
          // keep it low-noise
          // console.warn(`[Auth] Unauthenticated access to ${req.method} ${req.originalUrl}`);
        }
      }
      return next();
    }

    const user = await verifyToken(token);

    if (!user) {
      res.status(401).json({ success: false, error: "Ungültiges oder abgelaufenes Token" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("[Auth] Middleware error:", error);
    res.status(500).json({ success: false, error: "Authentifizierungsfehler" });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }
  next();
}

export function requireTechnicalAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) return res.status(401).json({ success: false, error: "Anmeldung erforderlich" }) as any;

  const ok =
    req.user.systemRole === "department_admin" ||
    req.user.systemRole === "clinic_admin" ||
    req.user.systemRole === "system_admin";

  if (!ok) {
    res.status(403).json({ success: false, error: "Technische Admin-Berechtigung erforderlich" });
    return;
  }
  next();
}

export function requireClinicAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) return res.status(401).json({ success: false, error: "Anmeldung erforderlich" }) as any;

  const ok = req.user.systemRole === "clinic_admin" || req.user.systemRole === "system_admin";
  if (!ok) {
    res.status(403).json({ success: false, error: "Klinik-Admin-Berechtigung erforderlich" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) return res.status(401).json({ success: false, error: "Anmeldung erforderlich" }) as any;

  if (!req.user.isAdmin && req.user.appRole !== "Admin") {
    res.status(403).json({ success: false, error: "Admin-Berechtigung erforderlich" });
    return;
  }
  next();
}

export function requireEditor(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) return res.status(401).json({ success: false, error: "Anmeldung erforderlich" }) as any;

  if (!req.user.isAdmin && !["Admin", "Editor"].includes(req.user.appRole)) {
    res.status(403).json({ success: false, error: "Editor-Berechtigung erforderlich" });
    return;
  }
  next();
}

export function requireOwnerOrAdmin(getOwnerId: (req: Request) => number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      return;
    }

    if (req.user.isAdmin || req.user.appRole === "Admin") return next();

    const ownerId = getOwnerId(req);
    if (req.user.employeeId !== ownerId) {
      res.status(403).json({ success: false, error: "Zugriff nur auf eigene Daten erlaubt" });
      return;
    }

    next();
  };
}

export function isTechnicalAdmin(req: Request): boolean {
  return !!req.user && req.user.systemRole !== "employee";
}

export function hasCapability(req: Request, capability: string): boolean {
  if (!req.user) return false;
  if (isTechnicalAdmin(req)) return true;
  return req.user.capabilities.includes(capability);
}

export function isAdmin(req: Request): boolean {
  return !!req.user && (req.user.isAdmin || req.user.appRole === "Admin");
}

export function isEditorOrAdmin(req: Request): boolean {
  return !!req.user && (req.user.isAdmin || ["Admin", "Editor"].includes(req.user.appRole));
}

export function canAccessEmployee(req: Request, employeeId: number): boolean {
  if (!req.user) return false;
  if (req.user.isAdmin || req.user.appRole === "Admin") return true;
  return req.user.employeeId === employeeId;
}

export const getOwnerIdFrom = {
  params: (paramName: string = "employeeId") => (req: Request) => Number(req.params[paramName]),
  body: (fieldName: string = "employeeId") => (req: Request) => Number(req.body[fieldName]),
  query: (queryName: string = "employee_id") => (req: Request) => Number(req.query[queryName]),
};