/**
 * Tests for the formatting utilities module.
 *
 * Validates: duration formatting, byte formatting, count formatting,
 * edge cases (zero, negative, non-finite), and boundary values.
 */

import { describe, it, expect } from "vitest";
import { formatDuration, formatBytes, formatCount } from "@/lib/format";

// ─── formatDuration ───────────────────────────────────────────

describe("formatDuration", () => {
  it("should format sub-second durations with one decimal place", () => {
    expect(formatDuration(500)).toBe("0.5s");
  });

  it("should format durations under 10s with one decimal place", () => {
    expect(formatDuration(3200)).toBe("3.2s");
    expect(formatDuration(9900)).toBe("9.9s");
  });

  it("should format durations 10s–59s as whole seconds", () => {
    expect(formatDuration(10_000)).toBe("10s");
    expect(formatDuration(30_500)).toBe("31s");
    expect(formatDuration(59_400)).toBe("59s");
  });

  it("should format exactly 1 minute", () => {
    expect(formatDuration(60_000)).toBe("1m");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(63_100)).toBe("1m 3s");
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("should omit seconds when they are zero beyond 1 minute", () => {
    expect(formatDuration(120_000)).toBe("2m");
    expect(formatDuration(180_000)).toBe("3m");
  });

  it("should format hours and minutes", () => {
    expect(formatDuration(3_661_000)).toBe("1h 1m");
    expect(formatDuration(7_200_000)).toBe("2h");
  });

  it("should format zero milliseconds as 0.0s", () => {
    // 0ms rounds to 0.0s (not treated as an error/invalid value)
    expect(formatDuration(0)).toBe("0.0s");
  });

  it("should return '—' for negative input", () => {
    expect(formatDuration(-100)).toBe("—");
  });

  it("should return '—' for NaN input", () => {
    expect(formatDuration(NaN)).toBe("—");
  });

  it("should return '—' for Infinity input", () => {
    expect(formatDuration(Infinity)).toBe("—");
  });
});

// ─── formatBytes ──────────────────────────────────────────────

describe("formatBytes", () => {
  it("should format bytes under 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("should format kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10_240)).toBe("10.0 KB");
  });

  it("should format megabytes", () => {
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
    expect(formatBytes(2_097_152)).toBe("2.0 MB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  it("should format gigabytes", () => {
    expect(formatBytes(1_073_741_824)).toBe("1.0 GB");
  });

  it("should return '—' for negative input", () => {
    expect(formatBytes(-1)).toBe("—");
  });

  it("should return '—' for NaN input", () => {
    expect(formatBytes(NaN)).toBe("—");
  });

  it("should return '—' for Infinity input", () => {
    expect(formatBytes(Infinity)).toBe("—");
  });
});

// ─── formatCount ─────────────────────────────────────────────

describe("formatCount", () => {
  it("should format small numbers without separators", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(999)).toBe("999");
  });

  it("should format thousands with a separator", () => {
    // Locale-aware; use a regex to allow both ',' and '.' as separator
    const result = formatCount(1234);
    expect(result).toMatch(/1.234/);
  });

  it("should format millions", () => {
    const result = formatCount(1_234_567);
    expect(result).toMatch(/1.234.567/);
  });

  it("should return '—' for NaN input", () => {
    expect(formatCount(NaN)).toBe("—");
  });

  it("should return '—' for Infinity input", () => {
    expect(formatCount(Infinity)).toBe("—");
  });

  it("should handle negative numbers without throwing", () => {
    expect(() => formatCount(-42)).not.toThrow();
  });
});
