import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  employees,
  resources,
  clinics,
  departments,
  permissions,
  sops,
  sopVersions,
  sopReferences,
  projectInitiatives,
  projectMembers,
  notifications
} from "@shared/schema";

const TEAM_DATA = [
  { 
    name: "PD Dr. Johannes Lermann", 
    role: "Primararzt" as const, 
    competencies: ["Senior Mamma Surgeon", "Endometriose", "Gyn-Onkologie", "Geburtshilfe", "Urogynäkologie"], 
    email: "johannes.lermann@kabeg.at"
  },
  { 
    name: "Dr. Stefan Hinterberger", 
    role: "1. Oberarzt" as const, 
    competencies: ["Gynäkologische Chirurgie", "Geburtshilfe", "ÖGUM I", "Dysplasie"], 
    email: "stefan.hinterberger@kabeg.at"
  },
  { 
    name: "Dr. Janos Gellen", 
    role: "Oberarzt" as const, 
    competencies: ["ÖGUM II"]
  },
  { 
    name: "Dr. Andreja Gornjec", 
    role: "Oberärztin" as const, 
    competencies: ["Gyn-Onkologie", "Dysplasie"]
  },
  { 
    name: "Dr. Christoph Herbst", 
    role: "Oberarzt" as const, 
    competencies: ["ÖGUM I", "Geburtshilfe"]
  },
  { 
    name: "Dr. Kerstin Herzog", 
    role: "Oberärztin" as const, 
    competencies: ["Allgemeine Gynäkologie"]
  },
  { 
    name: "Dr. Martina Krenn", 
    role: "Oberärztin" as const, 
    competencies: ["Allgemeine Gynäkologie", "Mamma"]
  },
  { 
    name: "Dr. Kristin Köck", 
    role: "Oberärztin" as const, 
    competencies: ["Mamma", "Allgemeine Gynäkologie"]
  },
  { 
    name: "Dr. Barbara Markota", 
    role: "Oberärztin" as const, 
    competencies: ["ÖGUM II", "Geburtshilfe", "Gynäkologische Chirurgie"]
  },
  { 
    name: "Dr. Marlene Waschnig", 
    role: "Oberärztin" as const, 
    competencies: ["Allgemeine Gynäkologie", "Mamma Ambulanz"]
  },
  { 
    name: "Dr. Lucia Gerhold", 
    role: "Oberärztin" as const, 
    competencies: ["Gynäkologische Chirurgie", "Geburtshilfe", "Dysplasie"]
  },
  { 
    name: "Dr. Lukas Dullnig", 
    role: "Assistenzarzt" as const, 
    competencies: []
  },
  { 
    name: "Dr. Lena Gruber", 
    role: "Assistenzärztin" as const, 
    competencies: []
  },
  { 
    name: "Dr. Jelizaveta Gurmane", 
    role: "Assistenzärztin" as const, 
    competencies: []
  },
  { 
    name: "Dr. Isabel Krauss", 
    role: "Assistenzärztin" as const, 
    competencies: ["Dysplasie"]
  },
  { 
    name: "Dr. Katharina Lesnik", 
    role: "Assistenzärztin" as const, 
    competencies: ["Dysplasie"]
  },
  { 
    name: "Dr. Magdalena Rosenkranz", 
    role: "Assistenzärztin" as const, 
    competencies: ["Kindergynäkologie"]
  },
  { 
    name: "Dr. Anna Sellner", 
    role: "Assistenzärztin" as const, 
    competencies: ["Dysplasie", "Urogynäkologie"]
  },
  { 
    name: "Dr. Magdalena Stöger", 
    role: "Assistenzärztin" as const, 
    competencies: []
  }
];

