import { Flex, Tooltip } from "antd";
import { useMemo, useRef } from "react"; // 添加 useRef
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
  cards: CardInstance[];
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
  if (!card) return null;
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
  onDeckClick,
}) => {
  const handRef = useRef<HTMLDivElement>(null); // 添加 ref

  // 添加滚轮处理函数
  const onWheel = (e: React.WheelEvent) => {
    const el = handRef.current;
    if (!el) return;
    const canScrollH = el.scrollWidth > el.clientWidth + 1;
    if (!canScrollH) return; // 无需横向滚动

    // 若有水平滚动量直接使用，否则将垂直转为水平滚动
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 0) {
      e.preventDefault();
      el.scrollLeft += delta / 5;
    }
  };

  const { slots } = useMemo(() => {
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
          key: state?.C_current
            ? `drawn-${state.C_current.instanceId}`
            : `drawn-empty-${i}`,
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
          key: state?.C_current
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

  const getSlotAnimationClass = (slot: LaneSlot): string => {
    console.log("Animating slot", slot, animationEvent);
    if (!slot.state || !animationEvent) return "";
    const currentCard = slot.state.C_current;
    if (!currentCard) return "";
    if (
      !animationEvent.cards.some((c) => c.instanceId === currentCard.instanceId)
    ) {
      // 出现动画的卡牌中不包含此卡牌
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
      !!slot.state.C_current &&
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

      <Flex
        ref={handRef} // 添加 ref
        className="card-lane__hand"
        aria-label="卡槽区"
        onWheel={onWheel} // 添加滚轮事件
      >
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
