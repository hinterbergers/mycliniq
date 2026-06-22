import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, asc, desc, inArray, ne } from "../../lib/db";
import {
  asyncHandler,
  created,
  forbidden,
  notFound,
  ok,
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import {
  employees,
  notifications,
  plannedAbsences,
  educationEventRequests,
  educationEvents,
  educationImportUploads,
  educationMentorAssignments,
  educationModules,
  educationProfiles,
  educationPrograms,
  educationProgress,
  educationRequirements,
} from "@shared/schema";
import {
  requireAuth,
  requireEducationTrainer,
} from "../middleware/auth";

const evaluationTypeValues = [
  "count",
  "count_level",
  "procedure",
  "case_log",
  "time_period",
  "binary_signoff",
  "certificate",
  "course",
  "exam",
  "upload",
  "audit",
  "center_requirement",
] as const;

const progressStatusValues = [
  "offen",
  "begonnen",
  "ziel_erreicht",
  "bestaetigt",
  "abgelaufen",
] as const;

const programSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  slug: z.string().min(1, "Slug erforderlich").optional(),
  description: z.string().optional(),
  targetRole: z.string().optional(),
  isActive: z.boolean().optional(),
});

const moduleSchema = z.object({
  programId: z.number().int().positive(),
  title: z.string().min(1, "Titel erforderlich"),
  slug: z.string().min(1, "Slug erforderlich").optional(),
  description: z.string().optional(),
  targetRole: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const requirementSchema = z.object({
  moduleId: z.number().int().positive(),
  title: z.string().min(1, "Titel erforderlich"),
  code: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  evaluationType: z.enum(evaluationTypeValues).optional(),
  requiredCount: z.number().int().min(0),
  unitLabel: z.string().min(1).optional(),
  targetLevel: z.number().int().min(0).max(5).nullable().optional(),
  timeScope: z.string().optional(),
  requiresUpload: z.boolean().optional(),
  requiresTrainerSignoff: z.boolean().optional(),
  roleTrackingEnabled: z.boolean().optional(),
  roleOptions: z.array(z.string()).optional(),
  countingRule: z.string().optional(),
  fieldConfig: z.record(z.string(), z.any()).optional(),
  matchingHints: z.array(z.string()).optional(),
  sourceReference: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const progressSchema = z.object({
  employeeId: z.number().int().positive(),
  requirementId: z.number().int().positive(),
  completedCount: z.number().int().min(0),
  verifiedCount: z.number().int().min(0),
  currentLevel: z.number().int().min(0).max(5).nullable().optional(),
  status: z.enum(progressStatusValues).optional(),
  notes: z.string().optional(),
  lastEntryLabel: z.string().optional(),
  lastEntryRole: z.string().optional(),
  lastEntryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const mentorAssignmentSchema = z.object({
  trainerEmployeeId: z.number().int().positive(),
  traineeEmployeeId: z.number().int().positive(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const profileSchema = z.object({
  employeeId: z.number().int().positive(),
  trainingStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  basicTrainingCompleted: z.boolean().optional(),
  expectedTrainingEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  examPassed: z.boolean().optional(),
  notes: z.string().optional(),
});

const eventSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  eventType: z.string().min(1).optional(),
  location: z.string().optional(),
  externalUrl: z.string().url("Bitte gueltigen Link eingeben").optional().or(z.literal("")),
  description: z.string().optional(),
  targetRole: z.string().optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxApprovals: z.number().int().min(1).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

const eventInterestSchema = z.object({
  interestNote: z.string().optional(),
});

const eventDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  decisionNote: z.string().optional(),
  costCoveredByDepartment: z.boolean().optional(),
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

const traineeRoleMatchers = ["assistenz", "turnus", "kpj", "famul"];

const overlapsDateRange = (
  leftStart: string | Date,
  leftEnd: string | Date,
  rightStart: string | Date,
  rightEnd: string | Date,
) => {
  const aStart = new Date(leftStart);
  const aEnd = new Date(leftEnd);
  const bStart = new Date(rightStart);
  const bEnd = new Date(rightEnd);
  return aStart <= bEnd && bStart <= aEnd;
};

const countInclusiveDays = (start: string | Date, end: string | Date) => {
  const from = new Date(start);
  const to = new Date(end);
  const startUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const endUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.floor((endUtc - startUtc) / 86400000) + 1);
};

const buildEmployeeDisplayName = (employee?: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}) =>
  [employee?.lastName, employee?.firstName]
    .filter(Boolean)
    .join(" ")
    .trim() || employee?.name || "Unbekannt";

const getRequirementTarget = (requirement: {
  requiredCount?: number | null;
  targetLevel?: number | null;
  evaluationType?: string | null;
}) => {
  const hasCountTarget = Number(requirement.requiredCount ?? 0) > 0;
  const hasLevelTarget = Number.isFinite(requirement.targetLevel ?? null);

  if (hasCountTarget && hasLevelTarget) {
    return 2;
  }
  if (hasCountTarget || hasLevelTarget) {
    return 1;
  }
  if (requirement.evaluationType === "binary_signoff") {
    return 1;
  }
  return 0;
};

const getRequirementProgress = (
  requirement: {
    requiredCount?: number | null;
    targetLevel?: number | null;
    evaluationType?: string | null;
    requiresTrainerSignoff?: boolean | null;
  },
  progress?: {
    completedCount?: number | null;
    verifiedCount?: number | null;
    currentLevel?: number | null;
    status?: string | null;
  } | null,
) => {
  const targetCount = Math.max(0, Number(requirement.requiredCount ?? 0));
  const targetLevel = Number.isFinite(requirement.targetLevel ?? null)
    ? Number(requirement.targetLevel ?? 0)
    : null;
  const completedCount = Math.max(0, Number(progress?.completedCount ?? 0));
  const verifiedCount = Math.max(0, Number(progress?.verifiedCount ?? 0));
  const currentLevel = Number.isFinite(progress?.currentLevel ?? null)
    ? Number(progress?.currentLevel ?? 0)
    : 0;
  const status = String(progress?.status ?? "offen");
  const hasCountTarget = targetCount > 0;
  const hasLevelTarget = targetLevel !== null && targetLevel > 0;

  let completedParts = 0;
  let verifiedParts = 0;
  let targetParts = 0;

  if (hasCountTarget) {
    targetParts += 1;
    completedParts += Math.min(1, completedCount / targetCount);
    verifiedParts += Math.min(1, verifiedCount / targetCount);
  }

  if (hasLevelTarget) {
    targetParts += 1;
    completedParts += Math.min(1, currentLevel / targetLevel);
    verifiedParts += Math.min(1, currentLevel / targetLevel);
  }

  if (!hasCountTarget && !hasLevelTarget) {
    targetParts = getRequirementTarget(requirement);
    if (targetParts > 0) {
      const isDone =
        status === "ziel_erreicht" ||
        status === "bestaetigt" ||
        verifiedCount > 0 ||
        completedCount > 0;
      completedParts = isDone ? targetParts : 0;
      verifiedParts =
        status === "bestaetigt" ||
        (!requirement.requiresTrainerSignoff && isDone) ||
        verifiedCount > 0
          ? targetParts
          : 0;
    }
  }

  return {
    targetParts,
    completedParts,
    verifiedParts,
    completedFraction:
      targetParts > 0 ? Math.min(1, completedParts / targetParts) : 0,
    verifiedFraction:
      targetParts > 0 ? Math.min(1, verifiedParts / targetParts) : 0,
  };
};

async function readDepartmentEducationEvents(
  departmentId: number,
  includeDraft = false,
) {
  const rows = await db
    .select()
    .from(educationEvents)
    .where(
      includeDraft
        ? eq(educationEvents.departmentId, departmentId)
        : and(
            eq(educationEvents.departmentId, departmentId),
            eq(educationEvents.status, "published"),
          ),
    )
    .orderBy(desc(educationEvents.startsAt), asc(educationEvents.title));
  return rows;
}

async function readEventRequestMetrics(
  employeeId: number,
  departmentId: number,
  startsAt: string | Date,
  endsAt: string | Date,
) {
  const year = new Date(startsAt).getFullYear();
  const fortbildungRows = await db
    .select({
      startDate: plannedAbsences.startDate,
      endDate: plannedAbsences.endDate,
      status: plannedAbsences.status,
    })
    .from(plannedAbsences)
    .where(
      and(
        eq(plannedAbsences.employeeId, employeeId),
        eq(plannedAbsences.reason, "Fortbildung"),
        ne(plannedAbsences.status, "Abgelehnt"),
        eq(plannedAbsences.year, year),
      ),
    );

  const consumedFortbildungDays = fortbildungRows.reduce(
    (sum, row) => sum + countInclusiveDays(row.startDate, row.endDate),
    0,
  );

  const overlappingDepartmentAbsences = await db
    .select({
      absenceId: plannedAbsences.id,
      employeeId: plannedAbsences.employeeId,
      startDate: plannedAbsences.startDate,
      endDate: plannedAbsences.endDate,
    })
    .from(plannedAbsences)
    .innerJoin(employees, eq(employees.id, plannedAbsences.employeeId))
    .where(
      and(
        eq(employees.departmentId, departmentId),
        ne(plannedAbsences.status, "Abgelehnt"),
      ),
    );

  const absentInPeriodCount = overlappingDepartmentAbsences.filter(
    (row) =>
      row.employeeId !== employeeId &&
      overlapsDateRange(row.startDate, row.endDate, startsAt, endsAt),
  ).length;

  return {
    consumedFortbildungDays,
    absentInPeriodCount,
  };
}

async function readCatalog(departmentId: number) {
  const programs = await db
    .select()
    .from(educationPrograms)
    .where(eq(educationPrograms.departmentId, departmentId))
    .orderBy(asc(educationPrograms.title));

  const programIds = programs.map((program) => program.id);
  const modules = programIds.length
    ? await db
        .select()
        .from(educationModules)
        .where(inArray(educationModules.programId, programIds))
        .orderBy(asc(educationModules.sortOrder), asc(educationModules.title))
    : [];

  const moduleIds = modules.map((module) => module.id);
  const requirements = moduleIds.length
    ? await db
        .select()
        .from(educationRequirements)
        .where(inArray(educationRequirements.moduleId, moduleIds))
        .orderBy(
          asc(educationRequirements.sortOrder),
          asc(educationRequirements.title),
        )
    : [];

  const requirementsByModule = new Map<number, typeof requirements>();
  requirements.forEach((requirement) => {
    const bucket = requirementsByModule.get(requirement.moduleId) ?? [];
    bucket.push(requirement);
    requirementsByModule.set(requirement.moduleId, bucket);
  });

  const modulesByProgram = new Map<number, Array<(typeof modules)[number] & {
    requirements: typeof requirements;
  }>>();
  modules.forEach((module) => {
    const bucket = modulesByProgram.get(module.programId) ?? [];
    bucket.push({
      ...module,
      requirements: requirementsByModule.get(module.id) ?? [],
    });
    modulesByProgram.set(module.programId, bucket);
  });

  return programs.map((program) => ({
    ...program,
    modules: modulesByProgram.get(program.id) ?? [],
  }));
}

async function readProgressSummary(
  employeeIds: number[],
  requirements: Array<{
    id: number;
    requiredCount?: number | null;
    targetLevel?: number | null;
    evaluationType?: string | null;
    requiresTrainerSignoff?: boolean | null;
  }>,
) {
  const requirementIds = requirements.map((item) => item.id);
  if (!employeeIds.length || !requirementIds.length) {
    return new Map<
      number,
      {
        completedParts: number;
        verifiedParts: number;
        targetParts: number;
        completedRequirements: number;
        verifiedRequirements: number;
      }
    >();
  }

  const progressRows = await db
    .select()
    .from(educationProgress)
    .where(
      and(
        inArray(educationProgress.employeeId, employeeIds),
        inArray(educationProgress.requirementId, requirementIds),
      ),
    );

  const summary = new Map<
    number,
    {
      completedParts: number;
      verifiedParts: number;
      targetParts: number;
      completedRequirements: number;
      verifiedRequirements: number;
    }
  >();

  employeeIds.forEach((employeeId) => {
    const current = {
      completedParts: 0,
      verifiedParts: 0,
      targetParts: 0,
      completedRequirements: 0,
      verifiedRequirements: 0,
    };

    requirements.forEach((requirement) => {
      const progress = progressRows.find(
        (row) =>
          row.employeeId === employeeId && row.requirementId === requirement.id,
      );
      const requirementProgress = getRequirementProgress(requirement, progress);
      current.completedParts += requirementProgress.completedParts;
      current.verifiedParts += requirementProgress.verifiedParts;
      current.targetParts += requirementProgress.targetParts;
      if (requirementProgress.completedFraction >= 1) {
        current.completedRequirements += 1;
      }
      if (requirementProgress.verifiedFraction >= 1) {
        current.verifiedRequirements += 1;
      }
    });

    summary.set(employeeId, current);
  });
  return summary;
}

export function registerEducationRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/catalog",
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) {
        return ok(res, []);
      }
      const catalog = await readCatalog(req.user.departmentId);
      return ok(res, catalog);
    }),
  );

  router.post(
    "/programs",
    requireEducationTrainer,
    validateBody(programSchema),
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) {
        return forbidden(res, "Keine Abteilung im Benutzerkontext");
      }

      const payload = req.body as z.infer<typeof programSchema>;
      const [program] = await db
        .insert(educationPrograms)
        .values({
          departmentId: req.user.departmentId,
          title: payload.title.trim(),
          slug: slugify(payload.slug?.trim() || payload.title),
          description: payload.description?.trim() || null,
          targetRole: payload.targetRole?.trim() || null,
          isActive: payload.isActive ?? true,
          createdById: req.user.employeeId,
          updatedById: req.user.employeeId,
        })
        .returning();

      return created(res, program);
    }),
  );

  router.patch(
    "/programs/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    validateBody(programSchema.partial()),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const payload = req.body as Partial<z.infer<typeof programSchema>>;
      const [updated] = await db
        .update(educationPrograms)
        .set({
          ...(payload.title ? { title: payload.title.trim() } : {}),
          ...(payload.slug ? { slug: slugify(payload.slug) } : {}),
          ...(typeof payload.description !== "undefined"
            ? { description: payload.description?.trim() || null }
            : {}),
          ...(typeof payload.targetRole !== "undefined"
            ? { targetRole: payload.targetRole?.trim() || null }
            : {}),
          ...(typeof payload.isActive === "boolean"
            ? { isActive: payload.isActive }
            : {}),
          updatedById: req.user?.employeeId,
          updatedAt: new Date(),
        })
        .where(eq(educationPrograms.id, id))
        .returning();

      if (!updated) return notFound(res, "Ausbildungsprogramm");
      return ok(res, updated);
    }),
  );

  router.delete(
    "/programs/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const [deleted] = await db
        .delete(educationPrograms)
        .where(eq(educationPrograms.id, id))
        .returning();
      if (!deleted) return notFound(res, "Ausbildungsprogramm");
      return ok(res, deleted);
    }),
  );

  router.post(
    "/modules",
    requireEducationTrainer,
    validateBody(moduleSchema),
    asyncHandler(async (req, res) => {
      const payload = req.body as z.infer<typeof moduleSchema>;
      const [module] = await db
        .insert(educationModules)
        .values({
          programId: payload.programId,
          title: payload.title.trim(),
          slug: slugify(payload.slug?.trim() || payload.title),
          description: payload.description?.trim() || null,
          targetRole: payload.targetRole?.trim() || null,
          sortOrder: payload.sortOrder ?? 0,
          isActive: payload.isActive ?? true,
        })
        .returning();
      return created(res, module);
    }),
  );

  router.patch(
    "/modules/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    validateBody(moduleSchema.partial()),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const payload = req.body as Partial<z.infer<typeof moduleSchema>>;
      const [updated] = await db
        .update(educationModules)
        .set({
          ...(payload.programId ? { programId: payload.programId } : {}),
          ...(payload.title ? { title: payload.title.trim() } : {}),
          ...(payload.slug ? { slug: slugify(payload.slug) } : {}),
          ...(typeof payload.description !== "undefined"
            ? { description: payload.description?.trim() || null }
            : {}),
          ...(typeof payload.targetRole !== "undefined"
            ? { targetRole: payload.targetRole?.trim() || null }
            : {}),
          ...(typeof payload.sortOrder === "number"
            ? { sortOrder: payload.sortOrder }
            : {}),
          ...(typeof payload.isActive === "boolean"
            ? { isActive: payload.isActive }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(educationModules.id, id))
        .returning();
      if (!updated) return notFound(res, "Ausbildungsmodul");
      return ok(res, updated);
    }),
  );

  router.delete(
    "/modules/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const [deleted] = await db
        .delete(educationModules)
        .where(eq(educationModules.id, id))
        .returning();
      if (!deleted) return notFound(res, "Ausbildungsmodul");
      return ok(res, deleted);
    }),
  );

  router.post(
    "/requirements",
    requireEducationTrainer,
    validateBody(requirementSchema),
    asyncHandler(async (req, res) => {
      const payload = req.body as z.infer<typeof requirementSchema>;
      const [requirement] = await db
        .insert(educationRequirements)
        .values({
          moduleId: payload.moduleId,
          title: payload.title.trim(),
          code: payload.code?.trim() || null,
          description: payload.description?.trim() || null,
          category: payload.category?.trim() || null,
          evaluationType: payload.evaluationType ?? "count",
          requiredCount: payload.requiredCount,
          unitLabel: payload.unitLabel?.trim() || "Anzahl",
          targetLevel: payload.targetLevel ?? null,
          timeScope: payload.timeScope?.trim() || null,
          requiresUpload: payload.requiresUpload ?? false,
          requiresTrainerSignoff: payload.requiresTrainerSignoff ?? true,
          roleTrackingEnabled: payload.roleTrackingEnabled ?? false,
          roleOptions: payload.roleOptions ?? [],
          countingRule: payload.countingRule?.trim() || null,
          fieldConfig: payload.fieldConfig ?? {},
          matchingHints:
            payload.matchingHints?.map((hint) => hint.trim()).filter(Boolean) ?? [],
          sourceReference: payload.sourceReference?.trim() || null,
          sortOrder: payload.sortOrder ?? 0,
          isActive: payload.isActive ?? true,
        })
        .returning();
      return created(res, requirement);
    }),
  );

  router.patch(
    "/requirements/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    validateBody(requirementSchema.partial()),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const payload = req.body as Partial<z.infer<typeof requirementSchema>>;
      const [updated] = await db
        .update(educationRequirements)
        .set({
          ...(payload.moduleId ? { moduleId: payload.moduleId } : {}),
          ...(payload.title ? { title: payload.title.trim() } : {}),
          ...(typeof payload.code !== "undefined"
            ? { code: payload.code?.trim() || null }
            : {}),
          ...(typeof payload.description !== "undefined"
            ? { description: payload.description?.trim() || null }
            : {}),
          ...(typeof payload.category !== "undefined"
            ? { category: payload.category?.trim() || null }
            : {}),
          ...(typeof payload.evaluationType !== "undefined"
            ? { evaluationType: payload.evaluationType }
            : {}),
          ...(typeof payload.requiredCount === "number"
            ? { requiredCount: payload.requiredCount }
            : {}),
          ...(typeof payload.unitLabel !== "undefined"
            ? { unitLabel: payload.unitLabel?.trim() || "Anzahl" }
            : {}),
          ...(typeof payload.targetLevel !== "undefined"
            ? { targetLevel: payload.targetLevel ?? null }
            : {}),
          ...(typeof payload.timeScope !== "undefined"
            ? { timeScope: payload.timeScope?.trim() || null }
            : {}),
          ...(typeof payload.requiresUpload === "boolean"
            ? { requiresUpload: payload.requiresUpload }
            : {}),
          ...(typeof payload.requiresTrainerSignoff === "boolean"
            ? { requiresTrainerSignoff: payload.requiresTrainerSignoff }
            : {}),
          ...(typeof payload.roleTrackingEnabled === "boolean"
            ? { roleTrackingEnabled: payload.roleTrackingEnabled }
            : {}),
          ...(typeof payload.roleOptions !== "undefined"
            ? { roleOptions: payload.roleOptions ?? [] }
            : {}),
          ...(typeof payload.countingRule !== "undefined"
            ? { countingRule: payload.countingRule?.trim() || null }
            : {}),
          ...(typeof payload.fieldConfig !== "undefined"
            ? { fieldConfig: payload.fieldConfig ?? {} }
            : {}),
          ...(typeof payload.matchingHints !== "undefined"
            ? {
                matchingHints: payload.matchingHints
                  ?.map((hint) => hint.trim())
                  .filter(Boolean) ?? [],
              }
            : {}),
          ...(typeof payload.sourceReference !== "undefined"
            ? { sourceReference: payload.sourceReference?.trim() || null }
            : {}),
          ...(typeof payload.sortOrder === "number"
            ? { sortOrder: payload.sortOrder }
            : {}),
          ...(typeof payload.isActive === "boolean"
            ? { isActive: payload.isActive }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(educationRequirements.id, id))
        .returning();
      if (!updated) return notFound(res, "Anforderung");
      return ok(res, updated);
    }),
  );

  router.delete(
    "/requirements/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const [deleted] = await db
        .delete(educationRequirements)
        .where(eq(educationRequirements.id, id))
        .returning();
      if (!deleted) return notFound(res, "Anforderung");
      return ok(res, deleted);
    }),
  );

  router.get(
    "/profiles",
    requireEducationTrainer,
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) return ok(res, []);

      const [employeeRows, profileRows] = await Promise.all([
        db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            role: employees.role,
            appRole: employees.appRole,
          })
          .from(employees)
          .where(eq(employees.departmentId, req.user.departmentId))
          .orderBy(asc(employees.lastName), asc(employees.firstName)),
        db.select().from(educationProfiles),
      ]);

      const profileMap = new Map(profileRows.map((row) => [row.employeeId, row]));

      return ok(
        res,
        employeeRows.map((employee) => ({
          employee,
          profile: profileMap.get(employee.id) ?? null,
        })),
      );
    }),
  );

  router.post(
    "/profiles",
    requireEducationTrainer,
    validateBody(profileSchema),
    asyncHandler(async (req, res) => {
      const payload = req.body as z.infer<typeof profileSchema>;
      const examDate = payload.examDate ?? null;
      const isPastExam =
        typeof examDate === "string" && new Date(examDate) < new Date(new Date().toDateString());
      const examPassed = isPastExam ? Boolean(payload.examPassed) : false;

      const [existing] = await db
        .select()
        .from(educationProfiles)
        .where(eq(educationProfiles.employeeId, payload.employeeId))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(educationProfiles)
          .set({
            trainingStartDate: payload.trainingStartDate ?? null,
            basicTrainingCompleted: Boolean(payload.basicTrainingCompleted),
            expectedTrainingEndDate: payload.expectedTrainingEndDate ?? null,
            examDate,
            examPassed,
            notes: payload.notes?.trim() || null,
            updatedById: req.user?.employeeId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(educationProfiles.id, existing.id))
          .returning();
        return ok(res, updated);
      }

      const [createdProfile] = await db
        .insert(educationProfiles)
        .values({
          employeeId: payload.employeeId,
          trainingStartDate: payload.trainingStartDate ?? null,
          basicTrainingCompleted: Boolean(payload.basicTrainingCompleted),
          expectedTrainingEndDate: payload.expectedTrainingEndDate ?? null,
          examDate,
          examPassed,
          notes: payload.notes?.trim() || null,
          updatedById: req.user?.employeeId ?? null,
        })
        .returning();
      return created(res, createdProfile);
    }),
  );

  router.get(
    "/mentor-assignments",
    requireEducationTrainer,
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select()
        .from(educationMentorAssignments)
        .orderBy(asc(educationMentorAssignments.createdAt));
      return ok(res, rows);
    }),
  );

  router.post(
    "/mentor-assignments",
    requireEducationTrainer,
    validateBody(mentorAssignmentSchema),
    asyncHandler(async (req, res) => {
      const payload = req.body as z.infer<typeof mentorAssignmentSchema>;
      const [existing] = await db
        .select()
        .from(educationMentorAssignments)
        .where(
          and(
            eq(
              educationMentorAssignments.trainerEmployeeId,
              payload.trainerEmployeeId,
            ),
            eq(
              educationMentorAssignments.traineeEmployeeId,
              payload.traineeEmployeeId,
            ),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(educationMentorAssignments)
          .set({
            notes: payload.notes?.trim() || null,
            isActive: payload.isActive ?? true,
            assignedById: req.user?.employeeId,
            updatedAt: new Date(),
          })
          .where(eq(educationMentorAssignments.id, existing.id))
          .returning();
        return ok(res, updated);
      }

      const [createdAssignment] = await db
        .insert(educationMentorAssignments)
        .values({
          trainerEmployeeId: payload.trainerEmployeeId,
          traineeEmployeeId: payload.traineeEmployeeId,
          notes: payload.notes?.trim() || null,
          isActive: payload.isActive ?? true,
          assignedById: req.user?.employeeId,
        })
        .returning();
      return created(res, createdAssignment);
    }),
  );

  router.post(
    "/progress",
    requireEducationTrainer,
    validateBody(progressSchema),
    asyncHandler(async (req, res) => {
      const payload = req.body as z.infer<typeof progressSchema>;
      const [existing] = await db
        .select()
        .from(educationProgress)
        .where(
          and(
            eq(educationProgress.employeeId, payload.employeeId),
            eq(educationProgress.requirementId, payload.requirementId),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(educationProgress)
          .set({
            completedCount: payload.completedCount,
            verifiedCount: payload.verifiedCount,
            currentLevel: payload.currentLevel ?? null,
            status: payload.status ?? "offen",
            notes: payload.notes?.trim() || null,
            lastEntryLabel: payload.lastEntryLabel?.trim() || null,
            lastEntryRole: payload.lastEntryRole?.trim() || null,
            lastEntryDate: payload.lastEntryDate ?? null,
            metadata: payload.metadata ?? {},
            lastActivityAt: new Date(),
            updatedById: req.user?.employeeId,
            updatedAt: new Date(),
          })
          .where(eq(educationProgress.id, existing.id))
          .returning();
        return ok(res, updated);
      }

      const [createdProgress] = await db
        .insert(educationProgress)
        .values({
          employeeId: payload.employeeId,
          requirementId: payload.requirementId,
          completedCount: payload.completedCount,
          verifiedCount: payload.verifiedCount,
          currentLevel: payload.currentLevel ?? null,
          status: payload.status ?? "offen",
          notes: payload.notes?.trim() || null,
          lastEntryLabel: payload.lastEntryLabel?.trim() || null,
          lastEntryRole: payload.lastEntryRole?.trim() || null,
          lastEntryDate: payload.lastEntryDate ?? null,
          metadata: payload.metadata ?? {},
          lastActivityAt: new Date(),
          updatedById: req.user?.employeeId,
        })
        .returning();
      return created(res, createdProgress);
    }),
  );

  router.get(
    "/trainees",
    requireEducationTrainer,
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) {
        return ok(res, { trainees: [], trainers: [], assignments: [], catalog: [] });
      }

      const [catalog, traineeRows, trainerRows, assignments] = await Promise.all([
        readCatalog(req.user.departmentId),
        db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            role: employees.role,
            appRole: employees.appRole,
          })
          .from(employees)
          .where(eq(employees.departmentId, req.user.departmentId))
          .orderBy(asc(employees.lastName), asc(employees.firstName)),
        db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            role: employees.role,
            appRole: employees.appRole,
          })
          .from(employees)
          .where(eq(employees.departmentId, req.user.departmentId))
          .orderBy(asc(employees.lastName), asc(employees.firstName)),
        db
          .select()
          .from(educationMentorAssignments)
          .where(eq(educationMentorAssignments.isActive, true)),
      ]);

      const allRequirements = catalog.flatMap((program) =>
        program.modules.flatMap((module) => module.requirements),
      );
      const requirementIds = allRequirements.map((item) => item.id);
      const totalRequirements = allRequirements.length;

      const trainees = traineeRows.filter((row) =>
        traineeRoleMatchers.some((matcher) =>
          String(row.role ?? "").toLowerCase().includes(matcher),
        ),
      );
      const trainers = trainerRows.filter(
        (row) => row.appRole === "Ausbilder" || row.appRole === "Admin",
      );

      const traineeIds = trainees.map((row) => row.id);
      const [summaryMap, progressRows] = await Promise.all([
        readProgressSummary(traineeIds, allRequirements),
        traineeIds.length && requirementIds.length
          ? db
              .select()
              .from(educationProgress)
              .where(
                and(
                  inArray(educationProgress.employeeId, traineeIds),
                  inArray(educationProgress.requirementId, requirementIds),
                ),
              )
          : Promise.resolve([]),
      ]);

      const traineePayload = trainees.map((trainee) => {
        const summary = summaryMap.get(trainee.id) ?? {
          completedParts: 0,
          verifiedParts: 0,
          targetParts: 0,
          completedRequirements: 0,
          verifiedRequirements: 0,
        };
        return {
          ...trainee,
          summary: {
            completed: summary.completedRequirements,
            verified: summary.verifiedRequirements,
            totalRequired: totalRequirements,
            completedParts: summary.completedParts,
            verifiedParts: summary.verifiedParts,
            targetParts: summary.targetParts,
            completionPercent:
              summary.targetParts > 0
                ? Math.min(
                    100,
                    Math.round((summary.verifiedParts / summary.targetParts) * 100),
                  )
                : 0,
          },
        };
      });

      return ok(res, {
        trainees: traineePayload,
        trainers,
        assignments,
        catalog,
        progress: progressRows,
      });
    }),
  );

  router.get(
    "/events",
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) {
        return ok(res, []);
      }
      const includeDraft = Boolean(req.user) && req.user.appRole === "Ausbilder"
        ? true
        : Boolean(req.user?.isAdmin || req.user?.systemRole !== "employee");
      const events = await readDepartmentEducationEvents(
        req.user.departmentId,
        includeDraft,
      );
      return ok(res, events);
    }),
  );

  router.post(
    "/events",
    requireEducationTrainer,
    validateBody(eventSchema),
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) {
        return forbidden(res, "Keine Abteilung im Benutzerkontext");
      }
      const payload = req.body as z.infer<typeof eventSchema>;
      const [event] = await db
        .insert(educationEvents)
        .values({
          departmentId: req.user.departmentId,
          title: payload.title.trim(),
          eventType: payload.eventType?.trim() || "Fortbildung",
          location: payload.location?.trim() || null,
          externalUrl: payload.externalUrl?.trim() || null,
          description: payload.description?.trim() || null,
          targetRole: payload.targetRole?.trim() || null,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          maxApprovals: payload.maxApprovals ?? null,
          status: payload.status ?? "published",
          createdById: req.user.employeeId,
          updatedById: req.user.employeeId,
        })
        .returning();
      return created(res, event);
    }),
  );

  router.patch(
    "/events/:id",
    requireEducationTrainer,
    validateParams(idParamSchema),
    validateBody(eventSchema.partial()),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const payload = req.body as Partial<z.infer<typeof eventSchema>>;
      const [event] = await db
        .update(educationEvents)
        .set({
          ...(payload.title ? { title: payload.title.trim() } : {}),
          ...(typeof payload.eventType !== "undefined"
            ? { eventType: payload.eventType?.trim() || "Fortbildung" }
            : {}),
          ...(typeof payload.location !== "undefined"
            ? { location: payload.location?.trim() || null }
            : {}),
          ...(typeof payload.externalUrl !== "undefined"
            ? { externalUrl: payload.externalUrl?.trim() || null }
            : {}),
          ...(typeof payload.description !== "undefined"
            ? { description: payload.description?.trim() || null }
            : {}),
          ...(typeof payload.targetRole !== "undefined"
            ? { targetRole: payload.targetRole?.trim() || null }
            : {}),
          ...(typeof payload.startsAt !== "undefined"
            ? { startsAt: payload.startsAt }
            : {}),
          ...(typeof payload.endsAt !== "undefined"
            ? { endsAt: payload.endsAt }
            : {}),
          ...(typeof payload.maxApprovals !== "undefined"
            ? { maxApprovals: payload.maxApprovals ?? null }
            : {}),
          ...(typeof payload.status !== "undefined" ? { status: payload.status } : {}),
          updatedById: req.user?.employeeId,
          updatedAt: new Date(),
        })
        .where(eq(educationEvents.id, id))
        .returning();
      if (!event) return notFound(res, "Fortbildung");
      return ok(res, event);
    }),
  );

  router.post(
    "/events/:id/request",
    validateParams(idParamSchema),
    validateBody(eventInterestSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const payload = req.body as z.infer<typeof eventInterestSchema>;
      const [event] = await db
        .select()
        .from(educationEvents)
        .where(eq(educationEvents.id, id))
        .limit(1);
      if (!event) return notFound(res, "Fortbildung");
      if (event.status !== "published") {
        return forbidden(res, "Diese Fortbildung ist aktuell nicht freigegeben");
      }
      const [existing] = await db
        .select()
        .from(educationEventRequests)
        .where(
          and(
            eq(educationEventRequests.eventId, id),
            eq(educationEventRequests.employeeId, req.user!.employeeId),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(educationEventRequests)
          .set({
            status: "interested",
            interestNote: payload.interestNote?.trim() || null,
            updatedAt: new Date(),
          })
          .where(eq(educationEventRequests.id, existing.id))
          .returning();
        return ok(res, updated);
      }

      const [createdRequest] = await db
        .insert(educationEventRequests)
        .values({
          eventId: id,
          employeeId: req.user!.employeeId,
          requestedById: req.user!.employeeId,
          interestNote: payload.interestNote?.trim() || null,
          status: "interested",
        })
        .returning();
      return created(res, createdRequest);
    }),
  );

  router.get(
    "/event-requests",
    requireEducationTrainer,
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) return ok(res, []);
      const events = await readDepartmentEducationEvents(req.user.departmentId, true);
      const eventIds = events.map((event) => event.id);
      if (!eventIds.length) return ok(res, []);

      const requests = await db
        .select()
        .from(educationEventRequests)
        .where(inArray(educationEventRequests.eventId, eventIds))
        .orderBy(desc(educationEventRequests.createdAt));

      const employeeIds = [...new Set(requests.map((request) => request.employeeId))];
      const employeeRows = employeeIds.length
        ? await db
            .select({
              id: employees.id,
              firstName: employees.firstName,
              lastName: employees.lastName,
              role: employees.role,
            })
            .from(employees)
            .where(inArray(employees.id, employeeIds))
        : [];
      const employeeMap = new Map(employeeRows.map((row) => [row.id, row]));

      const items = await Promise.all(
        requests.map(async (request) => {
          const event = events.find((row) => row.id === request.eventId);
          if (!event) return null;
          const employee = employeeMap.get(request.employeeId);
          const metrics = await readEventRequestMetrics(
            request.employeeId,
            req.user!.departmentId!,
            event.startsAt,
            event.endsAt,
          );
          const approvedCount = requests.filter(
            (row) => row.eventId === request.eventId && row.status === "approved",
          ).length;
          return {
            ...request,
            event,
            employee,
            metrics: {
              ...metrics,
              approvedCount,
            },
          };
        }),
      );

      return ok(res, items.filter(Boolean));
    }),
  );

  router.post(
    "/event-requests/:id/decision",
    requireEducationTrainer,
    validateParams(idParamSchema),
    validateBody(eventDecisionSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const payload = req.body as z.infer<typeof eventDecisionSchema>;
      const [requestRow] = await db
        .select()
        .from(educationEventRequests)
        .where(eq(educationEventRequests.id, id))
        .limit(1);
      if (!requestRow) return notFound(res, "Fortbildungsanfrage");

      const [event] = await db
        .select()
        .from(educationEvents)
        .where(eq(educationEvents.id, requestRow.eventId))
        .limit(1);
      if (!event) return notFound(res, "Fortbildung");

      let linkedPlannedAbsenceId = requestRow.linkedPlannedAbsenceId ?? null;
      if (payload.status === "approved") {
        const year = new Date(event.startsAt).getFullYear();
        const month = new Date(event.startsAt).getMonth() + 1;
        if (linkedPlannedAbsenceId) {
          await db
            .update(plannedAbsences)
            .set({
              year,
              month,
              startDate: event.startsAt,
              endDate: event.endsAt,
              reason: "Fortbildung",
              status: "Genehmigt",
              isApproved: true,
              approvedById: req.user?.employeeId ?? null,
              notes: event.title,
              updatedAt: new Date(),
            })
            .where(eq(plannedAbsences.id, linkedPlannedAbsenceId));
        } else {
          const [absence] = await db
            .insert(plannedAbsences)
            .values({
              employeeId: requestRow.employeeId,
              year,
              month,
              startDate: event.startsAt,
              endDate: event.endsAt,
              reason: "Fortbildung",
              notes: event.title,
              status: "Genehmigt",
              isApproved: true,
              approvedById: req.user?.employeeId ?? null,
              createdById: req.user?.employeeId ?? null,
            })
            .returning();
          linkedPlannedAbsenceId = absence.id;
        }
      } else if (linkedPlannedAbsenceId) {
        await db
          .update(plannedAbsences)
          .set({
            status: "Abgelehnt",
            isApproved: false,
            approvedById: req.user?.employeeId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(plannedAbsences.id, linkedPlannedAbsenceId));
      }

      const [updated] = await db
        .update(educationEventRequests)
        .set({
          status: payload.status,
          decisionNote: payload.decisionNote?.trim() || null,
          costCoveredByDepartment:
            payload.status === "approved"
              ? Boolean(payload.costCoveredByDepartment)
              : false,
          decidedById: req.user?.employeeId ?? null,
          decidedAt: new Date(),
          linkedPlannedAbsenceId,
          updatedAt: new Date(),
        })
        .where(eq(educationEventRequests.id, id))
        .returning();

      await db.insert(notifications).values({
        recipientId: requestRow.employeeId,
        type: "system",
        title:
          payload.status === "approved"
            ? "Fortbildung genehmigt"
            : "Fortbildung nicht genehmigt",
        message:
          payload.status === "approved"
            ? `${event.title} wurde genehmigt.${payload.costCoveredByDepartment ? " Die Kosten werden von der Abteilung übernommen." : ""}`
            : `${event.title} wurde aktuell nicht genehmigt.`,
        link: "/ausbildung",
        metadata: {
          kind: "education_event_decision",
          eventId: event.id,
          requestId: updated.id,
          costCoveredByDepartment: updated.costCoveredByDepartment,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        },
      });

      return ok(res, updated);
    }),
  );

  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      if (!req.user?.departmentId) {
        return ok(res, {
          catalog: [],
          progress: [],
          uploads: [],
          events: [],
          eventRequests: [],
          summary: { completed: 0, verified: 0, totalRequired: 0, completionPercent: 0 },
        });
      }

      const [catalog, events] = await Promise.all([
        readCatalog(req.user.departmentId),
        readDepartmentEducationEvents(req.user.departmentId, false),
      ]);
      const requirements = catalog.flatMap((program) =>
        program.modules.flatMap((module) => module.requirements),
      );
      const requirementIds = requirements.map((item) => item.id);
      const progress = requirementIds.length
        ? await db
            .select()
            .from(educationProgress)
            .where(
              and(
                eq(educationProgress.employeeId, req.user.employeeId),
                inArray(educationProgress.requirementId, requirementIds),
              ),
            )
        : [];
      const uploads = await db
        .select()
        .from(educationImportUploads)
        .where(eq(educationImportUploads.employeeId, req.user.employeeId))
        .orderBy(asc(educationImportUploads.createdAt));
      const eventRequests = await db
        .select()
        .from(educationEventRequests)
        .where(eq(educationEventRequests.employeeId, req.user.employeeId))
        .orderBy(desc(educationEventRequests.createdAt));

      const summary = requirements.reduce(
        (acc, requirement) => {
          const progressRow =
            progress.find((row) => row.requirementId === requirement.id) ?? null;
          const rowSummary = getRequirementProgress(requirement, progressRow);
          acc.completedParts += rowSummary.completedParts;
          acc.verifiedParts += rowSummary.verifiedParts;
          acc.targetParts += rowSummary.targetParts;
          if (rowSummary.completedFraction >= 1) acc.completedRequirements += 1;
          if (rowSummary.verifiedFraction >= 1) acc.verifiedRequirements += 1;
          return acc;
        },
        {
          completedParts: 0,
          verifiedParts: 0,
          targetParts: 0,
          completedRequirements: 0,
          verifiedRequirements: 0,
        },
      );

      return ok(res, {
        employeeRole: req.user.role ?? null,
        catalog,
        progress,
        uploads,
        events,
        eventRequests,
        summary: {
          completed: summary.completedRequirements,
          verified: summary.verifiedRequirements,
          totalRequired: requirements.length,
          completedParts: summary.completedParts,
          verifiedParts: summary.verifiedParts,
          targetParts: summary.targetParts,
          completionPercent:
            summary.targetParts > 0
              ? Math.min(
                  100,
                  Math.round((summary.verifiedParts / summary.targetParts) * 100),
                )
              : 0,
        },
      });
    }),
  );
}
