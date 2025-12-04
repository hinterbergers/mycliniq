import type { Router } from "express";
import { z } from "zod";
import { db, eq, and } from "../../lib/db";
import { 
  ok, 
  created, 
  notFound, 
  validationError,
  asyncHandler 
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { 
  projectInitiatives, 
  projectTasks, 
  projectDocuments,
  projectMembers,
  employees
} from "@shared/schema";

/**
 * Schema for creating a project
 */
const createProjectSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  description: z.string().nullable().optional(),
  category: z.enum(['SOP', 'Studie', 'Administrativ', 'Qualitätsprojekt']).default('SOP'),
  status: z.enum(['Entwurf', 'Aktiv', 'In Prüfung', 'Abgeschlossen', 'Archiviert']).default('Entwurf'),
  ownerId: z.number().positive().nullable().optional(),
  createdById: z.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.number().min(0).max(10).default(0)
});

/**
 * Schema for updating a project
 */
const updateProjectSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.enum(['SOP', 'Studie', 'Administrativ', 'Qualitätsprojekt']).optional(),
  status: z.enum(['Entwurf', 'Aktiv', 'In Prüfung', 'Abgeschlossen', 'Archiviert']).optional(),
  ownerId: z.number().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.number().min(0).max(10).optional()
});

/**
 * Schema for creating a task
 */
const createTaskSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  description: z.string().nullable().optional(),
  status: z.enum(['Offen', 'In Bearbeitung', 'Zur Prüfung', 'Genehmigt', 'Veröffentlicht']).default('Offen'),
  parentTaskId: z.number().positive().nullable().optional(),
  assignedToId: z.number().positive().nullable().optional(),
  createdById: z.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.number().min(0).max(10).default(0),
  orderIndex: z.number().default(0)
});

/**
 * Schema for updating a task
 */
const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['Offen', 'In Bearbeitung', 'Zur Prüfung', 'Genehmigt', 'Veröffentlicht']).optional(),
  parentTaskId: z.number().positive().nullable().optional(),
  assignedToId: z.number().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.number().min(0).max(10).optional(),
  orderIndex: z.number().optional()
});

/**
 * Schema for updating project members
 */
const updateMembersSchema = z.object({
  employeeIds: z.array(z.number().positive()),
  role: z.enum(['Mitarbeit', 'Review', 'Leitung']).default('Mitarbeit')
});

/**
 * Task ID param schema
 */
const taskIdParamSchema = z.object({
  taskId: z.string().regex(/^\d+$/).transform(Number)
});

/**
 * Project API Routes
 * Base path: /api/projects
 */
