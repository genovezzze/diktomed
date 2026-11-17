import { describe, expect, it } from "vitest";
import { browserUrl } from "./request-url";

describe("browserUrl", () => {
  it("uses the Host header, not the bind address", () => {
    const h = new Headers({ host: "localhost:3000" });
    expect(browserUrl("/login", h, "http://0.0.0.0:3000/api/auth/logout").href).toBe("http://localhost:3000/login");
  });

  it("follows a reverse proxy", () => {
    const h = new Headers({ host: "web:3000", "x-forwarded-host": "diktomed.slimnica.lv", "x-forwarded-proto": "https" });
    expect(browserUrl("/login?next=%2Fdiktati", h, "http://0.0.0.0:3000/x").href).toBe("https://diktomed.slimnica.lv/login?next=%2Fdiktati");
  });

  it("falls back to the request URL without headers", () => {
    expect(browserUrl("/login", new Headers(), "http://localhost:3000/x").href).toBe("http://localhost:3000/login");
  });
});
