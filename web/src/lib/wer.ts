import { normalizeWord, tokenize } from "@/lib/text-diff";

// Word error rate of the model's draft against the approved text. It answers
// one question for the pilot: how much of the draft did people have to fix?
// It describes the model, never the person who did the fixing.

export type WerResult = { edits: number; referenceWords: number; wer: number };

function words(text: string): string[] {
  return tokenize(text).map(normalizeWord).filter(Boolean);
}

export function editDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function wordErrorRate(reference: string, hypothesis: string): WerResult {
  const ref = words(reference);
  const hyp = words(hypothesis);
  const edits = editDistance(ref, hyp);
  return { edits, referenceWords: ref.length, wer: ref.length ? edits / ref.length : hyp.length ? 1 : 0 };
}

/** Pooled WER over many pairs: total edits / total reference words. */
export function pooledWer(pairs: { reference: string; hypothesis: string }[]): WerResult {
  let edits = 0;
  let referenceWords = 0;
  for (const p of pairs) {
    const r = wordErrorRate(p.reference, p.hypothesis);
    edits += r.edits;
    referenceWords += r.referenceWords;
  }
  return { edits, referenceWords, wer: referenceWords ? edits / referenceWords : 0 };
}
