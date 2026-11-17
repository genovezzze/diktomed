import { describe, expect, it } from "vitest";
import { parseRange } from "./http-range";

describe("parseRange", () => {
  it("serves the whole file without a header", () => {
    expect(parseRange(null, 100)).toBeNull();
  });

  it("parses an open-ended range", () => {
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
  });

  it("clamps the end to the file size", () => {
    expect(parseRange("bytes=0-1000", 100)).toEqual({ start: 0, end: 99 });
  });

  it("parses a suffix range", () => {
    expect(parseRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
  });

  it("rejects ranges past the end", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=50-10", 100)).toBe("unsatisfiable");
  });

  it("falls back to the whole file for multi-ranges", () => {
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
  });
});
