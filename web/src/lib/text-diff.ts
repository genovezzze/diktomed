// Word-level diff between what the model wrote and what a person saved.
// Short replacements ("koagulātors" -> "koagulators") are what the system
// learns from; long rewrites are ignored because they are not vocabulary.

export type Correction = { wrong: string; right: string };

const EDGE_PUNCT = /^[\s.,;:!?()[\]{}"'«»„“”‘’…-]+|[\s.,;:!?()[\]{}"'«»„“”‘’…-]+$/g;

export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Lower-case, edge punctuation removed: the form used to compare words. */
export function normalizeWord(word: string): string {
  return word.replace(EDGE_PUNCT, "").toLocaleLowerCase("lv");
}

type Hunk = { removed: string[]; added: string[] };

/** Hunks of non-matching words between two texts, by longest common subsequence. */
export function diffWords(before: string, after: string): Hunk[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const na = a.map(normalizeWord);
  const nb = b.map(normalizeWord);

  // lcs[i][j] = LCS length of na[i..] and nb[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = na[i] === nb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const hunks: Hunk[] = [];
  let current: Hunk = { removed: [], added: [] };
  const flush = () => {
    if (current.removed.length || current.added.length) hunks.push(current);
    current = { removed: [], added: [] };
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] === nb[j]) {
      flush();
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      current.added.push(b[j++]);
    } else {
      current.removed.push(a[i++]);
    }
  }
  flush();
  return hunks;
}

const MAX_WORDS = 3;

// Never learned: the side of the operation and numbers. A fix from "labā" to
// "kreisā" is about one patient, not about vocabulary; suggesting it in the
// next dictation would invite a wrong-site error. The same goes for doses.
const SIDE_WORD = /^(?:kreis|lab)(?:ā|ais|o|ajā|ās|ajam|ajai|ie|ajos|ajās|ajiem|ajām)$/;
const NUMBER_WORD =
  /^(?:\d+(?:[.,]\d+)?%?|nulle|vien(?:s|a|u|as|i)|div(?:i|as|us)|trīs|četr(?:i|as|us)|piec(?:i|as|us)|seš(?:i|as|us)|septiņ(?:i|as|us)|astoņ(?:i|as|us)|deviņ(?:i|as|us)|desmit|\p{L}+padsmit|\p{L}+desmit|\p{L}*simt(?:s|i|u)?|tūksto\p{L}*)$/u;

export function isProtectedWord(word: string): boolean {
  const w = normalizeWord(word);
  return SIDE_WORD.test(w) || NUMBER_WORD.test(w);
}

/** Replacement pairs worth remembering from one edit. */
export function extractCorrections(before: string, after: string): Correction[] {
  const out: Correction[] = [];
  const seen = new Set<string>();
  for (const hunk of diffWords(before, after)) {
    if (!hunk.removed.length || !hunk.added.length) continue;
    if (hunk.removed.length > MAX_WORDS || hunk.added.length > MAX_WORDS) continue;
    if ([...hunk.removed, ...hunk.added].some(isProtectedWord)) continue;
    const wrong = hunk.removed.map(normalizeWord).filter(Boolean).join(" ");
    const right = hunk.added.join(" ").replace(EDGE_PUNCT, "");
    if (!wrong || !right || wrong === normalizeWord(right)) continue;
    const key = `${wrong}\u0000${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ wrong, right });
  }
  return out;
}
