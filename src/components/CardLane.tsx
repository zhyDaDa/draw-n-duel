import { Flex, Tooltip } from "antd";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type {
  CardInstance,
  CardSituationState,
  InteractionRequest,
} from "../game/types";
import CardDisplay, {
  describeCardEffect,
  toneLabel as rarityLabel,
} from "./CardDisplay";
import "./CardLane.less";

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

export interface CardDeckStats {
  total: number;
  remaining: number;
  remaining_rare: number;
  remaining_shard: number;
}

interface CardLaneProps {
  deckStats: CardDeckStats;
  deckRemaining: number;
  activeCardState?: CardSituationState;
  drawnStates: CardSituationState[];
  stashedStates: CardSituationState[];
  handStates: CardSituationState[];
  handSize: number;
  animationEvent: CardLaneAnimationEvent | null;
  pendingInteraction?: InteractionRequest | null;
  interactionOwnerName?: string;
  isInteractionOwner?: boolean;
  onDeckClick?: () => void;
}

type LaneSlotType = "drawn" | "stashed" | "hand";

interface LaneSlot {
  key: string;
  type: LaneSlotType;
  state?: CardSituationState;
  label: string;
  order: number;
}

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
  options: { extraClass?: string } = {}
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

const CardLane: React.FC<CardLaneProps> = ({
  deckStats,
  deckRemaining,
  activeCardState,
  drawnStates,
  stashedStates,
  handStates,
  handSize,
  animationEvent,
  pendingInteraction,
  interactionOwnerName,
  isInteractionOwner = false,
  onDeckClick,
}) => {
  const interactionMessage = pendingInteraction
    ? isInteractionOwner
      ? "等待你做出选择…"
      : `${interactionOwnerName ?? "对手"} 正在考虑…`
    : null;

  const { slots, whiteSlotCount } = useMemo(() => {
    const safeHandSize = Math.max(handSize, 0);
    if (safeHandSize === 0) {
      return { slots: [] as LaneSlot[], whiteSlotCount: 0 };
    }

    const maxDrawn = Math.min(drawnStates.length, safeHandSize);
    const combinedBlue = [...stashedStates, ...handStates];
    const maxBlue = Math.min(combinedBlue.length, safeHandSize);
    const whiteSlots = Math.max(safeHandSize - maxBlue, 0);
    const nextSlots: LaneSlot[] = [];

    for (let i = 0; i < safeHandSize; i += 1) {
      if (i < whiteSlots) {
        const state = drawnStates[i];
        nextSlots.push({
          key: state ? `drawn-${state.C_current.instanceId}` : `drawn-empty-${i}`,
          type: "drawn",
          state,
          label: `待抽区 ${i + 1}`,
          order: i,
        });
      } else {
        const blueIndex = i - whiteSlots;
        const state = combinedBlue[blueIndex];
        const isStashed = blueIndex < stashedStates.length;
        const type: LaneSlotType = isStashed ? "stashed" : "hand";
        const labelPrefix = isStashed ? "封存位" : "手牌位";
        const typeIndex = isStashed
          ? blueIndex + 1
          : blueIndex - stashedStates.length + 1;
        nextSlots.push({
          key: state
            ? `${type}-${state.C_current.instanceId}`
            : `${type}-empty-${typeIndex}`,
          type,
          state,
          label: `${labelPrefix} ${typeIndex}`,
          order: i,
        });
      }
    }

    return { slots: nextSlots, whiteSlotCount: Math.min(whiteSlots, maxDrawn) };
  }, [drawnStates, handStates, handSize, stashedStates]);

  const activeCard = activeCardState?.C_current;
  const dividerPercent = handSize > 0 ? (whiteSlotCount / handSize) * 100 : null;

  const getSlotAnimationClass = (slot: LaneSlot): string => {
    if (!slot.state || !animationEvent) return "";
    if (animationEvent.card.instanceId !== slot.state.C_current.instanceId) {
      return "";
    }
    switch (animationEvent.type) {
      case "draw":
        return slot.type === "drawn" ? "card-slot__card--draw" : "";
      case "stash":
        return slot.type === "stashed" ? "card-slot__card--stash-enter" : "";
      case "release":
        return slot.type === "hand" ? "card-slot__card--release" : "";
      case "discard":
      case "play":
        return slot.type === "drawn" ? "card-slot__card--fade" : "";
      default:
        return "";
    }
  };

  const renderSlot = (slot: LaneSlot): ReactNode => {
    if (!slot.state) {
      return (
        <div className="card-slot__placeholder">
          {slot.type === "drawn"
            ? "未抽卡"
            : slot.type === "stashed"
            ? "无封存"
            : "空手牌"}
        </div>
      );
    }

    const animationClass = getSlotAnimationClass(slot);
    const isPending =
      !!pendingInteraction &&
      !!activeCard &&
      slot.state.C_current.instanceId === activeCard.instanceId;

    return (
      <div className="card-slot__card-wrapper">
        {renderCard(slot.state, {
          extraClass: [
            `card-slot__card--lane-${slot.type}`,
            animationClass,
            isPending ? "card-slot__card--pending" : "",
          ]
            .filter(Boolean)
            .join(" "),
        })}
        {slot.type === "stashed" ? (
          <div className="card-slot__gate">
            <span>封存</span>
          </div>
        ) : null}
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

      <Flex className="card-lane__hand" aria-label="手牌与封存区">
        {dividerPercent !== null ? (
          <div
            className="card-lane__divider"
            style={{ left: `${dividerPercent}%` }}
            aria-hidden="true"
          />
        ) : null}
        <Flex className="card-lane__slots">
          {slots.length === 0 ? (
            <div className="card-slot card-slot--empty">
              <div className="card-slot__placeholder">无手牌</div>
            </div>
          ) : (
            slots.map((slot) => (
              <div
                key={slot.key}
                className={`card-slot card-slot--${slot.type}`}
              >
                {renderSlot(slot)}
                <span className="card-slot__label">{slot.label}</span>
              </div>
            ))
          )}
        </Flex>
      </Flex>
    </section>
  );
};

export default CardLane;
