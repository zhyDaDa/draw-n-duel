import { Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CardInstance } from "../game/types";
import { DEFAULT_MAX_HOLD_SLOTS } from "../game/types";
import CardDisplay, { describeCardEffect } from "./CardDisplay";

export type CardLaneAnimationType =
  | "draw"
  | "stash"
  | "discard"
  | "play"
  | "release";

export interface CardLaneAnimationEvent {
  type: CardLaneAnimationType;
  card: CardInstance;
  timestamp: number;
}

interface CardLaneProps {
  deckRemaining: number;
  activeCard?: CardInstance;
  holdSlots: CardInstance[];
  maxHoldSlots?: number;
  animationEvent: CardLaneAnimationEvent | null;
}

type GhostCard = {
  card: CardInstance;
  origin: "active" | "hold";
  animation: "fade-up" | "fade-down";
  key: number;
};

const rarityLabel: Record<CardInstance["rarity"], string> = {
  common: "普通",
  uncommon: "罕见",
  rare: "稀有",
  legendary: "传说",
};

const renderTooltip = (card: CardInstance): ReactNode => (
  <div className="card-chip__tooltip tooltip-light__panel">
    <header>
      <strong>{card.name}</strong>
      <span>{rarityLabel[card.rarity]}</span>
    </header>
    <p>{describeCardEffect(card)}</p>
    <p>{card.description}</p>
    {card.keywords?.length ? (
      <ul>
        {card.keywords.map((keyword) => (
          <li key={keyword}>{keyword}</li>
        ))}
      </ul>
    ) : null}
  </div>
);

const renderCard = (
  card: CardInstance,
  options: {
    extraClass?: string;
  } = {}
): ReactNode => {
  const { extraClass = "" } = options;
  return (
    <Tooltip
      title={renderTooltip(card)}
      placement="top"
      overlayClassName="tooltip-light"
    >
      <div className={`card-slot__card ${extraClass}`}>
        <CardDisplay card={card} size="sm" />
      </div>
    </Tooltip>
  );
};

const CardLane: React.FC<CardLaneProps> = ({
  deckRemaining,
  activeCard,
  holdSlots,
  maxHoldSlots = DEFAULT_MAX_HOLD_SLOTS,
  animationEvent,
}) => {
  const [ghostCard, setGhostCard] = useState<GhostCard | null>(null);
  const [stackShiftKey, setStackShiftKey] = useState<number | null>(null);
  const currentEventKey = animationEvent?.timestamp ?? 0;

  const activeCardClass = useMemo(() => {
    if (!animationEvent || !activeCard) return "";
    if (animationEvent.card.instanceId !== activeCard.instanceId) return "";
    if (animationEvent.type === "draw") return "card-slot__card--draw";
    return "";
  }, [animationEvent, activeCard]);

  const slotCards = useMemo(
    () =>
      Array.from({ length: maxHoldSlots }).map(
        (_, index) => holdSlots[index] ?? null
      ),
    [holdSlots, maxHoldSlots]
  );

  const holdClasses = useMemo(
    () =>
      slotCards.map((card, index) => {
        if (!card) return "";
        if (!animationEvent) return "";
        if (
          animationEvent.type === "stash" &&
          animationEvent.card.instanceId === card.instanceId &&
          index === 0
        ) {
          return "card-slot__card--stash";
        }
        return "";
      }),
    [slotCards, animationEvent]
  );

  useEffect(() => {
    if (!animationEvent) return;
    if (animationEvent.type === "discard" || animationEvent.type === "play") {
      setGhostCard({
        card: animationEvent.card,
        origin: "active",
        animation: animationEvent.type === "play" ? "fade-up" : "fade-down",
        key: animationEvent.timestamp,
      });
      return;
    }
    if (animationEvent.type === "release") {
      setGhostCard({
        card: animationEvent.card,
        origin: "hold",
        animation: "fade-up",
        key: animationEvent.timestamp,
      });
      setStackShiftKey(animationEvent.timestamp);
      return;
    }
    if (animationEvent.type === "stash") {
      setStackShiftKey(animationEvent.timestamp);
    }
    setGhostCard(null);
  }, [animationEvent]);

  useEffect(() => {
    if (!ghostCard) return;
    const timer = setTimeout(() => setGhostCard(null), 550);
    return () => clearTimeout(timer);
  }, [ghostCard, currentEventKey]);

  useEffect(() => {
    if (stackShiftKey === null) return;
    const timer = setTimeout(() => setStackShiftKey(null), 450);
    return () => clearTimeout(timer);
  }, [stackShiftKey]);

  return (
    <section className="card-lane" aria-label="卡牌分区">
      <div className="card-slot card-slot--deck">
        <div className="card-slot__deck">
          <span className="card-slot__deck-count">{deckRemaining}</span>
        </div>
        <span className="card-slot__deck-label">牌堆</span>
      </div>

      <div className="card-slot card-slot--active">
        {activeCard ? (
          renderCard(activeCard, { extraClass: activeCardClass })
        ) : (
          <div className="card-slot__placeholder">等待抽牌</div>
        )}
        {ghostCard && ghostCard.origin === "active" && (
          <div
            key={ghostCard.key}
            className={`card-slot__ghost card-slot__ghost--${ghostCard.animation}`}
          >
            {renderCard(ghostCard.card)}
          </div>
        )}
        <span className="card-slot__label">当前卡牌</span>
      </div>

      <div className="card-lane__divider" aria-hidden="true" />

      <div
        className={`card-slot-group ${
          stackShiftKey ? "card-slot-group--animated" : ""
        }`}
      >
        {slotCards.map((card, index) => (
          <div
            key={card ? card.instanceId : `slot-${index}`}
            className="card-slot card-slot--hold"
          >
            {card ? (
              renderCard(card, { extraClass: holdClasses[index] })
            ) : (
              <div className="card-slot__placeholder card-slot__placeholder--hold">
                滞留位空
              </div>
            )}
            <span className="card-slot__label">滞留位 {index + 1}</span>
          </div>
        ))}
        {ghostCard && ghostCard.origin === "hold" && (
          <div
            key={ghostCard.key}
            className={`card-slot__ghost card-slot__ghost--${ghostCard.animation}`}
          >
            {renderCard(ghostCard.card)}
          </div>
        )}
      </div>
    </section>
  );
};

export default CardLane;
