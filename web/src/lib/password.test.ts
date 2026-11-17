import { describe, expect, it } from "vitest";
import { passwordProblem, temporaryPassword } from "./password";

describe("temporaryPassword", () => {
  it("is three groups of five readable characters", () => {
    const p = temporaryPassword();
    expect(p).toMatch(/^[a-zA-Z2-9]{5}-[a-zA-Z2-9]{5}-[a-zA-Z2-9]{5}$/);
    expect(p).not.toMatch(/[01lIoO]/);
  });

  it("differs every time", () => {
    expect(new Set(Array.from({ length: 50 }, temporaryPassword)).size).toBe(50);
  });
});

describe("passwordProblem", () => {
  it("accepts a long password with letters and digits", () => {
    expect(passwordProblem("slimnica-parole-2026")).toBeNull();
  });

  it("rejects short or one-kind passwords", () => {
    expect(passwordProblem("īsa1")).not.toBeNull();
    expect(passwordProblem("tikaiburtitikaiburti")).not.toBeNull();
    expect(passwordProblem("123456789012345")).not.toBeNull();
  });
});
