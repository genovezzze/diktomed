import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Idempotent: safe to run on every deploy. Creates the first administrator
// and a starter vocabulary. Never seeds patient data.

const prisma = new PrismaClient();

const STARTER_TERMS = [
  "operācijas protokols",
  "laparoskopija",
  "laparoskopiska holecistektomija",
  "holecistektomija",
  "žultspūslis",
  "žultspūšļa gultne",
  "hemostāze",
  "koagulators",
  "trokārs",
  "pneimoperitoneums",
  "apendektomija",
  "herniotomija",
  "anastomoze",
  "drenāža",
  "diatermija",
  "endotraheālā narkoze",
  "spinālā anestēzija",
  "asins zudums",
  "šuves",
  "aseptiska pārsēja",
];

async function main() {
  const production = process.env.NODE_ENV === "production";
  const email = (process.env.SEED_ADMIN_EMAIL ?? (production ? "" : "admin@diktomed.local")).trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? (production ? "" : "diktomed-dev-parole");

  if (!email || !password) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the first administrator.");
  }
  if (production && password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: process.env.SEED_ADMIN_NAME ?? "Administrators",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`Created administrator ${email}`);
  }

  if (!production) {
    const demoEmail = "specialiste@diktomed.local";
    if (!(await prisma.user.findUnique({ where: { email: demoEmail } }))) {
      await prisma.user.create({
        data: {
          email: demoEmail,
          name: "Anna Ozola",
          role: "TRANSCRIBER",
          passwordHash: await bcrypt.hash("diktomed-dev-parole", 12),
        },
      });
      console.log(`Created demo transcriber ${demoEmail}`);
    }
  }

  if ((await prisma.term.count()) === 0) {
    await prisma.term.createMany({ data: STARTER_TERMS.map((text) => ({ text })), skipDuplicates: true });
    console.log(`Added ${STARTER_TERMS.length} starter terms`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
