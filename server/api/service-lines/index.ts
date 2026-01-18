import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, asc } from "../../lib/db";
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
import {
  serviceLines,
  clinics,
  rosterShifts,
  shiftWishes,
  longTermShiftWishes,
  employees,
  departments,
} from "@shared/schema";

const DEFAULT_SERVICE_LINES = [
  {
    key: "kreiszimmer",
    label: "Kreißzimmer (Ass.)",
    roleGroup: "ASS",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 1,
  },
  {
    key: "gyn",
    label: "Gynäkologie (OA)",
    roleGroup: "OA",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 2,
  },
  {
    key: "turnus",
    label: "Turnus (Ass./TA)",
    roleGroup: "TURNUS",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 3,
  },
  {
    key: "overduty",
    label: "Überdienst",
    roleGroup: "OA",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 4,
  },
];

const createServiceLineSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  roleGroup: z.string().min(1).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  endsNextDay: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateServiceLineSchema = createServiceLineSchema.partial();

const replaceServiceTypeInArray = (
  values: unknown,
  fromKey: string,
  toKey: string,
) => {
  if (!Array.isArray(values)) return null;
  let changed = false;
  const updated = values.map((value) => {
    if (typeof value === "string" && value === fromKey) {
      changed = true;
      return toKey;
    }
    return value;
  });
  if (!changed) return null;
  const deduped = Array.from(
    new Set(
      updated.filter((value): value is string => typeof value === "string"),
    ),
  );
  return deduped;
};

const replaceServiceTypeInRules = (
  values: unknown,
  fromKey: string,
  toKey: string,
) => {
  if (!Array.isArray(values)) return null;
  let changed = false;
  const updated = values.map((rule) => {
    if (rule && typeof rule === "object" && "serviceType" in rule) {
      const current = (rule as { serviceType?: unknown }).serviceType;
      if (current === fromKey) {
        changed = true;
        return { ...(rule as Record<string, unknown>), serviceType: toKey };
      }
    }
    return rule;
  });
  return changed ? updated : null;
};

async function ensureDefaults(clinicId: number) {
  const existing = await db
    .select()
    .from(serviceLines)
    .where(eq(serviceLines.clinicId, clinicId));
  if (existing.length > 0) return existing;

  const inserted = await db
    .insert(serviceLines)
    .values(
      DEFAULT_SERVICE_LINES.map((line) => ({
        clinicId,
        ...line,
        isActive: true,
      })),
    )
    .returning();
  return inserted;
}

