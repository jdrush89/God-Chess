import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Lock, Star } from "lucide-react";
import type { AchievementId } from "./achievements";
import { godSkinAchievementRequirement } from "./godAchievementUnlocks";
import { GOD_BY_ID } from "./game/gods";
import type { GodId } from "./game/types";
import {
  GOD_SKINS,
  godSkin,
  isGodSkinUnlocked,
  type GodSkinId,
} from "./godSkins";

export function GodSkinPicker({
  godId,
  selectedSkinId,
  favoriteSkinId,
  onSelect,
  onFavorite,
  completedAchievements = {},
}: {
  godId: GodId;
  selectedSkinId: GodSkinId;
  favoriteSkinId?: GodSkinId;
  onSelect: (skinId: GodSkinId) => void;
  onFavorite?: (skinId: GodSkinId) => void;
  completedAchievements?: Partial<Record<AchievementId, string>>;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLElement>(null);
  const optionsId = useId();
  const selected = godSkin(godId, selectedSkinId);
  const unlocked = isGodSkinUnlocked(
    godId,
    selected.id,
    completedAchievements,
  );
  const unlockRequirement = godSkinAchievementRequirement(godId, selected.id);

  useEffect(() => {
    setOpen(false);
  }, [godId]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [godId]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <section
      className="skin-picker"
      aria-label={`${GOD_BY_ID[godId].name} skins`}
      ref={pickerRef}
    >
      <div className="skin-picker-heading">
        <span>SKINS</span>
      </div>
      <div className={`skin-select ${open ? "open" : ""}`}>
        <button
          type="button"
          className={`skin-select-trigger ${unlocked ? "" : "locked"}`}
          aria-expanded={open}
          aria-controls={optionsId}
          aria-label={`Choose ${GOD_BY_ID[godId].name} skin, ${selected.name} ${unlocked ? "unlocked" : "locked"}`}
          onClick={() => setOpen((current) => !current)}
        >
          <img src={selected.src} alt="" decoding="async" />
          <span className="skin-select-copy">
            <strong>{selected.name}</strong>
            <small>{unlocked ? "Unlocked" : "Locked"}</small>
          </span>
          {!unlocked && <Lock className="skin-select-status-icon" size={14} aria-hidden="true" />}
          <ChevronDown className="skin-select-chevron" size={17} aria-hidden="true" />
        </button>
        {open && (
          <div
            className="skin-options"
            id={optionsId}
            role="listbox"
            aria-label={`${GOD_BY_ID[godId].name} skin options`}
          >
            {GOD_SKINS[godId].map((skin) => {
              const skinUnlocked = isGodSkinUnlocked(
                godId,
                skin.id,
                completedAchievements,
              );
              const favorite = favoriteSkinId === skin.id;
              return (
                <div className="skin-option-shell" key={skin.id}>
                  <button
                    type="button"
                    role="option"
                    className={`skin-option ${selectedSkinId === skin.id ? "selected" : ""} ${skinUnlocked ? "" : "locked"}`}
                    aria-selected={selectedSkinId === skin.id}
                    onClick={() => {
                      onSelect(skin.id);
                      setOpen(false);
                    }}
                  >
                    <img
                      src={skin.src}
                      alt=""
                      decoding="async"
                    />
                    <span>
                      <strong>{skin.name}</strong>
                      <small>{skinUnlocked ? "Unlocked" : "Locked"}</small>
                    </span>
                    {!skinUnlocked
                      ? <Lock size={14} aria-hidden="true" />
                      : selectedSkinId === skin.id
                        ? <Check size={15} aria-hidden="true" />
                        : null}
                  </button>
                  {onFavorite && skinUnlocked && (
                    <button
                      type="button"
                      className={`skin-favorite ${favorite ? "active" : ""}`}
                      aria-label={`${favorite ? "Remove" : "Set"} ${skin.name} as favorite`}
                      aria-pressed={favorite}
                      onClick={() => onFavorite(skin.id)}
                    >
                      <Star size={15} fill={favorite ? "currentColor" : "none"} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!unlocked && (
        <p className="skin-locked-note">
          <Lock size={13} />
          {unlockRequirement === "all"
            ? `Complete an achievement for each of ${GOD_BY_ID[godId].name}'s three abilities to unlock this skin.`
            : `Complete one of ${GOD_BY_ID[godId].name}'s ability achievements to unlock this skin.`}
        </p>
      )}
    </section>
  );
}
