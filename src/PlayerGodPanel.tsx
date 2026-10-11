import type { ReactNode } from "react";
import { AbilityRules } from "./UpgradePreview";
import type { Ability, GodId } from "./game/types";
import { godSkin, type GodSkinId } from "./godSkins";

export function GodPortrait({
  godId,
  skinId = "base",
  className = "",
  alt = "",
}: {
  godId: GodId;
  skinId?: GodSkinId;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      className={`god-portrait ${className}`}
      src={godSkin(godId, skinId).src}
      alt={alt}
      decoding="async"
    />
  );
}

function AbilityOrb({
  affinity,
  count,
}: {
  affinity: "white" | "black";
  count: number;
}) {
  return (
    <span
      className="orb-count small"
      aria-label={`${count} ${affinity} orb${count === 1 ? "" : "s"}`}
    >
      <i className={`orb ${affinity}`} />
      <strong>{count}</strong>
    </span>
  );
}

export function PlayerAbilityCard({
  ability,
  level,
  previewLevel,
  active,
  selectable,
  disabled,
  footerLabel,
  footerAction,
  highlighted = false,
  showCost = true,
  onClick,
  onDoubleClick,
  children,
}: {
  ability: Ability;
  level: number;
  previewLevel?: number;
  active: boolean;
  selectable: boolean;
  disabled: boolean;
  footerLabel?: string;
  footerAction?: string;
  highlighted?: boolean;
  showCost?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`ability-card ${active ? "active" : ""} ${highlighted ? "opponent-selecting" : ""} ${disabled ? "disabled" : ""} ${!selectable && !disabled ? "read-only" : ""}`}
      data-ability-id={ability.id}
    >
      <div
        className="ability-card-main"
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (selectable) onClick();
        }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest(".level-selector")) return;
          if (selectable) onDoubleClick?.();
        }}
        onKeyDown={(event) => {
          if (selectable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onClick();
          }
        }}
      >
        <div className="ability-topline">
          <strong className="ability-card-title">{ability.name}</strong>
          <span className="level-pips">
            {[1, 2, 3].map((item) => (
              <i className={item <= level ? "filled" : ""} key={item} />
            ))}
          </span>
        </div>
        <AbilityRules
          ability={ability}
          level={level}
          previewLevelOverride={previewLevel}
        />
        <div className="ability-footer">
          <span>{footerLabel ?? `LVL ${level}`}</span>
          <div className="ability-footer-meta">
            {showCost && (
              <div className="ability-cost">
                {ability.cost?.white
                  ? <AbilityOrb affinity="white" count={ability.cost.white} />
                  : null}
                {ability.cost?.black
                  ? <AbilityOrb affinity="black" count={ability.cost.black} />
                  : null}
              </div>
            )}
            {footerAction && <b className="upgrade-tag">{footerAction}</b>}
          </div>
        </div>
      </div>
      {children && <div className="ability-pending">{children}</div>}
    </div>
  );
}
