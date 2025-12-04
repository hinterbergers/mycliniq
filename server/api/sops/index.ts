import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { db, eq } from "../../lib/db";
import { sops, insertSopSchema } from "@shared/schema";

/**
 * SOP API Routes
 * Base path: /api/sops
 */
export function registerSopRoutes(router: Router) {

  /**
   * GET /api/sops
   * Get all SOPs (optionally filtered by category/status)
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { category, status } = req.query;
    
    // TODO: Implement via storage interface with filters
    let query = db.select().from(sops);
    
    if (category) {
      query = query.where(eq(sops.category, category as any)) as any;
    }
    
    if (status) {
      query = query.where(eq(sops.status, status as any)) as any;
    }
    
    const result = await query;
    return ok(res, result);
  }));

  /**
   * GET /api/sops/:id
   * Get SOP by ID
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [sop] = await db.select().from(sops).where(eq(sops.id, Number(id)));
      
      if (!sop) {
        return notFound(res, "SOP");
      }
      
      return ok(res, sop);
    })
  );

  /**
   * POST /api/sops
   * Create new SOP
   */
  router.post("/",
    validateBody(insertSopSchema),
    asyncHandler(async (req, res) => {
      // TODO: Implement via storage interface
      const [sop] = await db.insert(sops).values(req.body).returning();
      return created(res, sop);
    })
  );

  /**
   * PUT /api/sops/:id
   * Update SOP
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [sop] = await db
        .update(sops)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(sops.id, Number(id)))
        .returning();
      
      if (!sop) {
        return notFound(res, "SOP");
      }
      
      return ok(res, sop);
    })
  );

  /**
   * DELETE /api/sops/:id
   * Delete SOP (only if status is 'Entwurf')
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Check status before delete
      await db.delete(sops).where(eq(sops.id, Number(id)));
      return ok(res, { deleted: true });
    })
  );

  /**
   * POST /api/sops/:id/submit-review
   * Submit SOP for review
   */
  router.post("/:id/submit-review",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [sop] = await db
        .update(sops)
        .set({ status: 'In Review', updatedAt: new Date() })
        .where(eq(sops.id, Number(id)))
        .returning();
      
      return ok(res, sop);
    })
  );

  /**
   * POST /api/sops/:id/approve
   * Approve SOP (changes status to 'Freigegeben')
   */
  router.post("/:id/approve",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { approvedById } = req.body;
      
      // TODO: Implement via storage interface
      const [sop] = await db
        .update(sops)
        .set({ 
          status: 'Freigegeben', 
          approvedById,
          updatedAt: new Date() 
        })
        .where(eq(sops.id, Number(id)))
        .returning();
      
      return ok(res, sop);
    })
  );

  /**
   * GET /api/sops/search
   * Search SOPs by keywords
   */
  router.get("/search", asyncHandler(async (req, res) => {
    const { q } = req.query;
    
    if (!q) {
      return ok(res, []);
    }
    
    // TODO: Implement full-text search or keyword matching
    // For now, simple title/keyword search
    const allSops = await db.select().from(sops);
    const searchTerm = (q as string).toLowerCase();
    
    const filtered = allSops.filter(sop => 
      sop.title.toLowerCase().includes(searchTerm) ||
      (sop.keywords && sop.keywords.some(k => k.toLowerCase().includes(searchTerm)))
    );
    
    return ok(res, filtered);
  }));

  return router;
}
