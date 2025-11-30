import { db } from "./db";
import { employees, resources } from "@shared/schema";

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
  { name: "Kreißsaal 1", type: "Geburtshilfe", isAvailable: true },
  { name: "Kreißsaal 2", type: "Geburtshilfe", isAvailable: true },
  { name: "OP 1", type: "OP", isAvailable: true },
  { name: "OP 2", type: "OP", isAvailable: true },
  { name: "Ambulanz Gyn", type: "Ambulanz", isAvailable: true },
  { name: "Mamma Ambulanz", type: "Ambulanz", isAvailable: true }
];

async function seed() {
  try {
    console.log("Seeding database...");
    
    // Seed employees
    for (const emp of TEAM_DATA) {
      await db.insert(employees).values(emp);
    }
    console.log(`✓ Seeded ${TEAM_DATA.length} employees`);
    
    // Seed resources
    for (const res of RESOURCES_DATA) {
      await db.insert(resources).values(res);
    }
    console.log(`✓ Seeded ${RESOURCES_DATA.length} resources`);
    
    console.log("Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();
