import { describe, expect, it } from "vitest";
import { resolveAuthRedirectUrl, resolveDisplayName } from "./useAccount";

describe("resolveAuthRedirectUrl", () => {
  it("preserves the GitHub Pages project path for a relative Vite base", () => {
    expect(
      resolveAuthRedirectUrl(
        "https://jdrush89.github.io/God-Chess/?code=confirmation#session",
        "./",
      ),
    ).toBe("https://jdrush89.github.io/God-Chess/");
  });

  describe("resolveDisplayName", () => {
    it("uses an existing profile name without requiring onboarding", () => {
      expect(resolveDisplayName("Athena", "Metadata", "player@example.com")).toEqual({
        savedDisplayName: "Athena",
        metadataDisplayName: "Metadata",
        displayName: "Athena",
        needsDisplayName: false,
      });
    });

    it("uses signup metadata without requiring another name prompt", () => {
      expect(resolveDisplayName(undefined, "Athena", "player@example.com")).toEqual({
        savedDisplayName: "",
        metadataDisplayName: "Athena",
        displayName: "Athena",
        needsDisplayName: false,
      });
    });

    it("uses an email fallback while requiring first-time name setup", () => {
      expect(resolveDisplayName(undefined, undefined, "new-player@example.com")).toEqual({
        savedDisplayName: "",
        metadataDisplayName: "",
        displayName: "new-player",
        needsDisplayName: true,
      });
    });
  });

  it("resolves to the local development root", () => {
    expect(resolveAuthRedirectUrl("http://localhost:5173/", "./")).toBe(
      "http://localhost:5173/",
    );
  });
});
