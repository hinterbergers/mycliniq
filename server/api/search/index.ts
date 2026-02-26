import type { Router, Request } from "express";
import { db, eq, and, or, isNull, inArray, gte, lte, ne } from "../../lib/db";
import { ok, asyncHandler } from "../../lib/api-response";
import { requireAuth, isTechnicalAdmin } from "../middleware/auth";
import {
  employees,
  sops,
  sopMembers,
  trainingVideos,
  trainingPresentations,
  rosterShifts,
  plannedAbsences,
  weeklyPlans,
  weeklyPlanAssignments,
  dailyOverrides,
  rooms,
} from "@shared/schema";
import { getWeek, getWeekYear } from "date-fns";

const normalize = (value?: string | null) => (value ?? "").trim();

const normalizeText = (value?: string | null) =>
  normalize(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const tokenize = (q: string) =>
  normalizeText(q)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const includesAllTokens = (haystack: string, tokens: string[]) =>
  tokens.every((token) => haystack.includes(token));

const scoreMatch = (haystack: string, tokens: string[]) => {
  let score = 0;
  for (const token of tokens) {
    if (haystack.startsWith(token)) {
      score += 5;
      continue;
    }
    const wordIndex = haystack.indexOf(` ${token}`);
    if (wordIndex >= 0) {
      score += 3;
      continue;
    }
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

const formatDisplayName = (
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null,
) => {
  const first = normalize(firstName);
  const last = normalize(lastName);
  if (first && last) return `${last} ${first}`;
  if (last) return last;
  if (first) return first;
  return normalize(fallback) || "Unbekannt";
};

const WEEK_OPTIONS = {
  weekStartsOn: 1 as const,
  firstWeekContainsDate: 4 as const,
};

const parseIsoDateUtc = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateUtc = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildDateRange = (startIso: string, days: number) => {
  const base = parseIsoDateUtc(startIso);
  return Array.from({ length: days }, (_, index) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + index);
    return formatDateUtc(d);
  });
};

const toIsoWeekday = (value: Date) => ((value.getUTCDay() + 6) % 7) + 1;

const buildWeeklyPlanWorkplaceLabel = (assignment: {
  roomName?: string | null;
  roleLabel?: string | null;
}) => {
  const room = normalize(assignment.roomName);
  const roleLabel = normalize(assignment.roleLabel);
  const candidate = room || roleLabel || "";
  if (!candidate) return null;
  if (candidate.toLowerCase() === "diensthabende") return null;
  return candidate;
};

type VacationVisibilityGroup = "OA" | "ASS" | "TA" | "SEK";
const DEFAULT_VISIBILITY_GROUPS: VacationVisibilityGroup[] = [
  "OA",
  "ASS",
  "TA",
  "SEK",
];
const ROLE_GROUPS: Record<string, VacationVisibilityGroup | null> = {
  Primararzt: "OA",
  "1. Oberarzt": "OA",
  Funktionsoberarzt: "OA",
  Ausbildungsoberarzt: "OA",
  Oberarzt: "OA",
  Oberaerztin: "OA",
  Facharzt: "OA",
  Assistenzarzt: "ASS",
  Assistenzaerztin: "ASS",
  Turnusarzt: "TA",
  "Student (KPJ)": "TA",
  "Student (Famulant)": "TA",
  Sekretariat: "SEK",
};
const normalizeRole = (role?: string | null) =>
  (role ?? "")
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00c4/g, "Ae")
    .replace(/\u00d6/g, "Oe")
    .replace(/\u00dc/g, "Ue");
const resolveRoleGroup = (role?: string | null): VacationVisibilityGroup | null =>
  ROLE_GROUPS[normalizeRole(role)] ?? null;
const getVisibilityGroupsForUser = async (employeeId: number) => {
  const [employee] = await db
    .select({ shiftPreferences: employees.shiftPreferences })
    .from(employees)
    .where(eq(employees.id, employeeId));
  const prefs = employee?.shiftPreferences as {
    vacationVisibilityRoleGroups?: VacationVisibilityGroup[];
  } | null;
  const groups = Array.isArray(prefs?.vacationVisibilityRoleGroups)
    ? prefs.vacationVisibilityRoleGroups.filter(Boolean)
    : [];
  return groups.length ? groups : DEFAULT_VISIBILITY_GROUPS;
};

