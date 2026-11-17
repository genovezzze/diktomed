import { describe, expect, it } from "vitest";
import { clearFailures, isRateLimited, recordFailure, recordFailures } from "./rate-limit";

describe("rate limit", () => {
  it("blocks an account after 5 failures within the window", () => {
    const key = "account:a@test.lv";
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, 1000)).toBe(false);
      recordFailure(key, 1000);
    }
    expect(isRateLimited(key, 1000)).toBe(true);
    // 15 minutes later the window has passed
    expect(isRateLimited(key, 1000 + 15 * 60 * 1000 + 1)).toBe(false);
    clearFailures(key);
  });

  it("gives an IP more room than an account", () => {
    const key = "ip:10.0.0.1";
    for (let i = 0; i < 19; i++) recordFailure(key, 1000);
    expect(isRateLimited(key, 1000)).toBe(false);
    recordFailure(key, 1000);
    expect(isRateLimited(key, 1000)).toBe(true);
  });

  it("counts a failure against every key with the current time", () => {
    // Regression: keys.forEach(recordFailure) passed the array index as the time,
    // so every attempt looked 50 years old and the limit never triggered.
    const keys = ["account:b@test.lv", "ip:10.0.0.2"];
    for (let i = 0; i < 5; i++) recordFailures(keys);
    expect(isRateLimited(keys[0])).toBe(true);
    expect(isRateLimited(keys[1])).toBe(false);
    keys.forEach((k) => clearFailures(k));
  });
});
