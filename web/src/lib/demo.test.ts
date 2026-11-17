import { afterEach, describe, expect, it } from "vitest";
import { demoApprovalAllowed, isDemoModel } from "./demo";

describe("demo guard", () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  it("recognises the worker's demo backend only", () => {
    expect(isDemoModel("demo (bez modeļa)")).toBe(true);
    expect(isDemoModel("whisper-lv-ct2 (cpu/int8)")).toBe(false);
    expect(isDemoModel(null)).toBe(false);
  });

  it("allows approving demo text only with DEMO_MODE=true", () => {
    expect(demoApprovalAllowed()).toBe(false);
    process.env.DEMO_MODE = "true";
    expect(demoApprovalAllowed()).toBe(true);
  });
});
