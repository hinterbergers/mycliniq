import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { and, eq } from "../server/lib/db";
import { db } from "../server/db";
import { sopVersions, sops } from "../shared/schema";

type FixtureEntry = {
  title: string;
  version: string;
  status: "published" | "proposed" | "in_progress" | "review" | "archived";
  contentMarkdown: string;
  createdAt: string;
  publishedAt: string | null;
  createdById: number;
  approvedById: number | null;
  versionNumber: number;
  changeNote: string | null;
  releasedAt: string;
  releasedById: number;
};

const FIXTURE_PATH =
  process.argv.find((arg) => arg.startsWith("--fixture="))?.split("=")[1] ??
  path.resolve("script/fixtures/dienstanweisungen.json");

const DRY_RUN = process.argv.includes("--dry-run");

async function loadFixture() {
  const raw = await fs.promises.readFile(FIXTURE_PATH, "utf8");
  const parsed = JSON.parse(raw) as FixtureEntry[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Fixture leer oder ungueltig: ${FIXTURE_PATH}`);
  }
  return parsed;
}

async function upsertDienstanweisung(entry: FixtureEntry) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: sops.id,
        currentVersionId: sops.currentVersionId,
      })
      .from(sops)
      .where(
        and(
          eq(sops.category, "Dienstanweisung"),
          eq(sops.title, entry.title),
        ),
      )
      .limit(1);

    const baseValues = {
      title: entry.title,
      category: "Dienstanweisung" as const,
      version: entry.version,
      status: entry.status,
      contentMarkdown: entry.contentMarkdown,
      createdById: entry.createdById,
      approvedById: entry.approvedById,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.createdAt),
      publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : null,
    };

    let sopId = existing?.id;

    if (!existing) {
      const [inserted] = await tx.insert(sops).values(baseValues).returning({
        id: sops.id,
      });
      sopId = inserted.id;
    } else {
      await tx
        .update(sops)
        .set(baseValues)
        .where(eq(sops.id, existing.id));
    }

    if (!sopId) {
      throw new Error(`Konnte SOP-ID fuer ${entry.title} nicht bestimmen`);
    }

    const [existingVersion] = await tx
      .select({
        id: sopVersions.id,
      })
      .from(sopVersions)
      .where(
        and(
          eq(sopVersions.sopId, sopId),
          eq(sopVersions.versionNumber, entry.versionNumber),
        ),
      )
      .limit(1);

    let versionId = existingVersion?.id;
    const versionValues = {
      sopId,
      versionNumber: entry.versionNumber,
      title: entry.title,
      contentMarkdown: entry.contentMarkdown,
      changeNote: entry.changeNote,
      releasedById: entry.releasedById,
      releasedAt: new Date(entry.releasedAt),
    };

    if (!existingVersion) {
      const [insertedVersion] = await tx
        .insert(sopVersions)
        .values(versionValues)
        .returning({ id: sopVersions.id });
      versionId = insertedVersion.id;
    } else {
      await tx
        .update(sopVersions)
        .set(versionValues)
        .where(eq(sopVersions.id, existingVersion.id));
    }

    await tx
      .update(sops)
      .set({
        currentVersionId: versionId ?? null,
      })
      .where(eq(sops.id, sopId));

    return { sopId, versionId };
  });
}

async function main() {
  const fixture = await loadFixture();

  if (DRY_RUN) {
    console.log(`Dry-Run: ${fixture.length} Dienstanweisungen aus Fixture.`);
    for (const entry of fixture) {
      console.log(
        `${entry.createdAt} | ${entry.title} | ${entry.status} | v${entry.version}`,
      );
    }
    return;
  }

  for (const entry of fixture) {
    const result = await upsertDienstanweisung(entry);
    console.log(`Synchronisiert: ${entry.title} -> SOP ${result.sopId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
