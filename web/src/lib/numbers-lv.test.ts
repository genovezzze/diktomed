import { describe, expect, it } from "vitest";
import { checkManualValue, findSides, parseNumbers } from "./numbers-lv";

const TEXT = "Kreisā ceļa locītavas artroskopija. Asins zudums minimāls, ap divdesmit mililitriem. Ketonāls simts miligrami.";

describe("parseNumbers (same results as the worker)", () => {
  it("reads number words and digits", () => {
    expect(parseNumbers("simt divdesmit astoņi uz septiņdesmit astoņi")).toEqual([128, 78]);
    expect(parseNumbers("piecdesmit četrus gadus, divi simti, tūkstoš piecsimt")).toEqual([54, 200, 1500]);
    expect(parseNumbers("~200 ml, 12,5mg, ≈ 20")).toEqual([200, 12.5, 20]);
  });
});

describe("findSides", () => {
  it("needs a body part for lab-", () => {
    expect([...findSides("Pacients labā stāvoklī")]).toEqual([]);
    expect([...findSides("Labā ceļa locītava")]).toEqual(["RIGHT"]);
    expect([...findSides("kreisā puse")]).toEqual(["LEFT"]);
  });
});

describe("checkManualValue", () => {
  it("accepts numbers that are in the approved text, in any spelling", () => {
    expect(checkManualValue("~20 ml", TEXT, "LEFT").check).toBe("OK");
    expect(checkManualValue("Ketonāls 100 mg i/v", TEXT, "LEFT").check).toBe("OK");
  });

  it("warns about a number the dictation never said", () => {
    const r = checkManualValue("Ievietota drenāža 300 ml", TEXT, "LEFT");
    expect(r.check).toBe("NUMBER_MISMATCH");
    expect(r.message).toContain("300");
  });

  it("warns about the other side", () => {
    expect(checkManualValue("Labā ceļa artroskopija", TEXT, "LEFT").check).toBe("SIDE_MISMATCH");
    expect(checkManualValue("Labā ceļa artroskopija", TEXT, null).check).toBe("OK");
  });
});
