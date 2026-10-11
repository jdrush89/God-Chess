import { Lock, Star } from "lucide-react";
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
}: {
  godId: GodId;
  selectedSkinId: GodSkinId;
  favoriteSkinId?: GodSkinId;
  onSelect: (skinId: GodSkinId) => void;
  onFavorite?: (skinId: GodSkinId) => void;
}) {
  const selected = godSkin(godId, selectedSkinId);
  const unlocked = isGodSkinUnlocked(godId, selected.id);

  return (
    <section className="skin-picker" aria-label={`${godId} skins`}>
      <div className="skin-picker-heading">
        <span>SKINS</span>
        <small>{unlocked ? `${selected.name} · Unlocked` : `${selected.name} · Locked`}</small>
      </div>
      <div className="skin-options">
        {GOD_SKINS[godId].map((skin) => {
          const skinUnlocked = isGodSkinUnlocked(godId, skin.id);
          const favorite = favoriteSkinId === skin.id;
          return (
            <div className="skin-option-shell" key={skin.id}>
              <button
                type="button"
                className={`skin-option ${selectedSkinId === skin.id ? "selected" : ""} ${skinUnlocked ? "" : "locked"}`}
                aria-pressed={selectedSkinId === skin.id}
                onClick={() => onSelect(skin.id)}
              >
                <img src={skin.src} alt="" decoding="async" />
                <span>
                  <strong>{skin.name}</strong>
                  <small>{skinUnlocked ? "Unlocked" : "Locked"}</small>
                </span>
                {!skinUnlocked && <Lock size={14} aria-hidden="true" />}
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
      {!unlocked && (
        <p className="skin-locked-note">
          <Lock size={13} />
          You can preview this skin, but it must be unlocked before it can be drafted.
        </p>
      )}
    </section>
  );
}

