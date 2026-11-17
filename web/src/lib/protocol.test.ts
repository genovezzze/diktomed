import { describe, expect, it } from "vitest";
import { highlight, isWarning, parseQuotes, pendingFields, quoteRange } from "./protocol";

const SEGMENTS = [
  { start: 0, end: 4, text: "Operācijas protokols. Kreisā ceļa locītavas artroskopija." },
  { start: 4.5, end: 9, text: "Asins zudums minimāls, ap divdesmit mililitriem." },
  { start: 9.5, end: 12, text: "Drenāža netika ievietota." },
];

describe("quoteRange", () => {
  it("finds the segment a quote was said in", () => {
    expect(quoteRange("Asins zudums minimāls, ap divdesmit mililitriem.", SEGMENTS)).toEqual({ start: 4.5, end: 9 });
  });

  it("spans segments when a quote runs over two", () => {
    expect(quoteRange("ap divdesmit mililitriem. Drenāža netika ievietota.", SEGMENTS)).toEqual({ start: 4.5, end: 12 });
  });

  it("returns null for text that is not there", () => {
    expect(quoteRange("Ievietota drenāža labajā pusē.", SEGMENTS)).toBeNull();
  });
});

describe("highlight", () => {
  it("marks quotes case-insensitively and keeps the rest", () => {
    expect(highlight("Brūces sašūtas. Drenāža netika ievietota.", ["drenāža netika ievietota."])).toEqual([
      { text: "Brūces sašūtas. ", mark: false },
      { text: "Drenāža netika ievietota.", mark: true },
    ]);
  });

  it("leaves a paragraph without the quote untouched", () => {
    expect(highlight("Brūces sašūtas.", ["nav"])).toEqual([{ text: "Brūces sašūtas.", mark: false }]);
  });
});

describe("field helpers", () => {
  it("treats only real problems as warnings", () => {
    expect(isWarning("OK")).toBe(false);
    expect(isWarning("EMPTY")).toBe(false);
    expect(isWarning("NUMBER_MISMATCH")).toBe(true);
  });

  it("pending = a value nobody has decided on", () => {
    const fields = [
      { value: "a", status: "SUGGESTED" as const },
      { value: null, status: "SUGGESTED" as const },
      { value: "b", status: "ACCEPTED" as const },
    ];
    expect(pendingFields(fields)).toHaveLength(1);
  });

  it("parses stored quotes defensively", () => {
    expect(parseQuotes(["a", 1, " ", "b"])).toEqual(["a", "b"]);
    expect(parseQuotes(null)).toEqual([]);
  });
});