export function registerProjectRoutes(router: Router) {

  /**
   * GET /api/projects
   * Get all projects with optional filters
   * Query params:
   *   - category: filter by category
   *   - status: filter by status
   *   - ownerId: filter by owner
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { category, status, ownerId } = req.query;
    
    // Get all projects with owner info
    let projects = await db
      .select({
        id: projectInitiatives.id,
        title: projectInitiatives.title,
        description: projectInitiatives.description,
        category: projectInitiatives.category,
        status: projectInitiatives.status,
        ownerId: projectInitiatives.ownerId,
        createdById: projectInitiatives.createdById,
        dueDate: projectInitiatives.dueDate,
        priority: projectInitiatives.priority,
        createdAt: projectInitiatives.createdAt,
        updatedAt: projectInitiatives.updatedAt,
        ownerName: employees.name,
        ownerLastName: employees.lastName
      })
      .from(projectInitiatives)
      .leftJoin(employees, eq(projectInitiatives.ownerId, employees.id));
    
    // Apply filters
    if (category) {
      projects = projects.filter(p => p.category === category);
    }
    
    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    
    if (ownerId) {
      projects = projects.filter(p => p.ownerId === Number(ownerId));
    }
    
    return ok(res, projects);
  }));

  /**
   * GET /api/projects/:id
   * Get project by ID with tasks, members, and documents
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      
      // Get project with owner info
      const [project] = await db
        .select({
          id: projectInitiatives.id,
          title: projectInitiatives.title,
          description: projectInitiatives.description,
          category: projectInitiatives.category,
          status: projectInitiatives.status,
          ownerId: projectInitiatives.ownerId,
          createdById: projectInitiatives.createdById,
          dueDate: projectInitiatives.dueDate,
          priority: projectInitiatives.priority,
          createdAt: projectInitiatives.createdAt,
          updatedAt: projectInitiatives.updatedAt,
          ownerName: employees.name,
          ownerLastName: employees.lastName
        })
        .from(projectInitiatives)
        .leftJoin(employees, eq(projectInitiatives.ownerId, employees.id))
        .where(eq(projectInitiatives.id, projectId));
      
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      // Get tasks with assignee info
      const tasks = await db
        .select({
          id: projectTasks.id,
          initiativeId: projectTasks.initiativeId,
          parentTaskId: projectTasks.parentTaskId,
          title: projectTasks.title,
          description: projectTasks.description,
          status: projectTasks.status,
          assignedToId: projectTasks.assignedToId,
          createdById: projectTasks.createdById,
          dueDate: projectTasks.dueDate,
          priority: projectTasks.priority,
          orderIndex: projectTasks.orderIndex,
          createdAt: projectTasks.createdAt,
          assigneeName: employees.name,
          assigneeLastName: employees.lastName
        })
        .from(projectTasks)
        .leftJoin(employees, eq(projectTasks.assignedToId, employees.id))
        .where(eq(projectTasks.initiativeId, projectId));
      
      // Get members with employee info
      const members = await db
        .select({
          projectId: projectMembers.projectId,
          employeeId: projectMembers.employeeId,
          role: projectMembers.role,
          joinedAt: projectMembers.joinedAt,
          employeeName: employees.name,
          employeeLastName: employees.lastName,
          employeeRole: employees.role
        })
        .from(projectMembers)
        .leftJoin(employees, eq(projectMembers.employeeId, employees.id))
        .where(eq(projectMembers.projectId, projectId));
      
      // Get documents
      const documents = await db
        .select()
        .from(projectDocuments)
        .where(eq(projectDocuments.initiativeId, projectId));
      
      return ok(res, {
        ...project,
        owner: project.ownerId ? {
          id: project.ownerId,
          name: project.ownerName,
          lastName: project.ownerLastName
        } : null,
        tasks,
        members,
        documents,
        summary: {
          totalTasks: tasks.length,
          openTasks: tasks.filter(t => t.status === 'Offen').length,
          inProgressTasks: tasks.filter(t => t.status === 'In Bearbeitung').length,
          completedTasks: tasks.filter(t => t.status === 'Genehmigt' || t.status === 'Veröffentlicht').length,
          totalMembers: members.length,
          totalDocuments: documents.length
        }
      });
    })
  );

  /**
   * POST /api/projects
   * Create new project
   */
  router.post("/",
    validateBody(createProjectSchema),
    asyncHandler(async (req, res) => {
      const { title, description, category, status, ownerId, createdById, dueDate, priority } = req.body;
      
      // Verify creator exists
      const [creator] = await db.select().from(employees).where(eq(employees.id, createdById));
      if (!creator) {
        return notFound(res, "Ersteller (Mitarbeiter)");
      }
      
      // Verify owner if provided
      if (ownerId) {
        const [owner] = await db.select().from(employees).where(eq(employees.id, ownerId));
        if (!owner) {
          return notFound(res, "Projektinhaber (Mitarbeiter)");
        }
      }
      
      // Create the project
      const [project] = await db
        .insert(projectInitiatives)
        .values({
          title,
          description: description || null,
          category: category || 'SOP',
          status: status || 'Entwurf',
          ownerId: ownerId || null,
          createdById,
          dueDate: dueDate || null,
          priority: priority || 0
        })
        .returning();
      
      return created(res, project);
    })
  );

  /**
   * PUT /api/projects/:id
   * Update project
   */
  router.put("/:id",
    validateParams(idParamSchema),
    validateBody(updateProjectSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      
      // Verify project exists
      const [existing] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!existing) {
        return notFound(res, "Projekt");
      }
      
      // Build update object
      const updateData: Record<string, any> = { updatedAt: new Date() };
      
      const allowedFields = ['title', 'description', 'category', 'status', 'ownerId', 'dueDate', 'priority'];
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
      
      // Update the project
      const [updated] = await db
        .update(projectInitiatives)
        .set(updateData)
        .where(eq(projectInitiatives.id, projectId))
        .returning();
      
      return ok(res, updated);
    })
  );

  /**
   * DELETE /api/projects/:id
   * Delete project (only if status is 'Entwurf')
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      
      // Verify project exists
      const [existing] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!existing) {
        return notFound(res, "Projekt");
      }
      
      // Only allow deletion of 'Entwurf' projects
      if (existing.status !== 'Entwurf') {
        return validationError(res, "Nur Projekte im Status 'Entwurf' können gelöscht werden");
      }
      
      // Delete related data (members, tasks, documents are cascaded via foreign keys)
      await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
      await db.delete(projectTasks).where(eq(projectTasks.initiativeId, projectId));
      await db.delete(projectDocuments).where(eq(projectDocuments.initiativeId, projectId));
      
      // Delete the project
      await db.delete(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      
      return ok(res, {
        deleted: true,
        id: projectId,
        title: existing.title,
        message: "Projekt und alle zugehörigen Daten gelöscht"
      });
    })
  );

  // === PROJECT MEMBERS ===

  /**
   * GET /api/projects/:id/members
   * Get project members
   */
  router.get("/:id/members",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      
      // Verify project exists
      const [project] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      // Get members with employee info
      const members = await db
        .select({
          projectId: projectMembers.projectId,
          employeeId: projectMembers.employeeId,
          role: projectMembers.role,
          joinedAt: projectMembers.joinedAt,
          employeeName: employees.name,
          employeeLastName: employees.lastName,
          employeeRole: employees.role
        })
        .from(projectMembers)
        .leftJoin(employees, eq(projectMembers.employeeId, employees.id))
        .where(eq(projectMembers.projectId, projectId));
      
      return ok(res, members);
    })
  );

  /**
   * PUT /api/projects/:id/members
   * Set project members (replaces existing)
   * Body: { employeeIds: [1, 2, 3], role: 'Mitarbeit' }
   */
  router.put("/:id/members",
    validateParams(idParamSchema),
    validateBody(updateMembersSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      const { employeeIds, role } = req.body;
      
      // Verify project exists
      const [project] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      // Verify all employees exist
      for (const empId of employeeIds) {
        const [emp] = await db.select().from(employees).where(eq(employees.id, empId));
        if (!emp) {
          return validationError(res, `Mitarbeiter mit ID ${empId} nicht gefunden`);
        }
      }
      
      // Delete existing members
      await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
      
      // Insert new members
      if (employeeIds.length > 0) {
        const membersToInsert = employeeIds.map((empId: number) => ({
          projectId,
          employeeId: empId,
          role: role || 'Mitarbeit'
        }));
        
        await db.insert(projectMembers).values(membersToInsert);
      }
      
      // Get updated members
      const members = await db
        .select({
          projectId: projectMembers.projectId,
          employeeId: projectMembers.employeeId,
          role: projectMembers.role,
          joinedAt: projectMembers.joinedAt,
          employeeName: employees.name,
          employeeLastName: employees.lastName
        })
        .from(projectMembers)
        .leftJoin(employees, eq(projectMembers.employeeId, employees.id))
        .where(eq(projectMembers.projectId, projectId));
      
      return ok(res, {
        projectId,
        members,
        count: members.length,
        message: "Projektmitglieder aktualisiert"
      });
    })
  );

  // === PROJECT TASKS ===

  /**
   * GET /api/projects/:id/tasks
   * Get project tasks
   */
  router.get("/:id/tasks",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      
      // Verify project exists
      const [project] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      // Get tasks with assignee info
      const tasks = await db
        .select({
          id: projectTasks.id,
          initiativeId: projectTasks.initiativeId,
          parentTaskId: projectTasks.parentTaskId,
          title: projectTasks.title,
          description: projectTasks.description,
          status: projectTasks.status,
          assignedToId: projectTasks.assignedToId,
          createdById: projectTasks.createdById,
          dueDate: projectTasks.dueDate,
          priority: projectTasks.priority,
          orderIndex: projectTasks.orderIndex,
          createdAt: projectTasks.createdAt,
          updatedAt: projectTasks.updatedAt,
          assigneeName: employees.name,
          assigneeLastName: employees.lastName
        })
        .from(projectTasks)
        .leftJoin(employees, eq(projectTasks.assignedToId, employees.id))
        .where(eq(projectTasks.initiativeId, projectId));
      
      return ok(res, tasks);
    })
  );

  /**
   * POST /api/projects/:id/tasks
   * Create task in project
   */
  router.post("/:id/tasks",
    validateParams(idParamSchema),
    validateBody(createTaskSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      const { title, description, status, parentTaskId, assignedToId, createdById, dueDate, priority, orderIndex } = req.body;
      
      // Verify project exists
      const [project] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      // Verify creator exists
      const [creator] = await db.select().from(employees).where(eq(employees.id, createdById));
      if (!creator) {
        return notFound(res, "Ersteller (Mitarbeiter)");
      }
      
      // Verify assignee if provided
      if (assignedToId) {
        const [assignee] = await db.select().from(employees).where(eq(employees.id, assignedToId));
        if (!assignee) {
          return notFound(res, "Zugewiesener Mitarbeiter");
        }
      }
      
      // Create the task
      const [task] = await db
        .insert(projectTasks)
        .values({
          initiativeId: projectId,
          parentTaskId: parentTaskId || null,
          title,
          description: description || null,
          status: status || 'Offen',
          assignedToId: assignedToId || null,
          createdById,
          dueDate: dueDate || null,
          priority: priority || 0,
          orderIndex: orderIndex || 0
        })
        .returning();
      
      return created(res, task);
    })
  );

  /**
   * PUT /api/projects/tasks/:taskId
   * Update task
   */
  router.put("/tasks/:taskId",
    validateParams(taskIdParamSchema),
    validateBody(updateTaskSchema),
    asyncHandler(async (req, res) => {
      const { taskId } = req.params;
      const taskIdNum = Number(taskId);
      
      // Verify task exists
      const [existing] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskIdNum));
      if (!existing) {
        return notFound(res, "Aufgabe");
      }
      
      // Build update object
      const updateData: Record<string, any> = { updatedAt: new Date() };
      
      const allowedFields = ['title', 'description', 'status', 'parentTaskId', 'assignedToId', 'dueDate', 'priority', 'orderIndex'];
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
      
      // Update the task
      const [updated] = await db
        .update(projectTasks)
        .set(updateData)
        .where(eq(projectTasks.id, taskIdNum))
        .returning();
      
      return ok(res, updated);
    })
  );

  /**
   * DELETE /api/projects/tasks/:taskId
   * Delete task
   */
  router.delete("/tasks/:taskId",
    validateParams(taskIdParamSchema),
    asyncHandler(async (req, res) => {
      const { taskId } = req.params;
      const taskIdNum = Number(taskId);
      
      // Verify task exists
      const [existing] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskIdNum));
      if (!existing) {
        return notFound(res, "Aufgabe");
      }
      
      // Delete the task
      await db.delete(projectTasks).where(eq(projectTasks.id, taskIdNum));
      
      return ok(res, {
        deleted: true,
        id: taskIdNum,
        title: existing.title,
        message: "Aufgabe gelöscht"
      });
    })
  );

  // === PROJECT DOCUMENTS ===

  /**
   * GET /api/projects/:id/documents
   * Get project documents
   */
  router.get("/:id/documents",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const projectId = Number(id);
      
      // Verify project exists
      const [project] = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, projectId));
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      const documents = await db
        .select()
        .from(projectDocuments)
        .where(eq(projectDocuments.initiativeId, projectId));
      
      return ok(res, documents);
    })
  );

  return router;
}
