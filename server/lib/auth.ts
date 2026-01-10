import type { Request, Response, NextFunction } from "express";
import { db, eq } from "./db";
import { employees } from "@shared/schema";

/**
 * User context attached to authenticated requests
 */
export interface AuthUser {
  id: number;
  oderId?: string;
  employeeId: number;
  appRole: "Admin" | "Editor" | "User";
  isAdmin: boolean;
  name: string;
  lastName: string;
}

/**
 * Session data interface
 */
interface SessionData {
  employeeId?: number;
  userId?: string;
}

/**
 * Extend Express Request to include user and session
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
 * TODO: Implement proper JWT extraction
 */
function extractToken(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Check session cookie
  // TODO: Implement session-based auth
  if (req.session?.employeeId) {
    return `session:${req.session.employeeId}`;
  }

  return null;
}

/**
 * Verify token and return user data
 * TODO: Implement proper JWT verification
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  // TODO: Replace with real JWT verification
  // For now, we'll parse a simple token format or use session

  if (token.startsWith("session:")) {
    const employeeId = parseInt(token.split(":")[1]);
    if (!isNaN(employeeId)) {
      return await getAuthUserByEmployeeId(employeeId);
    }
  }

  // TODO: Implement JWT verification
  // const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // return await getAuthUserByEmployeeId(decoded.employeeId);

  return null;
}

/**
 * Get AuthUser from employee ID
 */
async function getAuthUserByEmployeeId(
  employeeId: number,
): Promise<AuthUser | null> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId));

  if (!employee || !employee.isActive) {
    return null;
  }

  return {
    id: employee.userId ? parseInt(employee.userId) : employee.id,
    employeeId: employee.id,
    appRole: employee.appRole as "Admin" | "Editor" | "User",
    isAdmin: employee.isAdmin || employee.appRole === "Admin",
    name: employee.name,
    lastName: employee.lastName || "",
  };
}

/**
 * Authentication middleware
 * Checks for valid token and attaches user to request
 *
 * Usage:
 *   router.use(authenticate);
 *   // or
 *   router.get("/protected", authenticate, handler);
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      // TODO: In production, return 401
      // For development, allow through with mock user or check session

      // Check if we have session-based auth
      if (req.session?.employeeId) {
        const user = await getAuthUserByEmployeeId(req.session.employeeId);
        if (user) {
          req.user = user;
          return next();
        }
      }

      // TODO: Remove this fallback in production
      // For development only: allow unauthenticated access
      console.warn(
        "[Auth] No token found, allowing unauthenticated access (DEV MODE)",
      );
      return next();
    }

    const user = await verifyToken(token);

    if (!user) {
      res.status(401).json({ success: false, error: "Ungültiges Token" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("[Auth] Authentication error:", error);
    res.status(500).json({ success: false, error: "Authentifizierungsfehler" });
  }
}

/**
 * Require authentication - strict version
 * Returns 401 if no valid user
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
 * Require admin role
 * Returns 403 if user is not admin
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
 * Returns 403 if user is not editor or admin
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
 * Get current authenticated user from request
 * Returns null if not authenticated
 */
export function getCurrentUser(req: Request): AuthUser | null {
  return req.user || null;
}

/**
 * Check if current user is admin
 */
export function isAdmin(req: Request): boolean {
  return req.user?.isAdmin || req.user?.appRole === "Admin" || false;
}

/**
 * Check if current user is editor or admin
 */
export function isEditorOrAdmin(req: Request): boolean {
  if (!req.user) return false;
  return req.user.isAdmin || ["Admin", "Editor"].includes(req.user.appRole);
}

/**
 * Check if current user can access resource for employee
 * Admins can access all, users can only access their own
 */
export function canAccessEmployee(req: Request, employeeId: number): boolean {
  if (!req.user) return false;
  if (req.user.isAdmin || req.user.appRole === "Admin") return true;
  return req.user.employeeId === employeeId;
}
