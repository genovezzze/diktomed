import { describe, expect, it } from "vitest";
import { editDistance, pooledWer, wordErrorRate } from "./wer";

describe("editDistance", () => {
  it("counts substitutions, insertions and deletions", () => {
    expect(editDistance(["a", "b", "c"], ["a", "x", "c"])).toBe(1);
    expect(editDistance(["a", "b"], ["a", "b", "c"])).toBe(1);
    expect(editDistance([], ["a"])).toBe(1);
  });
});

describe("wordErrorRate", () => {
  it("is zero for identical text, ignoring case and punctuation", () => {
    expect(wordErrorRate("Veiksim hemostāzi.", "veiksim hemostāzi").wer).toBe(0);
  });

  it("is edits over reference words", () => {
    const r = wordErrorRate("padodiet koagulatoru lūdzu", "padodiet koagulātoru lūdzu");
    expect(r.edits).toBe(1);
    expect(r.referenceWords).toBe(3);
    expect(r.wer).toBeCloseTo(1 / 3);
  });

  it("counts a hallucinated line against an empty reference as fully wrong", () => {
    expect(wordErrorRate("", "Paldies par skatīšanos").wer).toBe(1);
  });
});

describe("pooledWer", () => {
  it("weights by reference length, not by pair", () => {
    const r = pooledWer([
      { reference: "a b c d", hypothesis: "a b c d" },
      { reference: "x", hypothesis: "y" },
    ]);
    expect(r.edits).toBe(1);
    expect(r.referenceWords).toBe(5);
    expect(r.wer).toBeCloseTo(0.2);
  });
});
