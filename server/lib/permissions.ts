import type { Request, Response, NextFunction } from "express";
import { db, eq, and } from "./db";
import { projectMembers } from "@shared/schema";
import type { AuthUser } from "./auth";

/**
 * Permission types for different resources
 */
export type ResourceType = 
  | 'employee'
  | 'room'
  | 'competency'
  | 'duty-plan'
  | 'weekly-plan'
  | 'daily-override'
  | 'absence'
  | 'shift-wish'
  | 'project'
  | 'sop';

/**
 * Action types
 */
export type ActionType = 'read' | 'create' | 'update' | 'delete' | 'release';

/**
 * Permission rules configuration
 * 
 * Rules:
 * - Admins can do everything
 * - Editors can manage planning (duty-plans, weekly-plans, daily-overrides)
 * - Users can only access their own resources (shift-wishes, absences, preferences)
 * - Project access is based on membership
 */
const permissionRules: Record<ResourceType, Record<ActionType, (user: AuthUser, resourceOwnerId?: number) => boolean>> = {
  
  // Employees: Admin only for write, all can read
  'employee': {
    read: () => true,
    create: (user) => user.isAdmin,
    update: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    delete: (user) => user.isAdmin,
    release: () => false
  },
  
  // Rooms: Admin only
  'room': {
    read: () => true,
    create: (user) => user.isAdmin,
    update: (user) => user.isAdmin,
    delete: (user) => user.isAdmin,
    release: () => false
  },
  
  // Competencies: Admin only for write
  'competency': {
    read: () => true,
    create: (user) => user.isAdmin,
    update: (user) => user.isAdmin,
    delete: (user) => user.isAdmin,
    release: () => false
  },
  
  // Duty Plans: Admin/Editor for write, Admin only for release
  'duty-plan': {
    read: () => true,
    create: (user) => user.isAdmin || user.appRole === 'Editor',
    update: (user) => user.isAdmin || user.appRole === 'Editor',
    delete: (user) => user.isAdmin,
    release: (user) => user.isAdmin
  },
  
  // Weekly Plans: Admin/Editor for write, Admin only for release
  'weekly-plan': {
    read: () => true,
    create: (user) => user.isAdmin || user.appRole === 'Editor',
    update: (user) => user.isAdmin || user.appRole === 'Editor',
    delete: (user) => user.isAdmin,
    release: (user) => user.isAdmin
  },
  
  // Daily Overrides: Admin/Editor only
  'daily-override': {
    read: () => true,
    create: (user) => user.isAdmin || user.appRole === 'Editor',
    update: (user) => user.isAdmin || user.appRole === 'Editor',
    delete: (user) => user.isAdmin || user.appRole === 'Editor',
    release: () => false
  },
  
  // Absences: Own only for users, all for admin
  'absence': {
    read: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    create: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    update: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    delete: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    release: (user) => user.isAdmin
  },
  
  // Shift Wishes: Own only for users, all for admin
  'shift-wish': {
    read: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    create: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    update: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    delete: (user, ownerId) => user.isAdmin || user.employeeId === ownerId,
    release: () => false
  },
  
  // Projects: Based on membership (checked separately)
  'project': {
    read: () => true, // Actual check done via membership
    create: (user) => user.isAdmin || user.appRole === 'Editor',
    update: () => true, // Actual check done via membership
    delete: (user) => user.isAdmin,
    release: (user) => user.isAdmin
  },
  
  // SOPs: Read all, write for admin/editor
  'sop': {
    read: () => true,
    create: (user) => user.isAdmin || user.appRole === 'Editor',
    update: (user) => user.isAdmin || user.appRole === 'Editor',
    delete: (user) => user.isAdmin,
    release: (user) => user.isAdmin
  }
};

/**
 * Check if user has permission for action on resource
 */
export function hasPermission(
  user: AuthUser | undefined,
  resource: ResourceType,
  action: ActionType,
  resourceOwnerId?: number
): boolean {
  if (!user) return false;
  
  // Admins can do everything
  if (user.isAdmin) return true;
  
  const rules = permissionRules[resource];
  if (!rules) return false;
  
  const rule = rules[action];
  if (!rule) return false;
  
  return rule(user, resourceOwnerId);
}

/**
 * Middleware factory to check permissions
 * 
 * Usage:
 *   router.put("/:id", requirePermission('employee', 'update'), handler);
 */
export function requirePermission(
  resource: ResourceType,
  action: ActionType,
  getOwnerId?: (req: Request) => number | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      return;
    }
    
    const ownerId = getOwnerId ? getOwnerId(req) : undefined;
    
    if (!hasPermission(user, resource, action, ownerId)) {
      res.status(403).json({ 
        success: false, 
        error: "Keine Berechtigung für diese Aktion",
        details: {
          resource,
          action,
          requiredRole: getRequiredRole(resource, action)
        }
      });
      return;
    }
    
    next();
  };
}

/**
 * Get required role description for error messages
 */
function getRequiredRole(resource: ResourceType, action: ActionType): string {
  const adminActions: Record<string, string[]> = {
    'employee': ['create', 'delete'],
    'room': ['create', 'update', 'delete'],
    'competency': ['create', 'update', 'delete'],
    'duty-plan': ['delete', 'release'],
    'weekly-plan': ['delete', 'release'],
    'project': ['delete', 'release'],
    'sop': ['delete', 'release']
  };
  
  if (adminActions[resource]?.includes(action)) {
    return 'Admin';
  }
  
  const editorActions: Record<string, string[]> = {
    'duty-plan': ['create', 'update'],
    'weekly-plan': ['create', 'update'],
    'daily-override': ['create', 'update', 'delete'],
    'project': ['create'],
    'sop': ['create', 'update']
  };
  
  if (editorActions[resource]?.includes(action)) {
    return 'Editor oder Admin';
  }
  
  return 'Angemeldeter Benutzer';
}

/**
 * Check if user is member of a project
 * 
 * TODO: Cache project memberships for performance
 */
export async function isProjectMember(
  userId: number,
  projectId: number
): Promise<boolean> {
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.employeeId, userId)
      )
    );
  
  return !!membership;
}

/**
 * Middleware to check project membership
 */
export function requireProjectMember(
  getProjectId: (req: Request) => number
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      return;
    }
    
    // Admins can access all projects
    if (user.isAdmin) {
      return next();
    }
    
    const projectId = getProjectId(req);
    const isMember = await isProjectMember(user.employeeId, projectId);
    
    if (!isMember) {
      res.status(403).json({ 
        success: false, 
        error: "Sie sind kein Mitglied dieses Projekts" 
      });
      return;
    }
    
    next();
  };
}

/**
 * Check if user can only access their own resources
 */
export function requireOwnership(
  getOwnerId: (req: Request) => number
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      return;
    }
    
    // Admins can access all
    if (user.isAdmin) {
      return next();
    }
    
    const ownerId = getOwnerId(req);
    
    if (user.employeeId !== ownerId) {
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
 * Get owner ID from common request patterns
 */
export const ownerIdExtractors = {
  fromParams: (paramName: string = 'employeeId') => 
    (req: Request) => Number(req.params[paramName]),
  
  fromBody: (fieldName: string = 'employeeId') => 
    (req: Request) => Number(req.body[fieldName]),
  
  fromQuery: (queryName: string = 'employee_id') => 
    (req: Request) => Number(req.query[queryName])
};
