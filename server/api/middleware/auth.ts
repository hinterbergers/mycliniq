import type { Request, Response, NextFunction } from "express";
import { db, eq } from "../../lib/db";
import { employees, sessions } from "@shared/schema";

/**
 * User context attached to authenticated requests
 */
export interface AuthUser {
  id: number;
  oderId?: string;
  employeeId: number;
  appRole: 'Admin' | 'Editor' | 'User';
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
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Get AuthUser from employee ID
 */
async function getAuthUserByEmployeeId(employeeId: number): Promise<AuthUser | null> {
  try {
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
      appRole: employee.appRole as 'Admin' | 'Editor' | 'User',
      isAdmin: employee.isAdmin || employee.appRole === 'Admin',
      name: employee.name,
      lastName: employee.lastName || ''
    };
  } catch (error) {
    console.error('[Auth] Error fetching employee:', error);
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
    
    return await getAuthUserByEmployeeId(session.employeeId);
  } catch (error) {
    console.error('[Auth] Token verification error:', error);
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
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);
    
    if (!token) {
      // TODO: In production, uncomment to require authentication
      // res.status(401).json({ success: false, error: "Authentifizierung erforderlich" });
      // return;
      
      // DEV MODE: Allow through without auth, log warning
      if (process.env.NODE_ENV !== 'production') {
        // Don't spam logs for common endpoints
        const skipLogPaths = ['/api/auth/me', '/api/roster-settings'];
        if (!skipLogPaths.some(p => req.path.startsWith(p))) {
          console.warn(`[Auth] Unauthenticated access to ${req.method} ${req.path}`);
        }
      }
      return next();
    }
    
    const user = await verifyToken(token);
    
    if (!user) {
      // Token invalid or expired
      res.status(401).json({ success: false, error: "Ungültiges oder abgelaufenes Token" });
      return;
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
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
  next: NextFunction
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
 * 
 * Use for: employee management, room management, plan releases
 */
export function requireAdmin(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }
  
  if (!req.user.isAdmin && req.user.appRole !== 'Admin') {
    res.status(403).json({ success: false, error: "Admin-Berechtigung erforderlich" });
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
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
    return;
  }
  
  const allowedRoles = ['Admin', 'Editor'];
  if (!req.user.isAdmin && !allowedRoles.includes(req.user.appRole)) {
    res.status(403).json({ success: false, error: "Editor-Berechtigung erforderlich" });
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
    if (req.user.isAdmin || req.user.appRole === 'Admin') {
      return next();
    }
    
    const ownerId = getOwnerId(req);
    
    if (req.user.employeeId !== ownerId) {
      res.status(403).json({ 
        success: false, 
        error: "Zugriff nur auf eigene Daten erlaubt" 
      });
      return;
    }
    
    next();
  };
}

/**
 * Helper to check if current user is admin
 */
export function isAdmin(req: Request): boolean {
  return req.user?.isAdmin || req.user?.appRole === 'Admin' || false;
}

/**
 * Helper to check if current user is editor or admin
 */
export function isEditorOrAdmin(req: Request): boolean {
  if (!req.user) return false;
  return req.user.isAdmin || ['Admin', 'Editor'].includes(req.user.appRole);
}

/**
 * Helper to check if current user can access employee data
 */
export function canAccessEmployee(req: Request, employeeId: number): boolean {
  if (!req.user) return false;
  if (req.user.isAdmin || req.user.appRole === 'Admin') return true;
  return req.user.employeeId === employeeId;
}

/**
 * Get owner ID extractors for common patterns
 */
export const getOwnerIdFrom = {
  params: (paramName: string = 'employeeId') => 
    (req: Request) => Number(req.params[paramName]),
  
  body: (fieldName: string = 'employeeId') => 
    (req: Request) => Number(req.body[fieldName]),
  
  query: (queryName: string = 'employee_id') => 
    (req: Request) => Number(req.query[queryName])
};
