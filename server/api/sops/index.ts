import type { Router } from "express";
import { z } from "zod";
import { db, eq } from "../../lib/db";
import { 
  ok, 
  created, 
  notFound, 
  validationError,
  asyncHandler 
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { sops, employees } from "@shared/schema";

/**
 * Schema for creating a SOP
 */
const createSopSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  category: z.enum(['SOP', 'Checkliste', 'Formular', 'Leitlinie']).default('SOP'),
  version: z.string().default('1.0'),
  status: z.enum(['Entwurf', 'In Review', 'Freigegeben']).default('Entwurf'),
  contentMarkdown: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  awmfLink: z.string().url().nullable().optional(),
  createdById: z.number().positive()
});

/**
 * Schema for updating a SOP
 */
const updateSopSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.enum(['SOP', 'Checkliste', 'Formular', 'Leitlinie']).optional(),
  version: z.string().optional(),
  status: z.enum(['Entwurf', 'In Review', 'Freigegeben']).optional(),
  contentMarkdown: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  awmfLink: z.string().url().nullable().optional(),
  approvedById: z.number().positive().nullable().optional()
});

/**
 * SOP API Routes
 * Base path: /api/sops
 */
export function registerSopRoutes(router: Router) {

  /**
   * GET /api/sops
   * Get all SOPs with optional filters
   * Query params:
   *   - category: filter by category
   *   - status: filter by status
   *   - search: search in title and keywords
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { category, status, search } = req.query;
    
    // Get all SOPs with creator info
    let sopList = await db
      .select({
        id: sops.id,
        title: sops.title,
        category: sops.category,
        version: sops.version,
        status: sops.status,
        contentMarkdown: sops.contentMarkdown,
        keywords: sops.keywords,
        awmfLink: sops.awmfLink,
        createdById: sops.createdById,
        approvedById: sops.approvedById,
        createdAt: sops.createdAt,
        updatedAt: sops.updatedAt,
        creatorName: employees.name,
        creatorLastName: employees.lastName
      })
      .from(sops)
      .leftJoin(employees, eq(sops.createdById, employees.id));
    
    // Apply filters
    if (category) {
      sopList = sopList.filter(s => s.category === category);
    }
    
    if (status) {
      sopList = sopList.filter(s => s.status === status);
    }
    
    if (search) {
      const searchTerm = String(search).toLowerCase();
      sopList = sopList.filter(s => 
        s.title.toLowerCase().includes(searchTerm) ||
        (s.keywords && s.keywords.some((k: string) => k.toLowerCase().includes(searchTerm)))
      );
    }
    
    return ok(res, sopList);
  }));

  /**
   * GET /api/sops/:id
   * Get SOP by ID with full details
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const sopId = Number(id);
      
      // Get SOP with creator info
      const [sop] = await db
        .select({
          id: sops.id,
          title: sops.title,
          category: sops.category,
          version: sops.version,
          status: sops.status,
          contentMarkdown: sops.contentMarkdown,
          keywords: sops.keywords,
          awmfLink: sops.awmfLink,
          createdById: sops.createdById,
          approvedById: sops.approvedById,
          createdAt: sops.createdAt,
          updatedAt: sops.updatedAt,
          creatorName: employees.name,
          creatorLastName: employees.lastName
        })
        .from(sops)
        .leftJoin(employees, eq(sops.createdById, employees.id))
        .where(eq(sops.id, sopId));
      
      if (!sop) {
        return notFound(res, "SOP");
      }
      
      // Get approver info if exists
      let approvedBy = null;
      if (sop.approvedById) {
        const [approver] = await db
          .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, sop.approvedById));
        approvedBy = approver || null;
      }
      
      return ok(res, {
        ...sop,
        createdBy: {
          id: sop.createdById,
          name: sop.creatorName,
          lastName: sop.creatorLastName
        },
        approvedBy
      });
    })
  );

  /**
   * POST /api/sops
   * Create new SOP
   */
  router.post("/",
    validateBody(createSopSchema),
    asyncHandler(async (req, res) => {
      const { title, category, version, status, contentMarkdown, keywords, awmfLink, createdById } = req.body;
      
      // Verify creator exists
      const [creator] = await db.select().from(employees).where(eq(employees.id, createdById));
      if (!creator) {
        return notFound(res, "Ersteller (Mitarbeiter)");
      }
      
      // Create the SOP
      const [sop] = await db
        .insert(sops)
        .values({
          title,
          category: category || 'SOP',
          version: version || '1.0',
          status: status || 'Entwurf',
          contentMarkdown: contentMarkdown || null,
          keywords: keywords || null,
          awmfLink: awmfLink || null,
          createdById,
          approvedById: null
        })
        .returning();
      
      return created(res, {
        ...sop,
        createdBy: {
          id: creator.id,
          name: creator.name,
          lastName: creator.lastName
        }
      });
    })
  );

  /**
   * PUT /api/sops/:id
   * Update SOP
   */
  router.put("/:id",
    validateParams(idParamSchema),
    validateBody(updateSopSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const sopId = Number(id);
      
      // Verify SOP exists
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) {
        return notFound(res, "SOP");
      }
      
      // Build update object
      const updateData: Record<string, any> = { updatedAt: new Date() };
      
      const allowedFields = ['title', 'category', 'version', 'status', 'contentMarkdown', 'keywords', 'awmfLink', 'approvedById'];
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
      
      // Update the SOP
      const [updated] = await db
        .update(sops)
        .set(updateData)
        .where(eq(sops.id, sopId))
        .returning();
      
      return ok(res, updated);
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
      const sopId = Number(id);
      
      // Verify SOP exists
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) {
        return notFound(res, "SOP");
      }
      
      // Only allow deletion of 'Entwurf' SOPs
      if (existing.status !== 'Entwurf') {
        return validationError(res, "Nur SOPs im Status 'Entwurf' können gelöscht werden");
      }
      
      // Delete the SOP
      await db.delete(sops).where(eq(sops.id, sopId));
      
      return ok(res, {
        deleted: true,
        id: sopId,
        title: existing.title,
        message: "SOP gelöscht"
      });
    })
  );

  /**
   * PUT /api/sops/:id/status
   * Update SOP status
   */
  router.put("/:id/status",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const sopId = Number(id);
      const { status, approvedById } = req.body;
      
      // Verify SOP exists
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) {
        return notFound(res, "SOP");
      }
      
      // Validate status
      const validStatuses = ['Entwurf', 'In Review', 'Freigegeben'];
      if (!validStatuses.includes(status)) {
        return validationError(res, `Ungültiger Status. Erlaubt: ${validStatuses.join(', ')}`);
      }
      
      const updateData: Record<string, any> = { status, updatedAt: new Date() };
      
      // Set approvedById if approving
      if (status === 'Freigegeben' && approvedById) {
        updateData.approvedById = approvedById;
      }
      
      // Update status
      const [updated] = await db
        .update(sops)
        .set(updateData)
        .where(eq(sops.id, sopId))
        .returning();
      
      return ok(res, {
        ...updated,
        message: `Status geändert auf '${status}'`
      });
    })
  );

  /**
   * GET /api/sops/search
   * Search SOPs by keywords or title
   */
  router.get("/search", asyncHandler(async (req, res) => {
    const { q } = req.query;
    
    if (!q) {
      return ok(res, []);
    }
    
    const searchTerm = String(q).toLowerCase();
    
    const allSops = await db
      .select({
        id: sops.id,
        title: sops.title,
        category: sops.category,
        version: sops.version,
        status: sops.status,
        keywords: sops.keywords,
        createdAt: sops.createdAt
      })
      .from(sops);
    
    const filtered = allSops.filter(sop => 
      sop.title.toLowerCase().includes(searchTerm) ||
      (sop.keywords && sop.keywords.some((k: string) => k.toLowerCase().includes(searchTerm)))
    );
    
    return ok(res, {
      query: q,
      count: filtered.length,
      results: filtered
    });
  }));

  return router;
}
