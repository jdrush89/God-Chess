import type { ReactNode } from "react";
import { AbilityRules } from "./UpgradePreview";
import type { Ability, GodId } from "./game/types";

const GOD_PORTRAITS: Record<GodId, string> = {
  quetzacoatl: new URL("./assets/gods/quetzacoatl.jpg", import.meta.url).href,
  chiron: new URL("./assets/gods/chiron.jpg", import.meta.url).href,
  anubis: new URL("./assets/gods/anubis.jpg", import.meta.url).href,
  teles: new URL("./assets/gods/teles.jpg", import.meta.url).href,
  artemis: new URL("./assets/gods/artemis.jpg", import.meta.url).href,
  kangus: new URL("./assets/gods/kangus.jpg", import.meta.url).href,
  death: new URL("./assets/gods/death.jpg", import.meta.url).href,
  leonidas: new URL("./assets/gods/leonidas.jpg", import.meta.url).href,
  medusa: new URL("./assets/gods/medusa.jpg", import.meta.url).href,
  salem: new URL("./assets/gods/salem.jpg", import.meta.url).href,
  midas: new URL("./assets/gods/midas.jpg", import.meta.url).href,
  ares: new URL("./assets/gods/ares.jpg", import.meta.url).href,
};

export function GodPortrait({
  godId,
  className = "",
  alt = "",
}: {
  godId: GodId;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      className={`god-portrait ${className}`}
      src={GOD_PORTRAITS[godId]}
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
  children?: ReactNode;
}) {
  return (
    <div
      className={`ability-card ${active ? "active" : ""} ${highlighted ? "opponent-selecting" : ""} ${disabled ? "disabled" : ""} ${!selectable && !disabled ? "read-only" : ""}`}
    >
      <div
        className="ability-card-main"
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (selectable) onClick();
        }}
        onKeyDown={(event) => {
          if (selectable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onClick();
          }
        }}
      >
        <div className="ability-topline">
          <strong>{ability.name}</strong>
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
                {!ability.cost && <span className="free-tag">GENERATES</span>}
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
