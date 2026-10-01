import { useEffect, useState, type MouseEvent } from "react";
import type { Ability } from "./game/types";

export function LevelSelector({
  level,
  onChange,
  label = "Preview",
  className = "",
}: {
  level: number;
  onChange: (level: number) => void;
  label?: string;
  className?: string;
}) {
  const selectLevel = (event: MouseEvent<HTMLButtonElement>, nextLevel: number) => {
    event.stopPropagation();
    onChange(nextLevel);
  };

  return (
    <div className={`level-selector ${className}`} aria-label={`${label} levels`}>
      <span>{label}</span>
      <button
        type="button"
        aria-pressed={level >= 2}
        className={level >= 2 ? "active" : ""}
        onClick={(event) => selectLevel(event, level >= 2 ? 1 : 2)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <i /> Lv 2
      </button>
      <button
        type="button"
        aria-pressed={level >= 3}
        className={level >= 3 ? "active" : ""}
        onClick={(event) => selectLevel(event, level >= 3 ? 2 : 3)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <i /> Lv 3
      </button>
    </div>
  );
}

export function AbilityRules({
  ability,
  level,
  previewLevelOverride,
  compact = false,
}: {
  ability: Ability;
  level: number;
  previewLevelOverride?: number;
  compact?: boolean;
}) {
  const [previewLevel, setPreviewLevel] = useState(previewLevelOverride ?? level);

  useEffect(() => {
    setPreviewLevel(previewLevelOverride ?? level);
  }, [ability.id, level, previewLevelOverride]);

  return (
    <div className={`ability-rules ${compact ? "compact" : ""}`}>
      <p>{ability.summary}</p>
      {previewLevel >= 2 && ability.details[1] && (
        <p className="level-rule"><b>Lv 2:</b> {ability.details[1]}</p>
      )}
      {previewLevel >= 3 && ability.details[2] && (
        <p className="level-rule"><b>Lv 3:</b> {ability.details[2]}</p>
      )}
      <LevelSelector
        level={previewLevel}
        onChange={setPreviewLevel}
        label="Preview"
        className="ability-level-selector"
      />
    </div>
  );
}
