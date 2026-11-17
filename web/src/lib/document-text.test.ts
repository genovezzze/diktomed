import { describe, expect, it } from "vitest";
import { buildDocumentText, buildParagraphs } from "./document-text";

describe("buildParagraphs", () => {
  it("joins close segments and splits on long pauses", () => {
    expect(
      buildParagraphs([
        { start: 0, end: 2, text: "Operācijas protokols." },
        { start: 2.3, end: 5, text: "Laparoskopiska holecistektomija." },
        { start: 8, end: 10, text: "Operācijas gaita." },
      ]),
    ).toEqual(["Operācijas protokols. Laparoskopiska holecistektomija.", "Operācijas gaita."]);
  });

  it("skips segments a reviewer emptied, e.g. a deleted hallucination", () => {
    expect(
      buildDocumentText([
        { start: 0, end: 1, text: "Teksts." },
        { start: 1.2, end: 2, text: "  " },
        { start: 2.1, end: 3, text: "Vēl teksts." },
      ]),
    ).toBe("Teksts. Vēl teksts.");
  });

  it("orders by time even if rows arrive unsorted", () => {
    expect(
      buildParagraphs([
        { start: 1.5, end: 4, text: "B." },
        { start: 0, end: 1, text: "A." },
      ]),
    ).toEqual(["A. B."]);
  });
});