const canViewTraining = (req: Request) =>
  Boolean(
    req.user &&
      (req.user.trainingEnabled ||
        req.user.isAdmin ||
        isTechnicalAdmin(req)),
  );

const canManageSops = (req: Request) =>
  Boolean(
    req.user &&
      (req.user.isAdmin ||
        req.user.appRole === "Admin" ||
        isTechnicalAdmin(req) ||
        req.user.capabilities.includes("perm.sop_manage") ||
        req.user.capabilities.includes("perm.sop_publish") ||
        req.user.capabilities.includes("sop.manage") ||
        req.user.capabilities.includes("sop.publish")),
  );

export function registerSearchRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/global",
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? "");
      const limitParam = Number(req.query.limit);
      const perGroupLimit = Number.isFinite(limitParam)
        ? Math.min(Math.max(Math.floor(limitParam), 1), 20)
        : 6;
      const tokens = tokenize(q);

      if (!req.user || tokens.length === 0) {
        return ok(res, {
          query: normalize(q),
          groups: {
            sops: [],
            videos: [],
            presentations: [],
            people: [],
          },
          counts: { sops: 0, videos: 0, presentations: 0, people: 0 },
        });
      }

      const user = req.user;

      const [publicSops, ownOrMemberSops, creatorRows, peopleRows, videoRows, presentationRows] =
        await Promise.all([
          db
            .select({
              id: sops.id,
              title: sops.title,
              category: sops.category,
              version: sops.version,
              status: sops.status,
              contentMarkdown: sops.contentMarkdown,
              keywords: sops.keywords,
              createdById: sops.createdById,
              createdAt: sops.createdAt,
              updatedAt: sops.updatedAt,
            })
            .from(sops)
            .where(
              canManageSops(req)
                ? isNull(sops.archivedAt)
                : and(isNull(sops.archivedAt), eq(sops.status, "published")),
            ),
          canManageSops(req)
            ? Promise.resolve([])
            : db
                .select({
                  id: sops.id,
                  title: sops.title,
                  category: sops.category,
                  version: sops.version,
                  status: sops.status,
                  contentMarkdown: sops.contentMarkdown,
                  keywords: sops.keywords,
                  createdById: sops.createdById,
                  createdAt: sops.createdAt,
                  updatedAt: sops.updatedAt,
                })
                .from(sops)
                .leftJoin(sopMembers, eq(sopMembers.sopId, sops.id))
                .where(
                  and(
                    isNull(sops.archivedAt),
                    or(
                      eq(sops.createdById, user.employeeId),
                      eq(sopMembers.employeeId, user.employeeId),
                    ),
                  ),
                ),
          db
            .select({
              id: employees.id,
              firstName: employees.firstName,
              lastName: employees.lastName,
              name: employees.name,
            })
            .from(employees),
          db
            .select({
              id: employees.id,
              firstName: employees.firstName,
              lastName: employees.lastName,
              name: employees.name,
              role: employees.role,
              email: employees.email,
              emailPrivate: employees.emailPrivate,
              phoneWork: employees.phoneWork,
              phonePrivate: employees.phonePrivate,
              showPrivateContact: employees.showPrivateContact,
              isActive: employees.isActive,
            })
            .from(employees)
            .where(eq(employees.isActive, true)),
          canViewTraining(req)
            ? db
                .select({
                  id: trainingVideos.id,
                  title: trainingVideos.title,
                  platform: trainingVideos.platform,
                  keywords: trainingVideos.keywords,
                  isActive: trainingVideos.isActive,
                  createdAt: trainingVideos.createdAt,
                })
                .from(trainingVideos)
                .where(eq(trainingVideos.isActive, true))
            : Promise.resolve([]),
          canViewTraining(req)
            ? db
                .select({
                  id: trainingPresentations.id,
                  title: trainingPresentations.title,
                  mimeType: trainingPresentations.mimeType,
                  keywords: trainingPresentations.keywords,
                  isActive: trainingPresentations.isActive,
                  createdAt: trainingPresentations.createdAt,
                })
                .from(trainingPresentations)
                .where(eq(trainingPresentations.isActive, true))
            : Promise.resolve([]),
        ]);

      const creatorById = new Map(
        creatorRows.map((row) => [
          row.id,
          formatDisplayName(row.firstName, row.lastName, row.name),
        ]),
      );

      const sopMap = new Map<number, (typeof publicSops)[number]>();
      [...publicSops, ...ownOrMemberSops].forEach((row) => sopMap.set(row.id, row));
      const sopRows = [...sopMap.values()];

      const sopHits = sopRows
        .map((sop) => {
          const title = normalize(sop.title);
          const keywordText = (sop.keywords ?? []).join(" ");
          const contentText = normalize(sop.contentMarkdown);
          const searchable = normalizeText(`${title} ${keywordText} ${contentText}`);
          if (!includesAllTokens(searchable, tokens)) return null;
          return {
            id: sop.id,
            type: "sop" as const,
            title: sop.title,
            subtitle: [sop.category || "SOP", sop.version || null]
              .filter(Boolean)
              .join(" • "),
            keywords: sop.keywords ?? [],
            url: `/wissen?q=${encodeURIComponent(normalize(q))}&sopId=${sop.id}`,
            score:
              scoreMatch(normalizeText(title), tokens) * 4 +
              scoreMatch(normalizeText(keywordText), tokens) * 2 +
              scoreMatch(searchable, tokens),
            createdById: sop.createdById ?? null,
            createdByLabel: sop.createdById
              ? creatorById.get(sop.createdById) ?? null
              : null,
            createdByCurrentUser: sop.createdById === user.employeeId,
            createdAt: sop.createdAt,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b!.score - a!.score) || a!.title.localeCompare(b!.title))
        .slice(0, perGroupLimit) as Array<any>;

      const videoHits = videoRows
        .map((video) => {
          const title = normalize(video.title);
          const keywordText = (video.keywords ?? []).join(" ");
          const searchable = normalizeText(`${title} ${keywordText}`);
          if (!includesAllTokens(searchable, tokens)) return null;
          return {
            id: video.id,
            type: "video" as const,
            title: video.title,
            subtitle: video.platform || "Video",
            keywords: video.keywords ?? [],
            url: `/fortbildung/videos?q=${encodeURIComponent(normalize(q))}&videoId=${video.id}`,
            score:
              scoreMatch(normalizeText(title), tokens) * 4 +
              scoreMatch(normalizeText(keywordText), tokens) * 2,
            createdById: null,
            createdByLabel: null,
            createdByCurrentUser: false,
            createdAt: video.createdAt,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b!.score - a!.score) || a!.title.localeCompare(b!.title))
        .slice(0, perGroupLimit) as Array<any>;

      const presentationHits = presentationRows
        .map((presentation) => {
          const title = normalize(presentation.title);
          const keywordText = (presentation.keywords ?? []).join(" ");
          const searchable = normalizeText(`${title} ${keywordText}`);
          if (!includesAllTokens(searchable, tokens)) return null;
          return {
            id: presentation.id,
            type: "presentation" as const,
            title: presentation.title,
            subtitle: presentation.mimeType || "Praesentation",
            keywords: presentation.keywords ?? [],
            url: `/fortbildung/presentations?q=${encodeURIComponent(normalize(q))}&presentationId=${presentation.id}`,
            score:
              scoreMatch(normalizeText(title), tokens) * 4 +
              scoreMatch(normalizeText(keywordText), tokens) * 2,
            createdById: null,
            createdByLabel: null,
            createdByCurrentUser: false,
            createdAt: presentation.createdAt,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b!.score - a!.score) || a!.title.localeCompare(b!.title))
        .slice(0, perGroupLimit) as Array<any>;

      const peopleHits = peopleRows
        .map((person) => {
          const displayName = formatDisplayName(
            person.firstName,
            person.lastName,
            person.name,
          );
          const searchable = normalizeText(
            `${displayName} ${person.role ?? ""} ${person.email ?? ""} ${person.phoneWork ?? ""}`,
          );
          if (!includesAllTokens(searchable, tokens)) return null;

          // Global search must respect the employee's visibility toggle.
          // Own profile may still see private entries.
          const canSeePrivate =
            person.id === user.employeeId || Boolean(person.showPrivateContact);

          return {
            id: person.id,
            type: "person" as const,
            displayName,
            role: person.role ?? null,
            url: `/einstellungen/${person.id}`,
            score:
              scoreMatch(normalizeText(displayName), tokens) * 5 +
              scoreMatch(searchable, tokens),
            contacts: {
              email: normalize(person.email) || null,
              phoneWork: normalize(person.phoneWork) || null,
              emailPrivate: canSeePrivate ? normalize(person.emailPrivate) || null : null,
              phonePrivate: canSeePrivate ? normalize(person.phonePrivate) || null : null,
              showPrivateContact: Boolean(person.showPrivateContact),
            },
            preview: {
              status: "pending",
              message:
                "2-Wochen-Dienste, Abwesenheiten und Arbeitsplaetze werden im naechsten Schritt als Personen-Vorschau ergänzt.",
            },
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b!.score - a!.score) || a!.displayName.localeCompare(b!.displayName))
        .slice(0, perGroupLimit) as Array<any>;

      return ok(res, {
        query: normalize(q),
        groups: {
          sops: sopHits,
          videos: videoHits,
          presentations: presentationHits,
          people: peopleHits,
        },
        counts: {
          sops: sopHits.length,
          videos: videoHits.length,
          presentations: presentationHits.length,
          people: peopleHits.length,
        },
      });
    }),
  );

  router.get(
    "/people/:id/preview",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return ok(res, { success: false });
      }
      const employeeId = Number(req.params.id);
      if (!Number.isFinite(employeeId)) {
        return ok(res, { days: [], duties: [], workplaces: [], absences: [], visibility: { absences: false } });
      }
      const daysParam = Number(req.query.days);
      const days = Number.isFinite(daysParam)
        ? Math.min(Math.max(Math.floor(daysParam), 1), 21)
        : 14;

      const today = formatDateUtc(new Date());
      const dates = buildDateRange(today, days);
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      const [targetEmployee] = await db
        .select({
          id: employees.id,
          role: employees.role,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(eq(employees.id, employeeId));

      if (!targetEmployee) {
        return ok(res, {
          days: dates,
          duties: [],
          workplaces: [],
          absences: [],
          visibility: { absences: false },
        });
      }

      const previewMeta = dates.map((date) => {
        const isoDate = new Date(`${date}T00:00:00Z`);
        const weekYear = getWeekYear(isoDate, WEEK_OPTIONS);
        const weekNumber = getWeek(isoDate, WEEK_OPTIONS);
        const isoDay = toIsoWeekday(isoDate);
        return {
          date,
          weekYear,
          weekNumber,
          isoDay,
          weekKey: `${weekYear}-${weekNumber}`,
        };
      });

      const uniqueWeeks = Array.from(new Set(previewMeta.map((m) => m.weekKey)));
      const weeklyPlanRows = await Promise.all(
        uniqueWeeks.map(async (key) => {
          const [yearStr, weekStr] = key.split("-");
          const [plan] = await db
            .select({ id: weeklyPlans.id, year: weeklyPlans.year, weekNumber: weeklyPlans.weekNumber })
            .from(weeklyPlans)
            .where(
              and(
                eq(weeklyPlans.year, Number(yearStr)),
                eq(weeklyPlans.weekNumber, Number(weekStr)),
              ),
            )
            .limit(1);
          return plan
            ? { ...plan, key }
            : null;
        }),
      );
      const weeklyPlanByKey = new Map(
        weeklyPlanRows
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => [row.key, row]),
      );

      const relevantPlanIds = Array.from(weeklyPlanByKey.values()).map((p) => p.id);
      const assignments = relevantPlanIds.length
        ? await db
            .select({
              weeklyPlanId: weeklyPlanAssignments.weeklyPlanId,
              roomId: weeklyPlanAssignments.roomId,
              weekday: weeklyPlanAssignments.weekday,
              employeeId: weeklyPlanAssignments.employeeId,
              roleLabel: weeklyPlanAssignments.roleLabel,
              roomName: rooms.name,
            })
            .from(weeklyPlanAssignments)
            .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
            .where(inArray(weeklyPlanAssignments.weeklyPlanId, relevantPlanIds))
        : [];

      const overrides = await db
        .select({
          date: dailyOverrides.date,
          roomId: dailyOverrides.roomId,
          originalEmployeeId: dailyOverrides.originalEmployeeId,
          newEmployeeId: dailyOverrides.newEmployeeId,
          roomName: rooms.name,
        })
        .from(dailyOverrides)
        .leftJoin(rooms, eq(dailyOverrides.roomId, rooms.id))
        .where(
          and(
            gte(dailyOverrides.date, startDate),
            lte(dailyOverrides.date, endDate),
            or(
              eq(dailyOverrides.originalEmployeeId, employeeId),
              eq(dailyOverrides.newEmployeeId, employeeId),
            ),
          ),
        );

      const dutyRows = await db
        .select({
          id: rosterShifts.id,
          date: rosterShifts.date,
          serviceType: rosterShifts.serviceType,
          isDraft: rosterShifts.isDraft,
        })
        .from(rosterShifts)
        .where(
          and(
            eq(rosterShifts.employeeId, employeeId),
            eq(rosterShifts.isDraft, false),
            gte(rosterShifts.date, startDate),
            lte(rosterShifts.date, endDate),
          ),
        );

      const canSeeAbsences =
        req.user.employeeId === employeeId ||
        req.user.isAdmin ||
        isTechnicalAdmin(req) ||
        (() => false)();

      let absencesVisible = canSeeAbsences;
      if (!absencesVisible) {
        const allowedGroups = await getVisibilityGroupsForUser(req.user.employeeId);
        const targetGroup = resolveRoleGroup(targetEmployee.role ?? null);
        absencesVisible = Boolean(targetGroup && allowedGroups.includes(targetGroup));
      }

      const absenceRows = absencesVisible
        ? await db
            .select({
              id: plannedAbsences.id,
              startDate: plannedAbsences.startDate,
              endDate: plannedAbsences.endDate,
              reason: plannedAbsences.reason,
              status: plannedAbsences.status,
            })
            .from(plannedAbsences)
            .where(
              and(
                eq(plannedAbsences.employeeId, employeeId),
                ne(plannedAbsences.status, "Abgelehnt"),
                lte(plannedAbsences.startDate, endDate),
                gte(plannedAbsences.endDate, startDate),
              ),
            )
        : [];

      const planKeyById = new Map<number, string>();
      weeklyPlanByKey.forEach((plan, key) => {
        planKeyById.set(plan.id, key);
      });

      const assignmentsByDayKey = new Map<
        string,
        Array<{ roomId: number; roleLabel: string | null; roomName: string | null }>
      >();
      assignments.forEach((row) => {
        if (row.employeeId !== employeeId) return;
        const weekKey = planKeyById.get(row.weeklyPlanId);
        if (!weekKey) return;
        const dayKey = `${weekKey}-${row.weekday}`;
        const list = assignmentsByDayKey.get(dayKey) ?? [];
        list.push({
          roomId: row.roomId,
          roleLabel: row.roleLabel ?? null,
          roomName: row.roomName ?? null,
        });
        assignmentsByDayKey.set(dayKey, list);
      });

      const overridesByDate = new Map<string, typeof overrides>();
      overrides.forEach((row) => {
        const list = overridesByDate.get(String(row.date)) ?? [];
        list.push(row);
        overridesByDate.set(String(row.date), list);
      });

      const workplaces = previewMeta.flatMap((meta) => {
        const dayKey = `${meta.weekKey}-${meta.isoDay}`;
        const base = [...(assignmentsByDayKey.get(dayKey) ?? [])];
        const dayOverrides = overridesByDate.get(meta.date) ?? [];

        const removedRoomIds = new Set<number>();
        const added: Array<{ roomId: number; roomName: string | null; roleLabel: string | null }> = [];
        dayOverrides.forEach((ovr) => {
          if (ovr.originalEmployeeId === employeeId) {
            removedRoomIds.add(ovr.roomId);
          }
          if (ovr.newEmployeeId === employeeId) {
            added.push({
              roomId: ovr.roomId,
              roomName: ovr.roomName ?? null,
              roleLabel: null,
            });
          }
        });

        const effective = [
          ...base.filter((item) => !removedRoomIds.has(item.roomId)),
          ...added,
        ];

        const unique = new Map<string, { label: string; roomName: string | null }>();
        effective.forEach((item) => {
          const label = buildWeeklyPlanWorkplaceLabel(item);
          if (!label) return;
          if (!unique.has(label)) {
            unique.set(label, { label, roomName: item.roomName ?? null });
          }
        });

        return Array.from(unique.values()).map((item) => ({
          date: meta.date,
          workplace: item.label,
          roomName: item.roomName,
        }));
      });

      const duties = dutyRows
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((row) => ({
          id: row.id,
          date: String(row.date),
          serviceType: row.serviceType,
        }));

      const absences = absenceRows
        .slice()
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
        .map((row) => ({
          id: row.id,
          startDate: String(row.startDate),
          endDate: String(row.endDate),
          reason: row.reason,
          status: row.status,
        }));

      return ok(res, {
        days: dates,
        duties,
        workplaces,
        absences,
        visibility: {
          absences: absencesVisible,
        },
      });
    }),
  );
}
