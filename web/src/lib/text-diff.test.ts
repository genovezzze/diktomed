import { describe, expect, it } from "vitest";
import { diffWords, extractCorrections, normalizeWord } from "./text-diff";

describe("normalizeWord", () => {
  it("lower-cases and strips edge punctuation, keeping Latvian letters", () => {
    expect(normalizeWord("«Žultspūslis»,")).toBe("žultspūslis");
    expect(normalizeWord("(hemostāze).")).toBe("hemostāze");
  });
});

describe("diffWords", () => {
  it("finds nothing when only case and punctuation changed", () => {
    expect(diffWords("Veiksim hemostāzi", "veiksim hemostāzi.")).toEqual([]);
  });

  it("returns a replacement hunk", () => {
    expect(diffWords("padodiet koagulātoru lūdzu", "padodiet koagulatoru lūdzu")).toEqual([
      { removed: ["koagulātoru"], added: ["koagulatoru"] },
    ]);
  });
});

describe("extractCorrections", () => {
  it("learns a one-word fix", () => {
    expect(extractCorrections("Te redzama asiņošana no žults pūšļa gultnes", "Te redzama asiņošana no žultspūšļa gultnes")).toEqual([
      { wrong: "žults pūšļa", right: "žultspūšļa" },
    ]);
  });

  it("ignores pure insertions and deletions", () => {
    expect(extractCorrections("Veiksim hemostāzi", "Tagad veiksim hemostāzi")).toEqual([]);
    expect(extractCorrections("Motors. Veiksim hemostāzi", "Veiksim hemostāzi")).toEqual([]);
  });

  it("ignores long rewrites, they are not vocabulary", () => {
    expect(
      extractCorrections("viens divi trīs četri pieci", "seši septiņi astoņi deviņi desmit"),
    ).toEqual([]);
  });

  it("never learns a change of operation side", () => {
    expect(extractCorrections("Labā ceļa locītavā izsvīdums nav.", "Kreisā ceļa locītavā izsvīdums nav.")).toEqual([]);
    expect(extractCorrections("no kreisās puses", "no labās puses")).toEqual([]);
  });

  it("never learns a change of a number or dose", () => {
    expect(extractCorrections("ketonāls simts miligrami", "ketonāls piecdesmit miligrami")).toEqual([]);
    expect(extractCorrections("asins zudums 50 ml", "asins zudums 15 ml")).toEqual([]);
  });

  it("keeps the reviewer's casing on the right-hand side", () => {
    expect(extractCorrections("pacientam dots ketonāls", "pacientam dots Ketonal")).toEqual([
      { wrong: "ketonāls", right: "Ketonal" },
    ]);
  });
});
