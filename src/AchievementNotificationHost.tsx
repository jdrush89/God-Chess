import { Gift, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementId,
  type AchievementProgress,
} from "./achievements";
import { GODS } from "./game/gods";
import { GOD_SKINS, isGodSkinUnlocked } from "./godSkins";
import { PIECE_THEME_OPTIONS } from "./pieceThemes";

const ACHIEVEMENT_UNLOCKED_EVENT = "god-chess:achievement-unlocked";
const DISPLAY_MS = 5_000;
const EXIT_MS = 350;

export interface AchievementUnlockNotice {
  id: AchievementId;
  title: string;
  description: string;
  completedAt: string;
  rewards: string[];
}

const unlockedRewards = (
  before: AchievementProgress["completed"],
  after: AchievementProgress["completed"],
) => {
  const rewards = new Set<string>();

  PIECE_THEME_OPTIONS.forEach((theme) => {
    if (
      theme.unlockAchievementId &&
      !before[theme.unlockAchievementId] &&
      after[theme.unlockAchievementId]
    ) {
      rewards.add(`${theme.name} piece theme`);
    }
  });

  GODS.forEach((god) => {
    GOD_SKINS[god.id].forEach((skin) => {
      if (
        skin.id !== "base" &&
        !isGodSkinUnlocked(god.id, skin.id, before) &&
        isGodSkinUnlocked(god.id, skin.id, after)
      ) {
        rewards.add(`${god.name}: ${skin.name} skin`);
      }
    });
  });

  return [...rewards];
};

export const createAchievementUnlockNotices = (
  before: AchievementProgress,
  after: AchievementProgress,
): AchievementUnlockNotice[] => {
  let completed = { ...before.completed };
  return ACHIEVEMENT_DEFINITIONS.flatMap((achievement) => {
    const completedAt = after.completed[achievement.id];
    if (!completedAt || before.completed[achievement.id]) return [];
    const nextCompleted = {
      ...completed,
      [achievement.id]: completedAt,
    };
    const rewards = unlockedRewards(completed, nextCompleted);
    completed = nextCompleted;
    return [{
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      completedAt,
      rewards,
    }];
  });
};

export const announceAchievementUnlocks = (
  before: AchievementProgress,
  after: AchievementProgress,
) => {
  if (typeof window === "undefined") return;
  createAchievementUnlockNotices(before, after).forEach((notice) => {
    window.dispatchEvent(new CustomEvent<AchievementUnlockNotice>(
      ACHIEVEMENT_UNLOCKED_EVENT,
      { detail: notice },
    ));
  });
};

export function AchievementNotificationHost() {
  const [queue, setQueue] = useState<AchievementUnlockNotice[]>([]);
  const [exiting, setExiting] = useState(false);
  const current = queue[0];

  useEffect(() => {
    const receiveNotice = (event: Event) => {
      const notice = (event as CustomEvent<AchievementUnlockNotice>).detail;
      setQueue((pending) => [...pending, notice]);
    };
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, receiveNotice);
    return () =>
      window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, receiveNotice);
  }, []);

  useEffect(() => {
    if (!current) return;
    setExiting(false);
    const exitTimer = window.setTimeout(() => setExiting(true), DISPLAY_MS);
    const removeTimer = window.setTimeout(() => {
      setQueue((pending) => pending.slice(1));
      setExiting(false);
    }, DISPLAY_MS + EXIT_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, [current]);

  return (
    <div
      className="achievement-notification-region"
      aria-live="polite"
      aria-atomic="true"
    >
      {current && (
        <aside
          className={`achievement-notification ${exiting ? "leaving" : ""}`}
          role="status"
          aria-label={`Achievement unlocked: ${current.title}`}
        >
          <span className="achievement-notification-icon" aria-hidden="true">
            <Trophy size={23} />
          </span>
          <span className="achievement-notification-copy">
            <small>Achievement unlocked</small>
            <strong>{current.title}</strong>
            <span>{current.description}</span>
            {current.rewards.length > 0 && (
              <span className="achievement-notification-reward">
                <Gift size={14} aria-hidden="true" />
                Unlocked: {current.rewards.join(", ")}
              </span>
            )}
          </span>
        </aside>
      )}
    </div>
  );
}
