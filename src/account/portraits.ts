import { GODS } from "../game/gods";
import type { GodId } from "../game/types";

export type AccountPortraitId = GodId;

export const ACCOUNT_PORTRAITS = GODS.map((god) => ({
  id: god.id,
  name: god.name,
})) satisfies Array<{
  id: AccountPortraitId;
  name: string;
}>;

export const DEFAULT_ACCOUNT_PORTRAIT_ID: AccountPortraitId =
  ACCOUNT_PORTRAITS[0].id;

const ACCOUNT_PORTRAIT_IDS = new Set<AccountPortraitId>(
  ACCOUNT_PORTRAITS.map((portrait) => portrait.id),
);

export const normalizeAccountPortraitId = (
  value: unknown,
): AccountPortraitId =>
  typeof value === "string" &&
    ACCOUNT_PORTRAIT_IDS.has(value as AccountPortraitId)
    ? value as AccountPortraitId
    : DEFAULT_ACCOUNT_PORTRAIT_ID;

