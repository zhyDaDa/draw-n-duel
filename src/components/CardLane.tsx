import { Tooltip } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CardInstance, InteractionRequest } from "../game/types";
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
  deckStats: CardDeckStats;
  deckRemaining: number;
  activeCard?: CardInstance;
  holdSlots: CardInstance[];
  maxHoldSlots?: number;
  animationEvent: CardLaneAnimationEvent | null;
  pendingInteraction?: InteractionRequest | null;
  interactionOwnerName?: string;
  isInteractionOwner?: boolean;
}

type GhostCard = {
  card: CardInstance;
  origin: "active" | "hold";
  animation: "fade-up" | "fade-down";
  key: number;
};

const rarityLabel: Record<CardInstance["C_rarity"], string> = {
  1: "阶 1",
  2: "阶 2",
  3: "阶 3",
  4: "阶 4",
  5: "阶 5",
  common: "普通",
  uncommon: "罕见",
  rare: "稀有",
  legendary: "传说",
  mythic: "究极",
};

const renderTooltip = (card: CardInstance): ReactNode => (
  <div className="card-chip__tooltip tooltip-light__panel">
    <header>
      <strong>{card.C_name}</strong>
      <span>{rarityLabel[card.C_rarity]}</span>
    </header>
    <p>{describeCardEffect(card)}</p>
    <p>{card.C_description}</p>
    {card.C_keywords?.length ? (
      <ul>
        {card.C_keywords.map((keyword) => (
          <li key={keyword}>{keyword}</li>
        ))}
      </ul>
    ) : null}
  </div>
);

export interface CardDeckStats {
  total: number;
  remaining: number;
  remaining_rare: number;
  remaining_shard: number;
}
const renderDeckTooltip = (stats: CardDeckStats): ReactNode => (
  <div className="card-chip__tooltip tooltip-light__panel">
    <header>
      <strong>牌堆情况</strong>
    </header>
    <p>总数: {stats.total}</p>
    <p>剩余: {stats.remaining}</p>
    <p>稀有: {stats.remaining_rare}</p>
    <p>碎片: {stats.remaining_shard}</p>
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
      classNames={{ root: "tooltip-light" }}
    >
      <div className={`card-slot__card ${extraClass}`}>
        <CardDisplay card={card} size="sm" />
      </div>
    </Tooltip>
  );
};

const CardLane: React.FC<CardLaneProps> = ({
  deckStats,
  deckRemaining,
  activeCard,
  holdSlots,
  maxHoldSlots = DEFAULT_MAX_HOLD_SLOTS,
  animationEvent,
  pendingInteraction,
  interactionOwnerName,
  isInteractionOwner = false,
}) => {
  const [ghostCard, setGhostCard] = useState<GhostCard | null>(null);
  const [stackShiftKey, setStackShiftKey] = useState<number | null>(null);
  const currentEventKey = animationEvent?.timestamp ?? 0;
  const slotGroupRef = useRef<HTMLDivElement | null>(null);

  const activeCardClass = useMemo(() => {
    if (!animationEvent || !activeCard) return "";
    if (animationEvent.card.instanceId !== activeCard.instanceId) return "";
    if (animationEvent.type === "draw") return "card-slot__card--draw";
    return "";
  }, [animationEvent, activeCard]);

  const interactionMessage = pendingInteraction
    ? isInteractionOwner
      ? "等待你做出选择…"
      : `${interactionOwnerName ?? "对手"} 正在考虑…`
    : null;

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

  const overflowCards = holdSlots.slice(2);
  const overflowCount = overflowCards.length;

  // 是否启用横向滚动：只有当滞留位超过 2 才开启
  const scrollable = maxHoldSlots > 2;

  // 样式由 CSS 控制，故无需测量宽度（使用 CSS 变量 --card-slot-width）

  // 将鼠标垂直滚轮映射为横向滚动（仅当启用横向滚动时）
  const onWheelForSlots = (e: React.WheelEvent) => {
    if (!scrollable) return;
    const el = slotGroupRef.current;
    if (!el) return;
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 0) {
      e.preventDefault();
      // 使用平滑滚动
      el.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  const renderOverflowTooltip = (): ReactNode => {
    if (overflowCount === 0) return null;
    return (
      <div className="card-slot__overflow-tooltip">
        {overflowCards.map((card, idx) => (
          <div key={card.instanceId} className="card-slot__overflow-item">
            <strong>{`滞留位 ${idx + 3}`}</strong>
            <div className="card-slot__overflow-name">{card.C_name}</div>
            <div className="card-slot__overflow-desc">
              {describeCardEffect(card)}
            </div>
            {idx < overflowCards.length - 1 ? <hr /> : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="card-lane" aria-label="卡牌分区">
      <div className="card-slot card-slot--deck">
        <Tooltip
          title={renderDeckTooltip(deckStats)}
          placement="top"
          classNames={{ root: "tooltip-light" }}
        >
          <div className="card-slot__deck">
            <span className="card-slot__deck-count">{deckRemaining}</span>
          </div>
        </Tooltip>
        <span className="card-slot__deck-label">牌堆</span>
      </div>

      <div className="card-slot card-slot--active">
        {activeCard ? (
          renderCard(activeCard, {
            extraClass: [
              activeCardClass,
              pendingInteraction ? "card-slot__card--pending" : "",
            ]
              .filter(Boolean)
              .join(" "),
          })
        ) : (
          <div className="card-slot__placeholder">等待抽牌</div>
        )}
        {activeCard && pendingInteraction ? (
          <div className="card-slot__pending-overlay">
            <span>{interactionMessage}</span>
          </div>
        ) : null}
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
        ref={slotGroupRef}
        onWheel={onWheelForSlots}
        className={`card-slot-group ${
          stackShiftKey ? "card-slot-group--animated" : ""
        } ${scrollable ? "card-slot-group--scrollable" : ""}`}
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
            <span className="card-slot__label">
              滞留位 {index + 1}
              {index === 1 && overflowCount > 0 ? (
                <Tooltip
                  title={renderOverflowTooltip()}
                  placement="top"
                  classNames={{ root: "tooltip-light" }}
                >
                  <span className="card-slot__overflow-indicator">
                    +{overflowCount}
                  </span>
                </Tooltip>
              ) : null}
            </span>
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
