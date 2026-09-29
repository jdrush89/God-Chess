import { describe, expect, it } from "vitest";
import { resolveAuthRedirectUrl } from "./useAccount";

describe("resolveAuthRedirectUrl", () => {
  it("preserves the GitHub Pages project path for a relative Vite base", () => {
    expect(
      resolveAuthRedirectUrl(
        "https://jdrush89.github.io/God-Chess/?code=confirmation#session",
        "./",
      ),
    ).toBe("https://jdrush89.github.io/God-Chess/");
  });

  it("resolves to the local development root", () => {
    expect(resolveAuthRedirectUrl("http://localhost:5173/", "./")).toBe(
      "http://localhost:5173/",
    );
  });
});
