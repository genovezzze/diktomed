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

// The default forms. Titles and hints are what the hospital will most likely
// want to change to match its own documents (today: the protocol_sections
// table). Positions leave gaps so a section can be added in between.
type SectionSeed = { key: string; title: string; hint: string; multi: boolean; position: number; documentKind: "OPERATION" | "EPICRISIS" };

const OPERATION_SECTIONS: SectionSeed[] = [
  { position: 0, key: "diagnoze", title: "Diagnoze", hint: "Diagnoze, ar kuru pacients operēts (pirms- vai pēcoperācijas).", multi: false },
  { position: 10, key: "operacija", title: "Operācija", hint: "Veiktās operācijas nosaukums, ieskaitot pusi (kreisā/labā), ja minēta.", multi: false },
  { position: 20, key: "anestezija", title: "Anestēzija", hint: "Anestēzijas veids (narkoze, spinālā, lokālā u.c.).", multi: false },
  { position: 30, key: "gaita", title: "Operācijas gaita", hint: "Veiktās darbības secīgi: piekļuve, griezumi, manipulācijas, kā sašūts.", multi: true },
  { position: 34, key: "medikamenti", title: "Medikamenti operācijas laikā", hint: "Zāles, kas ievadītas operācijas laikā (antibiotikas, hemostatiķi u.c.), ar devām tieši tā, kā diktēts.", multi: true },
  { position: 36, key: "materiali", title: "Materiāli un implanti", hint: "Šuvju materiāls (diegi), implanti, sieti, klipši, stenti: nosaukumi un izmēri tieši tā, kā diktēts.", multi: true },
  { position: 40, key: "atradne", title: "Atradne", hint: "Kas konstatēts operācijā: bojājumi, patoloģija, arī noliegumi.", multi: true },
  { position: 50, key: "asins_zudums", title: "Asins zudums", hint: "Asins zuduma apjoms tieši tā, kā diktēts.", multi: false },
  { position: 60, key: "drenaza", title: "Drenāža", hint: "Vai ievietota drenāža, kāda un kur.", multi: false },
  { position: 70, key: "komplikacijas", title: "Komplikācijas", hint: "Intraoperatīvās komplikācijas vai to neesamība.", multi: false },
  { position: 80, key: "histologija", title: "Histoloģija", hint: "Vai materiāls nosūtīts histoloģiskai izmeklēšanai.", multi: false },
  { position: 90, key: "nozimejumi", title: "Nozīmējumi", hint: "Medikamenti un rīkojumi pēc operācijas, ar devām tieši tā, kā diktēts.", multi: true },
].map((s) => ({ ...s, documentKind: "OPERATION" as const }));

// The sections the hospital named for an epicrisis. The diagnosis is split in
// main and secondary: the doctor says which is which, the system only sorts.
const EPICRISIS_SECTIONS: SectionSeed[] = [
  { position: 0, key: "ep_pamatdiagnoze", title: "Pamatdiagnoze", hint: "Galvenā diagnoze, ko ārsts nosauc (arī latīniski), ar SSK-10 kodu, ja tas pateikts. Tikai viena.", multi: false },
  { position: 10, key: "ep_blakusdiagnozes", title: "Blakusdiagnozes", hint: "Blakusslimības un pavadošās diagnozes (piem. cukura diabēts, hipertensija, sirds slimības), ar kodiem, ja pateikti.", multi: true },
  { position: 20, key: "ep_alergijas", title: "Alerģijas", hint: "Alerģijas un nepanesība (piem. pret penicilīnu), arī ja pieminētas citur diktātā.", multi: true },
  { position: 30, key: "ep_sudzibas", title: "Sūdzības", hint: "Ar ko pacients vērsās vai tika stacionēts: sūdzības un iemesls.", multi: true },
  { position: 40, key: "ep_gaita", title: "Slimības gaita", hint: "Kas notika ārstēšanās laikā, secīgi.", multi: true },
  { position: 50, key: "ep_izmeklejumi", title: "Izmeklējumi", hint: "Veiktie izmeklējumi un rezultāti (analīzes, DT, USG, rentgens, endoskopija u.c.) tieši tā, kā diktēts.", multi: true },
  { position: 60, key: "ep_arstesana", title: "Ārstēšana", hint: "Saņemtā ārstēšana: medikamenti ar devām, operācijas, procedūras.", multi: true },
  { position: 70, key: "ep_rekomendacijas", title: "Rekomendācijas", hint: "Ieteikumi pēc izrakstīšanas: medikamenti ar devām un ilgumu, kontroles vizītes, režīms.", multi: true },
].map((s) => ({ ...s, documentKind: "EPICRISIS" as const }));

/** Adds the default sections that are missing, without touching ones the hospital changed. */
async function seedSections() {
  // Installs from before the position gaps had positions 0..9: spread them out
  // once, so the new sections land between the right neighbours.
  const operation = await prisma.protocolSection.findMany({ where: { documentKind: "OPERATION" } });
  if (operation.length && operation.every((s) => s.position < 10)) {
    for (const s of operation) {
      await prisma.protocolSection.update({ where: { id: s.id }, data: { position: s.position * 10 } });
    }
  }
  const { count } = await prisma.protocolSection.createMany({
    data: [...OPERATION_SECTIONS, ...EPICRISIS_SECTIONS],
    skipDuplicates: true,
  });
  if (count) console.log(`Added ${count} protocol sections`);
}

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
        // The installer's password is written in .env, so in production it
        // is only a first-login password.
        mustChangePassword: production,
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

  await seedSections();

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
