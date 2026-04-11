/**
 * Tests for the URL sharing utility module.
 *
 * Validates: encoding, decoding, share-URL construction,
 * search-param parsing, and all edge-case inputs.
 */

import { describe, it, expect } from "vitest";
import {
  encodeRepoParam,
  decodeRepoParam,
  buildShareUrl,
  parseRepoFromSearchParams,
} from "@/lib/share";

// ─── encodeRepoParam ──────────────────────────────────────────

describe("encodeRepoParam", () => {
  it("should encode a standard GitHub HTTPS URL", () => {
    const encoded = encodeRepoParam("https://github.com/owner/repo");
    expect(encoded).toBe("https%3A%2F%2Fgithub.com%2Fowner%2Frepo");
  });

  it("should encode a URL with dots in the repo name", () => {
    const encoded = encodeRepoParam("https://github.com/vercel/next.js");
    expect(encoded).toBe("https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js");
  });

  it("should trim leading and trailing whitespace before encoding", () => {
    const encoded = encodeRepoParam("  https://github.com/owner/repo  ");
    expect(encoded).toBe("https%3A%2F%2Fgithub.com%2Fowner%2Frepo");
  });

  it("should encode special characters in owner/repo names", () => {
    const encoded = encodeRepoParam("https://github.com/my-org/my_repo.v2");
    expect(encoded).toContain("my-org");
    // hyphens and underscores may be encoded or passed through — just ensure it round-trips
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toBe("https://github.com/my-org/my_repo.v2");
  });

  it("should produce a string safe for use in a query parameter", () => {
    const encoded = encodeRepoParam("https://github.com/a/b");
    // Must not contain unescaped ':', '/', '?', '#', '&'
    expect(encoded).not.toMatch(/[:/?#&]/);
  });

  it("should encode an empty string to an empty string", () => {
    expect(encodeRepoParam("")).toBe("");
  });
});

// ─── decodeRepoParam ──────────────────────────────────────────

describe("decodeRepoParam", () => {
  it("should decode an encoded GitHub URL", () => {
    const decoded = decodeRepoParam(
      "https%3A%2F%2Fgithub.com%2Fowner%2Frepo"
    );
    expect(decoded).toBe("https://github.com/owner/repo");
  });

  it("should return the input unchanged if it is already a plain URL", () => {
    // decodeURIComponent on an already-decoded string returns it as-is
    const decoded = decodeRepoParam("https://github.com/owner/repo");
    expect(decoded).toBe("https://github.com/owner/repo");
  });

  it("should return null for an empty string", () => {
    expect(decodeRepoParam("")).toBeNull();
  });

  it("should return null for a whitespace-only string", () => {
    expect(decodeRepoParam("   ")).toBeNull();
  });

  it("should return null for malformed percent-encoding", () => {
    expect(decodeRepoParam("%ZZ%invalid")).toBeNull();
  });

  it("should trim whitespace before decoding", () => {
    const decoded = decodeRepoParam(
      "  https%3A%2F%2Fgithub.com%2Fa%2Fb  "
    );
    expect(decoded).toBe("https://github.com/a/b");
  });
});

// ─── Round-trip encode → decode ───────────────────────────────

describe("encode / decode round-trip", () => {
  const URLS = [
    "https://github.com/owner/repo",
    "https://github.com/facebook/react",
    "https://github.com/vercel/next.js",
    "https://github.com/my-org/my_project.v2",
    "github.com/pallets/flask",
  ];

  for (const url of URLS) {
    it(`should round-trip: ${url}`, () => {
      expect(decodeRepoParam(encodeRepoParam(url))).toBe(url);
    });
  }
});

// ─── buildShareUrl ────────────────────────────────────────────

describe("buildShareUrl", () => {
  it("should build a URL with the encoded repo as ?repo= param", () => {
    const shareUrl = buildShareUrl(
      "https://github.com/owner/repo",
      "https://ghexplainer.app/"
    );
    expect(shareUrl).toBe(
      "https://ghexplainer.app/?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo"
    );
  });

  it("should strip any existing query string from the base URL", () => {
    const shareUrl = buildShareUrl(
      "https://github.com/owner/repo",
      "https://ghexplainer.app/?old=param"
    );
    expect(shareUrl).not.toContain("old=param");
    expect(shareUrl).toContain("?repo=");
  });

  it("should work with a base URL that has no trailing slash", () => {
    const shareUrl = buildShareUrl(
      "https://github.com/owner/repo",
      "https://example.com/app"
    );
    expect(shareUrl).toBe(
      "https://example.com/app?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo"
    );
  });

  it("should encode the repo URL in the output", () => {
    const shareUrl = buildShareUrl(
      "https://github.com/a/b",
      "https://example.com/"
    );
    // colons and slashes in the repo URL must be percent-encoded in the param
    const paramValue = shareUrl.split("?repo=")[1];
    expect(paramValue).not.toContain(":");
    expect(paramValue).not.toContain("/");
  });

  it("should produce a URL from which the repo can be recovered", () => {
    const repoUrl = "https://github.com/vercel/next.js";
    const shareUrl = buildShareUrl(repoUrl, "https://example.com/");
    const params = new URLSearchParams(shareUrl.split("?")[1]);
    expect(parseRepoFromSearchParams(params)).toBe(repoUrl);
  });
});

// ─── parseRepoFromSearchParams ────────────────────────────────

describe("parseRepoFromSearchParams", () => {
  it("should extract and decode the repo param", () => {
    const params = new URLSearchParams(
      "repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo"
    );
    expect(parseRepoFromSearchParams(params)).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("should return null when the repo param is absent", () => {
    const params = new URLSearchParams("other=value");
    expect(parseRepoFromSearchParams(params)).toBeNull();
  });

  it("should return null when the repo param is empty", () => {
    const params = new URLSearchParams("repo=");
    expect(parseRepoFromSearchParams(params)).toBeNull();
  });

  it("should handle a plain (non-encoded) URL in the param", () => {
    const params = new URLSearchParams();
    params.set("repo", "https://github.com/owner/repo");
    expect(parseRepoFromSearchParams(params)).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("should return null for a malformed percent-encoded param", () => {
    const params = new URLSearchParams("repo=%ZZ");
    expect(parseRepoFromSearchParams(params)).toBeNull();
  });

  it("should accept a plain object with a get() method", () => {
    const fakeParams = {
      get(key: string) {
        return key === "repo"
          ? "https%3A%2F%2Fgithub.com%2Fa%2Fb"
          : null;
      },
    };
    expect(parseRepoFromSearchParams(fakeParams)).toBe(
      "https://github.com/a/b"
    );
  });

  it("should return null when get() returns null", () => {
    const fakeParams = { get: () => null };
    expect(parseRepoFromSearchParams(fakeParams)).toBeNull();
  });
});
