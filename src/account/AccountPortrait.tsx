import { GodPortrait } from "../PlayerGodPanel";
import {
  ACCOUNT_PORTRAITS,
  normalizeAccountPortraitId,
  type AccountPortraitId,
} from "./portraits";

export function AccountPortrait({
  portraitId,
  className = "",
  alt,
}: {
  portraitId?: AccountPortraitId;
  className?: string;
  alt?: string;
}) {
  const normalized = normalizeAccountPortraitId(portraitId);
  const portrait = ACCOUNT_PORTRAITS.find(({ id }) => id === normalized);
  return (
    <GodPortrait
      godId={normalized}
      className={`account-portrait portrait-${normalized} ${className}`.trim()}
      alt={alt ?? `${portrait?.name ?? "God"} account portrait`}
    />
  );
}

export function AccountPortraitPicker({
  value,
  disabled = false,
  onChange,
}: {
  value: AccountPortraitId;
  disabled?: boolean;
  onChange: (portraitId: AccountPortraitId) => void;
}) {
  return (
    <div className="account-portrait-picker">
      <span>Account portrait</span>
      <div role="radiogroup" aria-label="Account portrait">
        {ACCOUNT_PORTRAITS.map((portrait) => (
          <button
            type="button"
            className={value === portrait.id ? "selected" : ""}
            disabled={disabled}
            role="radio"
            aria-checked={value === portrait.id}
            aria-label={portrait.name}
            title={portrait.name}
            onClick={() => onChange(portrait.id)}
            key={portrait.id}
          >
            <AccountPortrait portraitId={portrait.id} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}
