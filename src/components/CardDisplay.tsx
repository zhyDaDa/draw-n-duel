import type { ReactNode } from "react";
import type { CardSituationState, Rarity } from "../game/types";
import "./CardDisplay.less";

type CardTone = Rarity | "cost-mild" | "cost-moderate" | "cost-severe";

interface CardDisplayProps {
  state: CardSituationState;
  highlight?: boolean;
  footer?: ReactNode;
  variant?: "default" | "merchant" | "cost";
  size?: "md" | "sm";
  className?: string;
}

export const describeCardEffect = (
  state: CardSituationState
): string => {
  const effect = state.C_current.C_effect;
  if (typeof effect.notes === "string") return effect.notes;
  else if (typeof effect.notes === "function") {
    return effect.notes(state);
  } else return `效果类型：${effect.type}`;
};

export const toneLabel: Record<CardTone, string> = {
  1: "普通",
  2: "罕见",
  3: "稀有",
  4: "传说",
  5: "究极",
  common: "普通",
  uncommon: "罕见",
  rare: "稀有",
  legendary: "传说",
  mythic: "究极",
  "cost-mild": "轻微代价",
  "cost-moderate": "中度代价",
  "cost-severe": "高危代价",
};

export const CardDisplay: React.FC<CardDisplayProps> = ({
  state,
  highlight = false,
  footer,
  variant = "default",
  size = "md",
  className = "",
}) => {
  const resolvedTone: CardTone = state.C_current.C_rarity ?? "common";
  const displayName = state.C_current.C_name ?? "未命名卡牌";
  const displayEffect = state.C_current ? describeCardEffect(state) : "";
  const displayDescription = state.C_current.C_description ?? "";

  const classes = [
    className,
    "card-display",
    `card-display--${variant}`,
    `card-display--${size}`,
    `card-display--rarity-${resolvedTone}`,
    highlight ? "card-display--highlight" : "",
  ].filter(Boolean);

  return (
    <div className={classes.join(" ")} data-tone={resolvedTone}>
      <div className="card-display__rarity-bar">
        <span>{toneLabel[resolvedTone]}</span>
      </div>
      <header className="card-display__header">
        <span className="card-display__name" title={displayName}>
          {displayName}
        </span>
      </header>
      <div className="card-display__body">
        {displayEffect ? (
          <p className="card-display__effect" title={displayEffect}>
            {displayEffect}
          </p>
        ) : null}
        {displayDescription ? (
          <p className="card-display__desc" title={displayDescription}>
            {displayDescription}
          </p>
        ) : null}
      </div>
      {footer && <div className="card-display__footer">{footer}</div>}
    </div>
  );
};

export default CardDisplay;
