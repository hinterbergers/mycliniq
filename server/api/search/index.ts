import type { Router, Request } from "express";
import { db, eq, and, or, isNull } from "../../lib/db";
import { ok, asyncHandler } from "../../lib/api-response";
import { requireAuth, isTechnicalAdmin } from "../middleware/auth";
import {
  employees,
  sops,
  sopMembers,
  trainingVideos,
  trainingPresentations,
} from "@shared/schema";

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
            url: `/wissen?q=${encodeURIComponent(normalize(q))}`,
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
            url: `/fortbildung/videos?q=${encodeURIComponent(normalize(q))}`,
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
            url: `/fortbildung/presentations?q=${encodeURIComponent(normalize(q))}`,
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

          const canSeePrivate =
            person.id === user.employeeId ||
            user.isAdmin ||
            isTechnicalAdmin(req) ||
            Boolean(person.showPrivateContact);

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
}
