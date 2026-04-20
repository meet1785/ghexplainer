import { describe, expect, it } from "vitest";
import { parseBooleanFlag } from "@/lib/options";

describe("parseBooleanFlag", () => {
  it("returns true for boolean true", () => {
    expect(parseBooleanFlag(true)).toBe(true);
  });

  it("returns true for supported truthy string values", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("TRUE")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
    expect(parseBooleanFlag("yes")).toBe(true);
    expect(parseBooleanFlag("on")).toBe(true);
  });

  it("returns false for unsupported values", () => {
    expect(parseBooleanFlag(false)).toBe(false);
    expect(parseBooleanFlag(0)).toBe(false);
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag("0")).toBe(false);
    expect(parseBooleanFlag("off")).toBe(false);
    expect(parseBooleanFlag("")).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag(null)).toBe(false);
  });
});
