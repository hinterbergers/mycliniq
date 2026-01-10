import type { Router } from "express";
import { z } from "zod";
import { db, eq, and } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  validationError,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import { vacationRules, departments, competencies } from "@shared/schema";

const ruleTypeEnum = z.enum([
  "role_min",
  "competency_min",
  "total_min",
  "training_priority",
]);
const roleGroupEnum = z.enum(["ASS", "OA", "TA"]);

const createRuleSchema = z.object({
  departmentId: z.number().positive().optional(),
  ruleType: ruleTypeEnum,
  minCount: z.number().int().min(0),
  roleGroup: roleGroupEnum.optional().nullable(),
  competencyId: z.number().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const updateRuleSchema = createRuleSchema.partial().extend({
  ruleType: ruleTypeEnum.optional(),
});

const canViewRules = (reqUser: Express.Request["user"]) => {
  if (!reqUser) return false;
  if (reqUser.isAdmin) return true;
  return (
    reqUser.capabilities?.includes("vacation.lock") ||
    reqUser.capabilities?.includes("vacation.approve")
  );
};

const canManageRules = (reqUser: Express.Request["user"]) => {
  if (!reqUser) return false;
  if (reqUser.isAdmin) return true;
  return reqUser.capabilities?.includes("vacation.lock") ?? false;
};

const resolveDepartmentId = (
  reqUser: Express.Request["user"],
  requested?: number | null,
) => {
  if (requested) return requested;
  return reqUser?.departmentId;
};

const validateRuleDefinition = (payload: z.infer<typeof createRuleSchema>) => {
  if (payload.ruleType === "role_min" && !payload.roleGroup) {
    return "Rollen-Gruppe ist erforderlich";
  }
  if (payload.ruleType === "competency_min" && !payload.competencyId) {
    return "Kompetenz ist erforderlich";
  }
  return null;
};

export function registerVacationRuleRoutes(router: Router) {
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!canViewRules(req.user)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const requestedDepartmentId = req.query.departmentId
        ? Number(req.query.departmentId)
        : null;
      const departmentId = resolveDepartmentId(req.user, requestedDepartmentId);

      if (!departmentId) {
        return validationError(res, "Abteilung fehlt");
      }

      const rules = await db
        .select()
        .from(vacationRules)
        .where(eq(vacationRules.departmentId, departmentId));

      return ok(res, rules);
    }),
  );

  router.post(
    "/",
    validateBody(createRuleSchema),
    asyncHandler(async (req, res) => {
      if (!canManageRules(req.user)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const payload = req.body as z.infer<typeof createRuleSchema>;
      const departmentId = resolveDepartmentId(
        req.user,
        payload.departmentId ?? null,
      );
      if (!departmentId) {
        return validationError(res, "Abteilung fehlt");
      }

      const ruleError = validateRuleDefinition(payload);
      if (ruleError) {
        return validationError(res, ruleError);
      }

      const [department] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, departmentId));
      if (!department) {
        return notFound(res, "Abteilung");
      }

      if (payload.competencyId) {
        const [competency] = await db
          .select({ id: competencies.id })
          .from(competencies)
          .where(eq(competencies.id, payload.competencyId));
        if (!competency) {
          return notFound(res, "Kompetenz");
        }
      }

      const [createdRule] = await db
        .insert(vacationRules)
        .values({
          departmentId,
          ruleType: payload.ruleType,
          minCount: payload.minCount,
          roleGroup: payload.roleGroup ?? null,
          competencyId: payload.competencyId ?? null,
          isActive: payload.isActive ?? true,
          notes: payload.notes ?? null,
          createdById: req.user?.employeeId ?? null,
          updatedById: req.user?.employeeId ?? null,
        })
        .returning();

      return created(res, createdRule);
    }),
  );

  router.patch(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateRuleSchema),
    asyncHandler(async (req, res) => {
      if (!canManageRules(req.user)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const ruleId = Number(req.params.id);
      const payload = req.body as z.infer<typeof updateRuleSchema>;

      const [existing] = await db
        .select()
        .from(vacationRules)
        .where(eq(vacationRules.id, ruleId));

      if (!existing) {
        return notFound(res, "Regel");
      }

      const departmentId = resolveDepartmentId(
        req.user,
        payload.departmentId ?? existing.departmentId,
      );
      if (!departmentId) {
        return validationError(res, "Abteilung fehlt");
      }

      const normalizedPayload = {
        ...payload,
        departmentId,
        ruleType: payload.ruleType ?? existing.ruleType,
        minCount:
          typeof payload.minCount === "number"
            ? payload.minCount
            : existing.minCount,
        roleGroup: payload.roleGroup ?? existing.roleGroup ?? null,
        competencyId:
          typeof payload.competencyId === "number"
            ? payload.competencyId
            : existing.competencyId,
        isActive:
          typeof payload.isActive === "boolean"
            ? payload.isActive
            : existing.isActive,
        notes:
          typeof payload.notes === "string" || payload.notes === null
            ? payload.notes
            : existing.notes,
      };

      const ruleError = validateRuleDefinition(
        normalizedPayload as z.infer<typeof createRuleSchema>,
      );
      if (ruleError) {
        return validationError(res, ruleError);
      }

      if (normalizedPayload.competencyId) {
        const [competency] = await db
          .select({ id: competencies.id })
          .from(competencies)
          .where(eq(competencies.id, normalizedPayload.competencyId));
        if (!competency) {
          return notFound(res, "Kompetenz");
        }
      }

      const [updated] = await db
        .update(vacationRules)
        .set({
          departmentId: normalizedPayload.departmentId,
          ruleType: normalizedPayload.ruleType,
          minCount: normalizedPayload.minCount,
          roleGroup: normalizedPayload.roleGroup,
          competencyId: normalizedPayload.competencyId,
          isActive: normalizedPayload.isActive,
          notes: normalizedPayload.notes ?? null,
          updatedById: req.user?.employeeId ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vacationRules.id, ruleId),
            eq(vacationRules.departmentId, existing.departmentId),
          ),
        )
        .returning();

      if (!updated) {
        return notFound(res, "Regel");
      }

      return ok(res, updated);
    }),
  );

  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManageRules(req.user)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const ruleId = Number(req.params.id);
      const [existing] = await db
        .select({ id: vacationRules.id })
        .from(vacationRules)
        .where(eq(vacationRules.id, ruleId));

      if (!existing) {
        return notFound(res, "Regel");
      }

      await db.delete(vacationRules).where(eq(vacationRules.id, ruleId));
      return ok(res, { deleted: true, id: ruleId });
    }),
  );

  return router;
}
