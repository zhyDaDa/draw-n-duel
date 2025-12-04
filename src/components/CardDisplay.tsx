import type { ReactNode } from "react";
import type { CardInstance, Rarity } from "../game/types";

type CardTone = Rarity | "cost-mild" | "cost-moderate" | "cost-severe";

interface CardDisplayProps {
  card?: CardInstance;
  title?: string;
  effectText?: string;
  descriptionText?: string;
  tone?: CardTone;
  highlight?: boolean;
  footer?: ReactNode;
  variant?: "default" | "merchant" | "cost";
  size?: "md" | "sm";
  className?: string;
}

export const describeCardEffect = (card: CardInstance): string => {
  const effect = card.C_effect;
  if (typeof effect.notes === "string") return effect.notes;
  if (effect.notes && typeof effect.notes === "function") {
    return "动态效果";
  }
  return `效果类型：${effect.type}`;
};

const toneLabel: Record<CardTone, string> = {
  1: "阶 1",
  2: "阶 2",
  3: "阶 3",
  4: "阶 4",
  5: "阶 5",
  common: "普通",
  uncommon: "罕见",
  rare: "稀有",
  legendary: "传说",
  "cost-mild": "轻微代价",
  "cost-moderate": "中度代价",
  "cost-severe": "高危代价",
};

export const CardDisplay: React.FC<CardDisplayProps> = ({
  card,
  title,
  effectText,
  descriptionText,
  tone,
  highlight = false,
  footer,
  variant = "default",
  size = "md",
  className = "",
}) => {
  const resolvedTone: CardTone = tone ?? card?.C_rarity ?? "common";
  const displayName = title ?? card?.C_name ?? "未命名卡牌";
  const displayEffect = effectText ?? (card ? describeCardEffect(card) : "");
  const displayDescription = descriptionText ?? card?.C_description ?? "";

  const classes = [
    "card-display",
    `card-display--${variant}`,
    `card-display--${size}`,
    highlight ? "card-display--highlight" : "",
    className,
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