async function resolveClinicId(req: any): Promise<number | null> {
  if (req.query?.clinicId) {
    const parsed = Number(req.query.clinicId);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (req.user?.clinicId) return req.user.clinicId;
  if (req.user?.departmentId) {
    const [department] = await db
      .select({ clinicId: departments.clinicId })
      .from(departments)
      .where(eq(departments.id, req.user.departmentId))
      .limit(1);
    if (department?.clinicId) {
      return department.clinicId;
    }
  }
  // Fallback: if user has no clinic/department context, but there is exactly one active clinicId in serviceLines, use it.
  const activeClinicRows = await db
    .select({ clinicId: serviceLines.clinicId })
    .from(serviceLines)
    .where(eq(serviceLines.isActive, true))
    .groupBy(serviceLines.clinicId);

  if (activeClinicRows.length === 1) {
    return activeClinicRows[0].clinicId;
  }
  return null;
}

export function registerServiceLineRoutes(router: Router) {
  /**
   * GET /api/service-lines
   * Returns service lines for the current clinic (auto-seeded if empty).
   */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (!req.user.capabilities?.includes("service_lines.read")) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }

      const clinicId = await resolveClinicId(req);
      if (!clinicId) {
        res
          .status(403)
          .json({ success: false, error: "Klinik/Abteilung fehlt" });
        return;
      }

      const seeded = await ensureDefaults(clinicId);
      const lines = await db
        .select()
        .from(serviceLines)
        .where(eq(serviceLines.clinicId, clinicId))
        .orderBy(asc(serviceLines.sortOrder), asc(serviceLines.label));

      if (!lines.length) {
        return ok(res, seeded);
      }

      return ok(res, lines);
    }),
  );

  /**
   * POST /api/service-lines
   * Create a new service line for the current clinic.
   */
  router.post(
    "/",
    validateBody(createServiceLineSchema),
    asyncHandler(async (req, res) => {
      const clinicId = await resolveClinicId(req);
      if (!clinicId) {
        return validationError(res, "Klinik-ID fehlt");
      }

      const {
        key,
        label,
        roleGroup,
        startTime,
        endTime,
        endsNextDay,
        sortOrder,
        isActive,
      } = req.body;
      const normalizedKey = typeof key === "string" ? key.trim() : "";
      if (!normalizedKey) {
        return validationError(res, "Key ist erforderlich");
      }

      const [clinic] = await db
        .select()
        .from(clinics)
        .where(eq(clinics.id, clinicId));
      if (!clinic) {
        return notFound(res, "Klinik");
      }

      const [createdLine] = await db
        .insert(serviceLines)
        .values({
          clinicId,
          key: normalizedKey,
          label,
          roleGroup: roleGroup ?? "ALL",
          startTime,
          endTime,
          endsNextDay: Boolean(endsNextDay),
          sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
          isActive: isActive !== false,
        })
        .returning();

      return created(res, createdLine);
    }),
  );

  /**
   * PATCH /api/service-lines/:id
   * Update a service line.
   */
  router.patch(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateServiceLineSchema),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const clinicId = await resolveClinicId(req);
      if (!clinicId) {
        return validationError(res, "Klinik-ID fehlt");
      }

      const [existing] = await db
        .select()
        .from(serviceLines)
        .where(
          and(eq(serviceLines.id, id), eq(serviceLines.clinicId, clinicId)),
        );
      if (!existing) {
        return notFound(res, "Dienstschiene");
      }

      const normalizedKey =
        typeof req.body.key === "string" ? req.body.key.trim() : undefined;
      const nextKey = normalizedKey || existing.key;

      if (normalizedKey && normalizedKey !== existing.key) {
        const [conflict] = await db
          .select()
          .from(serviceLines)
          .where(
            and(
              eq(serviceLines.clinicId, clinicId),
              eq(serviceLines.key, normalizedKey),
            ),
          );
        if (conflict) {
          return validationError(res, "Key ist bereits vergeben");
        }
      }

      const [updated] = await db.transaction(async (tx) => {
        if (nextKey !== existing.key) {
          await tx
            .update(rosterShifts)
            .set({ serviceType: nextKey })
            .where(eq(rosterShifts.serviceType, existing.key));

          const wishRows = await tx
            .select({
              id: shiftWishes.id,
              preferred: shiftWishes.preferredServiceTypes,
              avoid: shiftWishes.avoidServiceTypes,
            })
            .from(shiftWishes);
          for (const wish of wishRows) {
            const nextPreferred = replaceServiceTypeInArray(
              wish.preferred,
              existing.key,
              nextKey,
            );
            const nextAvoid = replaceServiceTypeInArray(
              wish.avoid,
              existing.key,
              nextKey,
            );
            if (nextPreferred || nextAvoid) {
              await tx
                .update(shiftWishes)
                .set({
                  preferredServiceTypes: nextPreferred ?? wish.preferred,
                  avoidServiceTypes: nextAvoid ?? wish.avoid,
                  updatedAt: new Date(),
                })
                .where(eq(shiftWishes.id, wish.id));
            }
          }

          const longTermRows = await tx
            .select({
              id: longTermShiftWishes.id,
              rules: longTermShiftWishes.rules,
            })
            .from(longTermShiftWishes);
          for (const entry of longTermRows) {
            const nextRules = replaceServiceTypeInRules(
              entry.rules,
              existing.key,
              nextKey,
            );
            if (nextRules) {
              await tx
                .update(longTermShiftWishes)
                .set({ rules: nextRules, updatedAt: new Date() })
                .where(eq(longTermShiftWishes.id, entry.id));
            }
          }

          const employeeRows = await tx
            .select({
              id: employees.id,
              shiftPreferences: employees.shiftPreferences,
            })
            .from(employees);
          for (const emp of employeeRows) {
            if (
              !emp.shiftPreferences ||
              typeof emp.shiftPreferences !== "object"
            ) {
              continue;
            }

            const prefs = emp.shiftPreferences as {
              serviceTypeOverrides?: unknown;
            };

            const nextOverrides = replaceServiceTypeInArray(
              prefs.serviceTypeOverrides,
              existing.key,
              nextKey,
            );

            if (!nextOverrides) {
              continue;
            }

            const updatedPrefs = {
              ...(emp.shiftPreferences as Record<string, unknown>),
              serviceTypeOverrides: nextOverrides,
            };

            await tx
              .update(employees)
              .set({ shiftPreferences: updatedPrefs, updatedAt: new Date() })
              .where(eq(employees.id, emp.id));
          }
        }

        return await tx
          .update(serviceLines)
          .set({ ...req.body, key: nextKey, updatedAt: new Date() })
          .where(eq(serviceLines.id, id))
          .returning();
      });

      return ok(res, updated);
    }),
  );

  /**
   * DELETE /api/service-lines/:id
   * Delete a service line.
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const clinicId = await resolveClinicId(req);
      if (!clinicId) {
        return validationError(res, "Klinik-ID fehlt");
      }

      const [existing] = await db
        .select()
        .from(serviceLines)
        .where(
          and(eq(serviceLines.id, id), eq(serviceLines.clinicId, clinicId)),
        );
      if (!existing) {
        return notFound(res, "Dienstschiene");
      }

      await db.delete(serviceLines).where(eq(serviceLines.id, id));
      return ok(res, { deleted: true, id });
    }),
  );
}
