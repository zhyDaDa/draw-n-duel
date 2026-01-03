import { Button, Flex, Tooltip } from "antd";
import { createPortal } from "react-dom";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type {
  CardInstance,
  CardSituationState,
  InteractionRequest,
  CardSituationFunction,
} from "../game/types";
import CardDisplay from "./CardDisplay";
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
  handlePlay: CardSituationFunction<void>;
}

type LaneSlotType = "drawn" | "stashed" | "hand";

interface LaneSlot {
  key: string;
  type: LaneSlotType;
  state?: CardSituationState;
  label: string;
  order: number;
}

const renderTooltip = (
  state: CardSituationState,
  handlePlay: CardSituationFunction<void>
): ReactNode => {
  const card = state.C_current;
  if (!card) return null;
  return (
    <div className="card-chip__tooltip tooltip-light__panel">
      单击以使用卡牌
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
  handlePlay: CardSituationFunction<void>,
  options: { extraClass?: string } = {}
): ReactNode => {
  const { extraClass = "" } = options;
  return (
    <Tooltip
      title={renderTooltip(state, handlePlay)}
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
  handlePlay,
}) => {
  const handRef = useRef<HTMLDivElement>(null);

  // 新增：浮层状态
  type FloatingState = {
    state: CardSituationState;
    rect: DOMRect;
    key: string;
  };
  const [floating, setFloating] = useState<FloatingState | null>(null);
  const [floatingActive, setFloatingActive] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const floatRootRef = useRef<HTMLElement | null>(null);
  const enterTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let root = document.getElementById(
      "card-floating-root"
    ) as HTMLElement | null;
    if (!root) {
      root = document.createElement("div");
      root.id = "card-floating-root";
      document.body.appendChild(root);
    }
    floatRootRef.current = root;
    return () => {
      // 清理定时器
      if (enterTimerRef.current) {
        window.clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      // 不删除 root，避免多次创建；若需要清理可在这里处理
    };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const el = handRef.current;
    if (!el) return;
    const canScrollH = el.scrollWidth > el.clientWidth + 1;
    if (!canScrollH) return; // 无需横向滚动

    // 若有水平滚动量直接使用，否则将垂直转为横向滚动
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 0) {
      e.preventDefault();
      // 轻微缓冲，避免滚动过快
      el.scrollLeft += delta / 5;
    }
  };

  // 悬停开始/结束：把卡片 DOM 的 bounding rect 记录下来并 portal 渲染
  const handleHoverStart = (
    slotState: CardSituationState,
    key: string,
    e: React.MouseEvent
  ) => {
    const wrapper = e.currentTarget as HTMLElement;
    const cardEl = wrapper.querySelector(
      ".card-slot__card"
    ) as HTMLElement | null;
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    // clear any pending exit
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setHoverKey(key);
    setFloating({ state: slotState, rect, key });
    // small timeout to allow initial render then activate for transition
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
    }
    enterTimerRef.current = window.setTimeout(() => {
      setFloatingActive(true);
      enterTimerRef.current = null;
    }, 20);
  };
  const handleHoverEnd = () => {
    // deactivate (triggers CSS exit transition), then remove DOM after transition
    setFloatingActive(false);
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = window.setTimeout(() => {
      setFloating(null);
      setHoverKey(null); // only clear hoverKey after exit animation finished
      exitTimerRef.current = null;
    }, 220);
  };

  const handleFloatingClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!floating) return;
    try {
      handlePlay(floating.state);
    } catch (err) {
      // ignore
    }
    // start exit animation then unmount
    setFloatingActive(false);
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = window.setTimeout(() => {
      setFloating(null);
      setHoverKey(null);
      exitTimerRef.current = null;
    }, 220);
  };

  const renderFloatingTooltipContent = (state: CardSituationState) => {
    const card = state.C_current;
    if (!card) return null;
    return (
      <div className="card-chip__tooltip tooltip-light__panel">
        <Button
          onClick={(ev) => {
            ev.stopPropagation();
            try {
              handlePlay(state);
            } catch (err) {}
            // close floating
            setFloatingActive(false);
            if (exitTimerRef.current) {
              window.clearTimeout(exitTimerRef.current);
            }
            exitTimerRef.current = window.setTimeout(() => {
              setFloating(null);
              setHoverKey(null);
              exitTimerRef.current = null;
            }, 220);
          }}
        >
          使用
        </Button>
      </div>
    );
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
    if (!slot.state || !animationEvent) return "";
    const currentCard = slot.state.C_current;
    if (!currentCard) return "";
    if (
      !animationEvent.cards.some((c) => c.instanceId === currentCard.instanceId)
    ) {
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
      <div
        className={`card-slot__card-wrapper ${
          hoverKey === slot.key ? "is-hovered" : ""
        }`}
        onMouseEnter={(e) =>
          slot.state && handleHoverStart(slot.state, slot.key, e)
        }
        onMouseLeave={handleHoverEnd}
      >
        {renderCard(slot.state, handlePlay, {
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
        ref={handRef}
        className="card-lane__hand"
        aria-label="卡槽区"
        onWheel={onWheel}
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

      {/* Portal 渲染浮层卡片 */}
      {floating && floatRootRef.current
        ? createPortal(
            <div
              className="card-floating"
              role="button"
              tabIndex={0}
              onClick={handleFloatingClick}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  handleFloatingClick(ev as unknown as React.MouseEvent);
                }
              }}
              onMouseEnter={() => {
                // when mouse enters floating, cancel any pending exit
                if (exitTimerRef.current) {
                  window.clearTimeout(exitTimerRef.current);
                  exitTimerRef.current = null;
                }
                // ensure active class is present
                setFloatingActive(true);
              }}
              onMouseLeave={() => {
                // begin exit sequence when mouse leaves floating
                handleHoverEnd();
              }}
              style={{
                left: floating.rect.left + window.scrollX,
                top: floating.rect.top + window.scrollY,
                width: floating.rect.width,
                height: floating.rect.height,
              }}
            >
              <Tooltip
                title={"单击以使用卡牌"}
                placement="top"
              >
                <div
                  className={`card-floating-inner ${
                    floatingActive ? "card-floating-inner--active" : ""
                  } ${
                    floatingActive ? "card-floating-inner--interactive" : ""
                  }`}
                >
                  <CardDisplay state={floating.state} size="sm" />
                </div>
              </Tooltip>
            </div>,
            floatRootRef.current
          )
        : null}
    </section>
  );
};

export default CardLane;
