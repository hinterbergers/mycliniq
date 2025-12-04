import type { Router } from "express";
import { storage } from "../../storage";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { db, eq } from "../../lib/db";
import { 
  projectInitiatives, 
  projectTasks, 
  projectDocuments,
  projectMembers,
  insertProjectInitiativeSchema,
  insertProjectTaskSchema,
  insertProjectDocumentSchema,
  insertProjectMemberSchema
} from "@shared/schema";

/**
 * Project API Routes
 * Base path: /api/projects
 */
export function registerProjectRoutes(router: Router) {

  /**
   * GET /api/projects
   * Get all projects
   */
  router.get("/", asyncHandler(async (req, res) => {
    const projects = await storage.getProjectInitiatives();
    return ok(res, projects);
  }));

  /**
   * GET /api/projects/:id
   * Get project by ID with tasks and members
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const project = await storage.getProjectInitiative(Number(id));
      
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      // Load related data
      const tasks = await storage.getProjectTasks(Number(id));
      const documents = await storage.getProjectDocuments(Number(id));
      // TODO: Load members via storage interface
      const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, Number(id)));
      
      return ok(res, { ...project, tasks, documents, members });
    })
  );

  /**
   * POST /api/projects
   * Create new project
   */
  router.post("/",
    validateBody(insertProjectInitiativeSchema),
    asyncHandler(async (req, res) => {
      const project = await storage.createProjectInitiative(req.body);
      return created(res, project);
    })
  );

  /**
   * PUT /api/projects/:id
   * Update project
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const project = await storage.updateProjectInitiative(Number(id), req.body);
      
      if (!project) {
        return notFound(res, "Projekt");
      }
      
      return ok(res, project);
    })
  );

  /**
   * DELETE /api/projects/:id
   * Delete project
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const deleted = await storage.deleteProjectInitiative(Number(id));
      
      if (!deleted) {
        return notFound(res, "Projekt");
      }
      
      return ok(res, { deleted: true });
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
      // TODO: Implement via storage interface with employee join
      const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, Number(id)));
      return ok(res, members);
    })
  );

  /**
   * POST /api/projects/:id/members
   * Add member to project
   */
  router.post("/:id/members",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { employeeId, role } = req.body;
      
      // TODO: Implement via storage interface
      const [member] = await db
        .insert(projectMembers)
        .values({ projectId: Number(id), employeeId, role })
        .returning();
      
      return created(res, member);
    })
  );

  /**
   * DELETE /api/projects/:id/members/:employeeId
   * Remove member from project
   */
  router.delete("/:id/members/:employeeId",
    asyncHandler(async (req, res) => {
      const { id, employeeId } = req.params;
      
      // TODO: Implement via storage interface
      await db.delete(projectMembers).where(
        and(
          eq(projectMembers.projectId, Number(id)),
          eq(projectMembers.employeeId, Number(employeeId))
        )
      );
      
      return ok(res, { deleted: true });
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
      const tasks = await storage.getProjectTasks(Number(id));
      return ok(res, tasks);
    })
  );

  /**
   * POST /api/projects/:id/tasks
   * Create task in project
   */
  router.post("/:id/tasks",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const task = await storage.createProjectTask({
        ...req.body,
        initiativeId: Number(id)
      });
      return created(res, task);
    })
  );

  /**
   * PUT /api/projects/:id/tasks/:taskId
   * Update task
   */
  router.put("/:id/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const { taskId } = req.params;
      const task = await storage.updateProjectTask(Number(taskId), req.body);
      
      if (!task) {
        return notFound(res, "Aufgabe");
      }
      
      return ok(res, task);
    })
  );

  /**
   * DELETE /api/projects/:id/tasks/:taskId
   * Delete task
   */
  router.delete("/:id/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const { taskId } = req.params;
      const deleted = await storage.deleteProjectTask(Number(taskId));
      
      if (!deleted) {
        return notFound(res, "Aufgabe");
      }
      
      return ok(res, { deleted: true });
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
      const documents = await storage.getProjectDocuments(Number(id));
      return ok(res, documents);
    })
  );

  /**
   * POST /api/projects/:id/documents
   * Create document in project
   */
  router.post("/:id/documents",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const doc = await storage.createProjectDocument({
        ...req.body,
        initiativeId: Number(id)
      });
      return created(res, doc);
    })
  );

  return router;
}

// Import 'and' for the member delete route
import { and } from "../../lib/db";
