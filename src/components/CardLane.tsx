import { Tooltip } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_MAX_HOLD_SLOTS,
  type CardInstance,
  type CardSituationState,
  type InteractionRequest,
} from "../game/types";
import CardDisplay, {
  describeCardEffect,
  toneLabel as rarityLabel,
} from "./CardDisplay";

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
  activeCardState?: CardSituationState;
  holdStates: CardSituationState[];
  maxHoldSlots?: number;
  animationEvent: CardLaneAnimationEvent | null;
  pendingInteraction?: InteractionRequest | null;
  interactionOwnerName?: string;
  isInteractionOwner?: boolean;
  onDeckClick?: () => void;
}

type GhostCard = {
  card: CardInstance;
  origin: "active" | "hold";
  animation: "fade-up" | "fade-down";
  key: number;
};

const renderTooltip = (state: CardSituationState): ReactNode => {
  const card = state.C_current;
  return (
    <div className="card-chip__tooltip tooltip-light__panel">
      <header>
        <strong>{card.C_name}</strong>
        <span>{rarityLabel[card.C_rarity]}</span>
      </header>
      <p>{describeCardEffect(state)}</p>
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
};

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
  state: CardSituationState,
  options: {
    extraClass?: string;
  } = {}
): ReactNode => {
  const { extraClass = "" } = options;
  return (
    <Tooltip
      title={renderTooltip(state)}
      placement="top"
      classNames={{ root: "tooltip-light" }}
    >
      <div className={`card-slot__card ${extraClass}`}>
        <CardDisplay state={state} size="sm" />
      </div>
    </Tooltip>
  );
};

const cloneSituationForCard = (
  card: CardInstance,
  reference?: CardSituationState
): CardSituationState | null => {
  if (!reference) return null;
  return {
    ...reference,
    C_current: card,
  };
};

const CardLane: React.FC<CardLaneProps> = ({
  deckStats,
  deckRemaining,
  activeCardState,
  holdStates,
  maxHoldSlots = DEFAULT_MAX_HOLD_SLOTS,
  animationEvent,
  pendingInteraction,
  interactionOwnerName,
  isInteractionOwner = false,
  onDeckClick,
}) => {
  const [ghostCard, setGhostCard] = useState<GhostCard | null>(null);
  const [stackShiftKey, setStackShiftKey] = useState<number | null>(null);
  const currentEventKey = animationEvent?.timestamp ?? 0;
  const slotGroupRef = useRef<HTMLDivElement | null>(null);
  const resolveGhostReference = (origin: GhostCard["origin"]) =>
    origin === "active"
      ? activeCardState ?? holdStates[0]
      : holdStates[0] ?? activeCardState;
  const renderGhostContent = (ghost: GhostCard) => {
    const reference = resolveGhostReference(ghost.origin);
    const ghostState = cloneSituationForCard(ghost.card, reference);
    return ghostState ? renderCard(ghostState) : null;
  };

  const activeCard = activeCardState?.C_current;

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
        (_, index) => holdStates[index] ?? null
      ),
    [holdStates, maxHoldSlots]
  );

  const holdClasses = useMemo(
    () =>
      slotCards.map((state, index) => {
        if (!state) return "";
        if (!animationEvent) return "";
        if (
          animationEvent.type === "stash" &&
          animationEvent.card.instanceId === state.C_current.instanceId &&
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

  const overflowStates = holdStates.slice(2);
  const overflowCount = overflowStates.length;

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
        {overflowStates.map((state, idx) => (
          <div
            key={state.C_current.instanceId}
            className="card-slot__overflow-item"
          >
            <strong>{`滞留位 ${idx + 3}`}</strong>
            <div className="card-slot__overflow-name">
              {state.C_current.C_name}
            </div>
            <div className="card-slot__overflow-desc">
              {describeCardEffect(state)}
            </div>
            {idx < overflowStates.length - 1 ? <hr /> : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="card-lane" aria-label="卡牌分区">
      <div
        className="card-slot card-slot--deck"
        role={onDeckClick ? "button" : undefined}
        tabIndex={onDeckClick ? 0 : undefined}
        onClick={onDeckClick}
        onKeyDown={(event) => {
          if (!onDeckClick) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onDeckClick();
          }
        }}
      >
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
        {activeCardState && activeCard ? (
          renderCard(activeCardState, {
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
            {renderGhostContent(ghostCard)}
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
        {slotCards.map((state, index) => (
          <div
            key={state ? state.C_current.instanceId : `slot-${index}`}
            className="card-slot card-slot--hold"
          >
            {state ? (
              renderCard(state, { extraClass: holdClasses[index] })
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
            {renderGhostContent(ghostCard)}
          </div>
        )}
      </div>
    </section>
  );
};

export default CardLane;
