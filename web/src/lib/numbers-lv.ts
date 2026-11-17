// Latvian numbers and operation side in free text. Mirrors the worker's
// numbers_lv.py and laterality.py, so a value a person types into the
// protocol is checked the same way as one the model drafted.

const STEMS = ["", "vien", "div", "trīs", "četr", "piec", "seš", "septiņ", "astoņ", "deviņ"];
const UNIT_WORDS: [RegExp, number][] = [
  [/^nulle$/, 0],
  [/^vien(s|a|u|as|i|ām|iem)$/, 1],
  [/^div(i|as|us|iem|ām)$/, 2],
  [/^(trīs|trijiem|trim)$/, 3],
  [/^četr(i|as|us|iem|ām)$/, 4],
  [/^piec(i|as|us|iem|ām)$/, 5],
  [/^seš(i|as|us|iem|ām)$/, 6],
  [/^septiņ(i|as|us|iem|ām)$/, 7],
  [/^astoņ(i|as|us|iem|ām)$/, 8],
  [/^deviņ(i|as|us|iem|ām)$/, 9],
];
const STRIP = /^[.,;:!?()[\]{}"'«»„“”…]+|[.,;:!?()[\]{}"'«»„“”…]+$/g;

type Word = { value: number; kind: "unit" | "hundred" | "thousand" };

function wordValue(token: string): Word | null {
  const t = token.replace(STRIP, "").toLocaleLowerCase("lv");
  if (!t) return null;
  if (/^\d+([.,]\d+)?%?$/.test(t)) return { value: Number(t.replace("%", "").replace(",", ".")), kind: "unit" };
  if (t === "desmit") return { value: 10, kind: "unit" };
  if (t.endsWith("padsmit")) {
    const i = STEMS.indexOf(t.slice(0, -7));
    return i >= 1 ? { value: 10 + i, kind: "unit" } : null;
  }
  if (t.endsWith("desmit")) {
    const i = STEMS.indexOf(t.slice(0, -6));
    return i >= 2 ? { value: 10 * i, kind: "unit" } : null;
  }
  const hundred = /^(\p{L}*?)simt(s|i|u|iem)?$/u.exec(t);
  if (hundred) {
    if (!hundred[1]) return { value: 100, kind: "hundred" };
    const i = STEMS.indexOf(hundred[1]);
    return i >= 2 ? { value: 100 * i, kind: "unit" } : null;
  }
  if (t.startsWith("tūksto")) return { value: 1000, kind: "thousand" };
  if (["pusotra", "pusotru", "pusotri"].includes(t)) return { value: 1.5, kind: "unit" };
  for (const [re, v] of UNIT_WORDS) if (re.test(t)) return { value: v, kind: "unit" };
  return null;
}

/** Every number in a text: "simt divdesmit astoņi" -> 128, "~200ml" -> 200. */
export function parseNumbers(text: string): number[] {
  const prepared = text.replace(/[~≈<>±]/g, " ").replace(/(\d)(?=[^\d\s.,%])/g, "$1 ");
  const tokens = prepared.split(/\s+/).filter(Boolean);
  const out: number[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!wordValue(tokens[i])) {
      i++;
      continue;
    }
    let total = 0;
    let current = 0;
    let j = i;
    while (j < tokens.length) {
      const w = wordValue(tokens[j]);
      if (!w) break;
      if (w.kind === "hundred") current = current > 0 && current < 10 ? current * 100 : current + 100;
      else if (w.kind === "thousand") {
        total += (current || 1) * 1000;
        current = 0;
      } else current += w.value;
      const closes = /[.,;:]$/.test(tokens[j]);
      j++;
      if (closes) break;
    }
    out.push(total + current);
    i = j;
  }
  return out;
}

const LEFT = /^kreis(ā|ais|o|ajā|ās|ajam|ajai|ie|ajos|ajās|ajiem|ajām)$/;
const RIGHT = /^lab(ā|ais|o|ajā|ās|ajam|ajai|ie|ajos|ajās|ajiem|ajām)$/;
const ANATOMY = ["pus", "ceļ", "gūž", "plec", "rok", "kāj", "nier", "krūt", "plauš", "ac", "aus", "elkoņ", "elkon", "potīt", "pēd", "plaukst", "sēklinie", "olnīc", "cirkšņ", "apakšdelm", "augšstilb", "stilb", "lāpstiņ", "atslēgkaul", "delm", "vaig", "žokl", "hemitorak", "daiv", "virsnier", "cisk", "apakšstilb", "pirkst", "īkšķ", "krūškurv", "deniņ", "sān", "menisk", "locītav"];

export type Side = "LEFT" | "RIGHT";

/** Sides named in a text. "lab-" counts only next to a body part ("labā" also means "good"). */
export function findSides(text: string): Set<Side> {
  const tokens = text.split(/\s+/).map((t) => t.replace(STRIP, "").toLocaleLowerCase("lv"));
  const sides = new Set<Side>();
  tokens.forEach((t, i) => {
    const nearBody = tokens.slice(i + 1, i + 3).some((n) => ANATOMY.some((a) => n.startsWith(a)));
    if (LEFT.test(t)) sides.add("LEFT");
    else if (RIGHT.test(t) && nearBody) sides.add("RIGHT");
  });
  return sides;
}

export type ManualCheck = { check: "OK" | "NUMBER_MISMATCH" | "SIDE_MISMATCH"; message: string | null };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

/** A value a person typed, against the approved text and the planned side. */
export function checkManualValue(value: string, approvedText: string, plannedSide: string | null): ManualCheck {
  const have = parseNumbers(approvedText);
  const missing = parseNumbers(value).filter((n) => !have.some((h) => Math.abs(h - n) < 1e-6));
  if (missing.length) {
    return { check: "NUMBER_MISMATCH", message: `Skaitlis ${missing.map(fmt).join(", ")} nav apstiprinātajā tekstā. Pārbaudiet pret audio.` };
  }
  const sides = findSides(value);
  if ((plannedSide === "LEFT" || plannedSide === "RIGHT") && sides.size && !(sides.size === 1 && sides.has(plannedSide))) {
    return { check: "SIDE_MISMATCH", message: `Puse neatbilst plānotajai (${plannedSide === "LEFT" ? "kreisā" : "labā"}).` };
  }
  return { check: "OK", message: null };
}
