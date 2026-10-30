// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  profileUpsert: vi.fn(),
  profileMaybeSingle: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("./supabase", () => ({
  accountsConfigured: true,
  supabase: {
    auth: {
      getSession: accountMocks.getSession,
      onAuthStateChange: accountMocks.onAuthStateChange,
      updateUser: accountMocks.updateUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: accountMocks.profileMaybeSingle,
        }),
      }),
      upsert: accountMocks.profileUpsert,
    }),
  },
}));

import {
  createProfileUpsert,
  createSignUpMetadata,
  isPasswordRecoveryUrl,
  isMissingPortraitColumnError,
  resolveAuthRedirectUrl,
  resolveDisplayName,
  resolveLocalDataImportPending,
  useAccount,
} from "./useAccount";

describe("resolveAuthRedirectUrl", () => {
  beforeEach(() => {
    accountMocks.getSession.mockReset();
    accountMocks.onAuthStateChange.mockReset();
    accountMocks.updateUser.mockReset();
    accountMocks.profileUpsert.mockReset();
    accountMocks.profileMaybeSingle.mockReset();
    accountMocks.unsubscribe.mockReset();
    accountMocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "player-id",
            email: "athena@example.com",
            user_metadata: {
              display_name: "Athena",
              portrait_id: "quetzacoatl",
              piece_theme: "classic",
            },
          },
        },
      },
      error: null,
    });
    accountMocks.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: accountMocks.unsubscribe,
        },
      },
    });
    accountMocks.profileMaybeSingle.mockResolvedValue({
      data: {
        display_name: "Athena",
        public_id: "gc-athena01",
        portrait_id: "quetzacoatl",
        piece_theme: "classic",
      },
      error: null,
    });
    accountMocks.profileUpsert.mockResolvedValue({ error: null });
    accountMocks.updateUser.mockResolvedValue({ error: null });
  });

  it("backs up portrait changes in auth metadata for profile recovery", async () => {
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account?.portraitId).toBe(
      "quetzacoatl",
    ));

    await act(async () => {
      await result.current.updatePortrait("kangus");
    });

    expect(accountMocks.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "player-id",
        portrait_id: "kangus",
      }),
    );
    expect(accountMocks.updateUser).toHaveBeenCalledWith({
      data: { portrait_id: "kangus" },
    });
    expect(result.current.account?.portraitId).toBe("kangus");
  });

  it("stores piece theme changes in account metadata and applies them", async () => {
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account?.pieceTheme).toBe(
      "classic",
    ));

    await act(async () => {
      await result.current.updatePieceTheme("mushroom");
    });

    expect(accountMocks.updateUser).toHaveBeenCalledWith({
      data: { piece_theme: "mushroom" },
    });
    expect(result.current.account?.pieceTheme).toBe("mushroom");
    expect(document.documentElement.dataset.pieceTheme).toBe("mushroom");
  });

  it("does not overwrite an existing profile when sign-in hydration appears missing", async () => {
    accountMocks.profileMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    renderHook(() => useAccount());

    await waitFor(() => expect(accountMocks.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "player-id",
        portrait_id: "quetzacoatl",
      }),
      {
        onConflict: "id",
        ignoreDuplicates: true,
      },
    ));
  });

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
      piece_theme: "classic",
      local_data_import_pending: true,
    });
  });

  it("recognizes the pre-portrait production schema error", () => {
    expect(isMissingPortraitColumnError({
      code: "42703",
      message: "column profiles.portrait_id does not exist",
    })).toBe(true);
    expect(isMissingPortraitColumnError({
      code: "42703",
      message: "column profiles.public_id does not exist",
    })).toBe(false);
  });

  it("omits portraits when creating a profile against the legacy schema", () => {
    expect(createProfileUpsert(
      "player-id",
      "Athena",
      "quetzacoatl",
      false,
    )).toEqual({
      id: "player-id",
      display_name: "Athena",
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

  it("recognizes Supabase password recovery redirects", () => {
    expect(isPasswordRecoveryUrl(
      "https://playgodchess.com/#access_token=token&type=recovery",
    )).toBe(true);
    expect(isPasswordRecoveryUrl(
      "https://playgodchess.com/?type=recovery",
    )).toBe(true);
    expect(isPasswordRecoveryUrl(
      "https://playgodchess.com/#type=signup",
    )).toBe(false);
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
