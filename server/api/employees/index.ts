import type { Router } from "express";
import { storage } from "../../storage";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { insertEmployeeSchema } from "@shared/schema";

/**
 * Employee API Routes
 * Base path: /api/employees
 */
export function registerEmployeeRoutes(router: Router) {
  
  /**
   * GET /api/employees
   * Get all employees
   */
  router.get("/", asyncHandler(async (req, res) => {
    const employees = await storage.getEmployees();
    return ok(res, employees);
  }));

  /**
   * GET /api/employees/:id
   * Get employee by ID
   */
  router.get("/:id", 
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employee = await storage.getEmployee(Number(id));
      
      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }
      
      return ok(res, employee);
    })
  );

  /**
   * POST /api/employees
   * Create new employee
   */
  router.post("/", 
    validateBody(insertEmployeeSchema),
    asyncHandler(async (req, res) => {
      const employee = await storage.createEmployee(req.body);
      return created(res, employee);
    })
  );

  /**
   * PUT /api/employees/:id
   * Update employee
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employee = await storage.updateEmployee(Number(id), req.body);
      
      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }
      
      return ok(res, employee);
    })
  );

  /**
   * DELETE /api/employees/:id
   * Delete employee
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const deleted = await storage.deleteEmployee(Number(id));
      
      if (!deleted) {
        return notFound(res, "Mitarbeiter");
      }
      
      return ok(res, { deleted: true });
    })
  );

  return router;
}
