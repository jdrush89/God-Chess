import { describe, expect, it } from "vitest";
import {
  createSignUpMetadata,
  resolveAuthRedirectUrl,
  resolveDisplayName,
  resolveLocalDataImportPending,
} from "./useAccount";

describe("resolveAuthRedirectUrl", () => {
  it("only requests local-data import for the explicit signup marker", () => {
    expect(resolveLocalDataImportPending(true)).toBe(true);
    expect(resolveLocalDataImportPending(false)).toBe(false);
    expect(resolveLocalDataImportPending(undefined)).toBe(false);
    expect(resolveLocalDataImportPending("true")).toBe(false);
  });

  it("marks newly created accounts for the one-time import decision", () => {
    expect(createSignUpMetadata("  Athena  ")).toEqual({
      display_name: "Athena",
      portrait_id: "quetzacoatl",
      local_data_import_pending: true,
    });
  });

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