const RESOURCES_DATA = [
  { name: "Kreißsaal 1", category: "Geburtshilfe", isAvailable: true },
  { name: "Kreißsaal 2", category: "Geburtshilfe", isAvailable: true },
  { name: "OP 1", category: "OP", isAvailable: true },
  { name: "OP 2", category: "OP", isAvailable: true },
  { name: "Ambulanz Gyn", category: "Ambulanz", isAvailable: true },
  { name: "Mamma Ambulanz", category: "Ambulanz", isAvailable: true }
];

async function seed() {
  try {
    console.log("Seeding database...");
    
    // Seed clinic
    const [clinic] = await db.insert(clinics).values({
      name: "Klinikum Klagenfurt",
      slug: "klinikum-klagenfurt",
      timezone: "Europe/Vienna",
      country: "AT",
      state: "AT-2"
    }).returning();
    console.log("✓ Seeded clinic");
    
    // Seed department
    const [department] = await db.insert(departments).values({
      clinicId: clinic.id,
      name: "Gynäkologie und Geburtshilfe",
      slug: "gyn-geb"
    }).returning();
    console.log("✓ Seeded department");
    
    // Seed permissions
    const permissionData = [
      { key: "users.manage", label: "Kann Benutzer anlegen / verwalten", scope: "department" },
      { key: "dutyplan.edit", label: "Kann Dienstplan bearbeiten", scope: "department" },
      { key: "dutyplan.publish", label: "Kann Dienstplan freigeben", scope: "department" },
      { key: "vacation.lock", label: "Kann Urlaubsplanung bearbeiten (Sperrzeitraum)", scope: "department" },
      { key: "vacation.approve", label: "Kann Urlaub freigeben", scope: "department" },
      { key: "absence.create", label: "Kann Abwesenheiten eintragen", scope: "department" },
      { key: "perm.sop_manage", label: "Kann SOPs verwalten", scope: "department" },
      { key: "perm.sop_publish", label: "Kann SOPs freigeben", scope: "department" },
      { key: "perm.project_manage", label: "Kann Projekte verwalten", scope: "department" },
      { key: "perm.project_delete", label: "Kann Projekte loeschen", scope: "department" },
      { key: "perm.message_group_manage", label: "Kann Gruppen verwalten", scope: "department" },
      { key: "training.edit", label: "Kann Ausbildungsplan bearbeiten", scope: "department" }
    ];
    
    for (const perm of permissionData) {
      await db.insert(permissions).values(perm);
    }
    console.log(`✓ Seeded ${permissionData.length} permissions`);
    
    // Seed employees with department
    for (const emp of TEAM_DATA) {
      await db.insert(employees).values({
        ...emp,
        departmentId: department.id
      });
    }
    console.log(`✓ Seeded ${TEAM_DATA.length} employees`);
    
    // Seed resources
    for (const res of RESOURCES_DATA) {
      await db.insert(resources).values(res);
    }
    console.log(`✓ Seeded ${RESOURCES_DATA.length} resources`);

    const [fallbackEmployee] = await db
      .select({ id: employees.id })
      .from(employees)
      .limit(1);
    const [defaultOwner] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, "stefan.hinterberger@kabeg.at"))
      .limit(1);
    const [defaultPublisher] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, "johannes.lermann@kabeg.at"))
      .limit(1);
    const ownerId = defaultOwner?.id ?? fallbackEmployee?.id;
    const publisherId = defaultPublisher?.id ?? ownerId;

    const existingSops = await db.select({ id: sops.id }).from(sops).limit(1);
    if (!existingSops.length && ownerId && publisherId) {
      const [proposedSop] = await db
        .insert(sops)
        .values({
          title: "SOP Vorschlag: Postpartale Blutung",
          category: "SOP",
          status: "proposed",
          contentMarkdown: "Bitte Standardablauf fuer die Erstversorgung definieren.",
          createdById: ownerId
        })
        .returning();
      const [inProgressSop] = await db
        .insert(sops)
        .values({
          title: "SOP Entwurf: Schwangerschaftsdiabetes",
          category: "SOP",
          status: "in_progress",
          contentMarkdown: "Diagnostik, Therapie und Nachsorge fuer GDM.",
          createdById: ownerId
        })
        .returning();
      const [reviewSop] = await db
        .insert(sops)
        .values({
          title: "Leitlinie Review: Praenatale Diagnostik",
          category: "Leitlinie",
          status: "review",
          contentMarkdown: "Update der Untersuchungsintervalle und Dokumentation.",
          createdById: ownerId
        })
        .returning();
      const [publishedSop] = await db
        .insert(sops)
        .values({
          title: "SOP Freigegeben: Sectio-Ablauf",
          category: "SOP",
          status: "published",
          contentMarkdown: "Standardablauf vor, waehrend und nach Sectio.",
          createdById: ownerId,
          approvedById: publisherId,
          publishedAt: new Date()
        })
        .returning();

      const [version] = await db
        .insert(sopVersions)
        .values({
          sopId: publishedSop.id,
          versionNumber: 1,
          title: publishedSop.title,
          contentMarkdown: publishedSop.contentMarkdown || "",
          changeNote: "Erstveroeffentlichung",
          releasedById: publisherId
        })
        .returning();

      await db
        .update(sops)
        .set({
          currentVersionId: version.id,
          version: "1",
          approvedById: publisherId,
          publishedAt: new Date()
        })
        .where(eq(sops.id, publishedSop.id));

      await db.insert(sopReferences).values({
        sopId: publishedSop.id,
        type: "awmf",
        status: "accepted",
        title: "AWMF Leitlinie (Beispiel)",
        url: "https://www.awmf.org/leitlinien",
        publisher: "AWMF",
        yearOrVersion: "2024",
        relevanceNote: "Bitte aktuelle Version pruefen.",
        createdById: ownerId,
        createdByAi: false,
        verifiedById: publisherId,
        verifiedAt: new Date()
      });

      console.log("✓ Seeded SOP samples");
    }

    const existingProjects = await db
      .select({ id: projectInitiatives.id })
      .from(projectInitiatives)
      .limit(1);
    if (!existingProjects.length && ownerId) {
      const [proposedProject] = await db
        .insert(projectInitiatives)
        .values({
          title: "Projektvorschlag: SOP Digitale Kurve",
          description: "Erstellung einer SOP fuer die digitale Geburtsdokumentation.",
          category: "SOP",
          status: "proposed",
          createdById: ownerId,
          ownerId
        })
        .returning();
      const [activeProject] = await db
        .insert(projectInitiatives)
        .values({
          title: "Qualitaetsprojekt: CTG Audit",
          description: "Audit der CTG Dokumentation und Rueckmeldungen.",
          category: "Qualitätsprojekt",
          status: "active",
          createdById: ownerId,
          ownerId
        })
        .returning();
      const [doneProject] = await db
        .insert(projectInitiatives)
        .values({
          title: "Studie abgeschlossen: Postpartale Analgesie",
          description: "Studienabschluss inkl. Ergebniszusammenfassung.",
          category: "Studie",
          status: "done",
          createdById: ownerId,
          ownerId
        })
        .returning();

      await db.insert(projectMembers).values([
        { projectId: proposedProject.id, employeeId: ownerId, role: "Leitung" },
        { projectId: activeProject.id, employeeId: ownerId, role: "Leitung" },
        { projectId: doneProject.id, employeeId: ownerId, role: "Leitung" }
      ]);

      console.log("✓ Seeded project samples");
    }

    const existingNotifications = await db
      .select({ id: notifications.id })
      .from(notifications)
      .limit(1);
    if (!existingNotifications.length && ownerId) {
      await db.insert(notifications).values({
        recipientId: ownerId,
        type: "system",
        title: "Willkommen bei SOPs & Projekten",
        message: "Neue SOPs und Projekte warten auf Ihre Freigabe.",
        link: "/nachrichten"
      });
      console.log("✓ Seeded notifications");
    }
    
    console.log("Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();
