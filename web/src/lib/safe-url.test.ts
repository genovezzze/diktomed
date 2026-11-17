import { describe, expect, it } from "vitest";
import { isUuid, safeNextPath } from "./safe-url";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/diktati")).toBe("/diktati");
    expect(safeNextPath("/diktati?status=review#x")).toBe("/diktati?status=review#x");
  });

  it("refuses everything that leaves the site", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\\/evil.example", "https://evil.example", "javascript:alert(1)", "evil", "", null]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});

describe("isUuid", () => {
  it("accepts a UUID and rejects anything else", () => {
    expect(isUuid("1de78a5d-10c2-4dd0-bdfb-6f716c84a3e9")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("1de78a5d-10c2-4dd0-bdfb-6f716c84a3e9' or 1=1")).toBe(false);
  });
});
