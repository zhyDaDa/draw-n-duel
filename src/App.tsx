import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex, Space, Tooltip, Switch } from "antd";
import CardLane, { type CardLaneAnimationEvent } from "./components/CardLane";
import MerchantModal from "./components/MerchantModal";
import PlayerHUD from "./components/PlayerHUD";
import TurnLog from "./components/TurnLog";
import {
  acceptMerchantOffer,
  createInitialState,
  discardActiveCard,
  drawCard,
  finishPlayerTurn,
  ensurePhase,
  advanceSubPhase,
  beginNextPlayerTurn,
  playActiveCard,
  releaseHoldCard,
  skipMerchant,
  stashActiveCard,
  unpackBackpack,
  discardHoldCard,
} from "./game/engine";
import {
  MAX_HOLD_SLOTS,
  type ActionResult,
  type EngineError,
  type EngineOutcome,
  type GameState,
  type ResolveResult,
} from "./game/types";
import "./App.css";

const isEngineError = <T,>(outcome: EngineOutcome<T>): outcome is EngineError =>
  (outcome as EngineError)?.type !== undefined;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState()
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [animationEvent, setAnimationEvent] =
    useState<CardLaneAnimationEvent | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoAI, setAutoAI] = useState(false);
  // 启动时将 turnStart 推进到 awaitHoldChoice
  useEffect(() => {
    setGameState((s) => beginNextPlayerTurn(s));
  }, []);

  // 简易随机 AI（开关控制）：
  useEffect(() => {
    if (!autoAI) return;
    if (gameState.phase !== "playerTurn") return;
    const current = gameState.players[gameState.currentPlayerIndex];
    if (!current?.isAI) return;

    // awaitHoldChoice：优先随机释放滞留，否则抽卡
    if (gameState.subPhase === "awaitHoldChoice") {
      if ((current.holdSlots?.length ?? 0) > 0 && Math.random() < 0.5 && !gameState.activeCard) {
        const res = releaseHoldCard(gameState);
        if (!isEngineError(res)) setGameState(res.state);
        return;
      }
      const check = ensurePhase(gameState, "playerTurn", "awaitHoldChoice");
      if (!check) {
        const s1 = advanceSubPhase(gameState);
        const res = drawCard(s1);
        if (!isEngineError(res)) setGameState(res.state);
      }
      return;
    }

    // awaitAction：随机选择对 activeCard 的处理
    if (gameState.subPhase === "awaitAction" && gameState.activeCard) {
      const r = Math.random();
      let res = playActiveCard(gameState);
      if (r < 0.33) res = playActiveCard(gameState);
      else if (r < 0.66) res = stashActiveCard(gameState);
      else res = discardActiveCard(gameState);
      if (!isEngineError(res)) setGameState(finishPlayerTurn(res.state));
    }
  }, [autoAI, gameState]);

  const handleOutcome = (
    outcome: EngineOutcome<ActionResult | ResolveResult>
  ) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message);
      return;
    }
    setGameState(outcome.state);
    setStatusMessage(outcome.messages?.join(" ") ?? null);
    // 如果已到达 nextPlayerTurnStart，自动开始下一玩家回合并进入 awaitHoldChoice
    setGameState((s) => {
      if (s.phase === "playerTurn" && s.subPhase === "nextPlayerTurnStart") {
        return beginNextPlayerTurn(s);
      }
      return s;
    });
  };

  const handleGameStateUpdate = (outcome: EngineOutcome<GameState>) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message);
      return;
    }
    setGameState(outcome);
    setStatusMessage(null);
  };

  const registerAnimation = useCallback((event: CardLaneAnimationEvent) => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
    }
    setAnimationEvent(event);
    animationTimerRef.current = setTimeout(() => setAnimationEvent(null), 650);
  }, []);

  useEffect(
    () => () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    },
    []
  );

  const handleDraw = () => {
    // 仅允许在 awaitHoldChoice 阶段开始抽卡
    const phaseCheck = ensurePhase(gameState, "playerTurn", "awaitHoldChoice");
    if (phaseCheck) {
      setStatusMessage(phaseCheck.message);
      return;
    }
    const drawingState = advanceSubPhase(gameState); // awaitHoldChoice -> drawingCard
    const result = drawCard(drawingState);

    if (!isEngineError(result) && result.appliedCard) {
      registerAnimation({
        type: "draw",
        card: result.appliedCard,
        timestamp: Date.now(),
      });
    }
    handleOutcome(result);
  };

  const handlePlay = () => {
    const activeCard = gameState.activeCard;
  const result = playActiveCard(gameState);
    if (!isEngineError(result) && activeCard) {
      registerAnimation({
        type: "play",
        card: activeCard,
        timestamp: Date.now(),
      });
    }
    // 行动完成后推进到回合结束阶段，再开始下一位
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state);
      handleOutcome({ ...result, state: endState });
    } else {
      handleOutcome(result);
    }
  };

  const handleStash = () => {
    const activeCard = gameState.activeCard;
  const result = stashActiveCard(gameState);
    if (!isEngineError(result) && activeCard) {
      registerAnimation({
        type: "stash",
        card: activeCard,
        timestamp: Date.now(),
      });
    }
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state);
      handleOutcome({ ...result, state: endState });
    } else {
      handleOutcome(result);
    }
  };

  const handleDiscard = () => {
    const activeCard = gameState.activeCard;
  const result = discardActiveCard(gameState);
    if (!isEngineError(result) && activeCard) {
      registerAnimation({
        type: "discard",
        card: activeCard,
        timestamp: Date.now(),
      });
    }
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state);
      handleOutcome({ ...result, state: endState });
    } else {
      handleOutcome(result);
    }
  };

  const handleReleaseHold = () => {
    const current =
      gameState.players?.[gameState.currentPlayerIndex] ??
      gameState.players?.[0];
    const holdCard = current?.holdSlots?.[0];
  const result = releaseHoldCard(gameState);
    if (!isEngineError(result) && holdCard) {
      registerAnimation({
        type: "release",
        card: holdCard,
        timestamp: Date.now(),
      });
    }
    handleOutcome(result);
  };

  const handleUnpack = (index: number) => {
    const result = unpackBackpack(gameState, index);
    handleGameStateUpdate(result);
  };

  const handleEndTurn = () => {
    const endState = finishPlayerTurn(gameState);
    const started = beginNextPlayerTurn(endState);
    setGameState(started);
    setStatusMessage("回合已结束，已进入下一位的回合开始阶段。");
  };

  const handleSkipMerchant = () => {
    const nextState = skipMerchant(gameState);
    setGameState(nextState);
    setStatusMessage("你离开了商人。");
  };

  const handleAcceptMerchant = (index: number) => {
    const result = acceptMerchantOffer(gameState, index);
    handleGameStateUpdate(result);
  };

  const handleReset = () => {
    setGameState(createInitialState());
    setStatusMessage("已重置对决。");
  };

  const isPlayerTurn = gameState.phase === "playerTurn";
  const currentPlayer =
    gameState.players?.[gameState.currentPlayerIndex] ?? gameState.players?.[0];
  const holdSlots = currentPlayer?.holdSlots ?? [];
  const activeCard = gameState.activeCard;
  const canPlay = Boolean(activeCard);
  const canStash = Boolean(activeCard) && holdSlots.length < MAX_HOLD_SLOTS;
  const canDiscard = Boolean(activeCard);
  const drawDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitHoldChoice" || Boolean(activeCard);
  const playDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitAction" || !canPlay;
  const stashDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitAction" || !canStash;
  const discardDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitAction" || !canDiscard;
  const releaseDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitHoldChoice" || holdSlots.length === 0 || Boolean(activeCard);
  const endTurnDisabled = !isPlayerTurn || gameState.subPhase !== "awaitAction" || Boolean(activeCard);
  const noActionsAvailable =
    isPlayerTurn &&
    drawDisabled &&
    playDisabled &&
    stashDisabled &&
    discardDisabled &&
    releaseDisabled;

  const deckStats = useMemo(
    () =>
      `卡堆剩余：${gameState.deck.drawPile.length} 张｜稀有剩余 ${gameState.deck.publicInfo.remainingRare}｜碎片 ${gameState.deck.publicInfo.remainingShards}`,
    [
      gameState.deck.drawPile.length,
      gameState.deck.publicInfo.remainingRare,
      gameState.deck.publicInfo.remainingShards,
    ]
  );

  const drawsRemaining =
    (currentPlayer?.maxDraws ?? 0) +
    (currentPlayer?.extraDraws ?? 0) -
    (currentPlayer?.drawsUsed ?? 0);
  const drawButtonLabel = `抽卡 [${currentPlayer?.drawsUsed ?? 0}/${
    (currentPlayer?.maxDraws ?? 0) + (currentPlayer?.extraDraws ?? 0)
  }]`;

  const actionButtons = useMemo(() => {
    if (gameState.subPhase === "awaitHoldChoice") {
      return [
        {
          key: "release",
          label: "释放滞留",
          onClick: handleReleaseHold,
          disabled: releaseDisabled,
          tooltip: "释放滞留位顶部的卡牌并立即结算。",
        },
        {
          key: "discard-hold",
          label: "丢弃滞留",
          onClick: () => {
            const res = discardHoldCard(gameState);
            handleOutcome(res);
          },
          disabled:
            !isPlayerTurn || (holdSlots?.length ?? 0) === 0 || Boolean(activeCard),
          tooltip: "丢弃滞留位顶部的卡牌。",
        },
        {
          key: "draw",
          label: drawButtonLabel,
          onClick: handleDraw,
          disabled: drawDisabled || drawsRemaining <= 0,
          tooltip: "从牌堆抽取一张卡牌。",
        },
      ];
    }
    // 默认：awaitAction
    return [
      {
        key: "play",
        label: "结算卡牌",
        onClick: handlePlay,
        disabled: playDisabled,
        tooltip: "立即结算这张卡牌的效果。",
      },
      {
        key: "stash",
        label: "滞留",
        onClick: handleStash,
        disabled: stashDisabled,
        tooltip: "将当前卡牌移动到滞留位。",
      },
      {
        key: "discard",
        label: "丢弃",
        onClick: handleDiscard,
        disabled: discardDisabled,
        tooltip: "放弃这张卡牌并置入弃牌堆。",
      },
    ];
  }, [gameState.subPhase, releaseDisabled, isPlayerTurn, holdSlots?.length, activeCard, drawButtonLabel, handleDraw, drawDisabled, drawsRemaining, playDisabled, handlePlay, stashDisabled, handleStash, discardDisabled, handleDiscard]);

  const endTurnButtonClasses = ["btn", "btn--accent"];
  if (noActionsAvailable) {
    endTurnButtonClasses.push("btn--pulse");
  }

  const matchOutcomeMessage =
    gameState.phase === "matchEnd"
      ? gameState.winner === "Player"
        ? "你赢得了整场对决！"
        : "AI 获得最终胜利。"
      : null;

  return (
    <div id="app-root">
      <header className="top-bar">
        <div className="top-bar__info">
          <Space align="center" size="middle" wrap>
            <div className="top-bar__title">
              <h1>纯粹抽卡决斗</h1>
              <p>
                层级 {gameState.level}｜阶段：{gameState.phase}
              </p>
            </div>
            <span className="top-bar__chip top-bar__chip--metric">
              {deckStats}
            </span>
            {statusMessage ? (
              <span className="top-bar__chip top-bar__chip--status">
                {statusMessage}
              </span>
            ) : null}
            {matchOutcomeMessage ? (
              <span className="top-bar__chip top-bar__chip--success">
                {matchOutcomeMessage}
              </span>
            ) : null}
          </Space>
        </div>
        <div className="top-bar__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleReset}
          >
            重置对决
          </button>
          <div className="ai-toggle">
            <span>允许 AI 自动操作</span>
            <Switch checked={autoAI} onChange={setAutoAI} />
          </div>
        </div>
      </header>

      <Flex className="layout">
        <div className="layout__left">
          <Space className="players-wrapper">
            {gameState.players?.map((player, idx) => (
              <PlayerHUD
                key={player.label + idx}
                player={player}
                isCurrent={gameState.currentPlayerIndex === idx && isPlayerTurn}
                isHuman={idx === 0}
                onUnpackBackpack={idx === 0 ? handleUnpack : undefined}
              />
            ))}
          </Space>

          <section className="action-panel">
            <h3>玩家操作</h3>
            <div className="action-panel__buttons">
              {actionButtons.map((action) => {
                const buttonClasses = ["btn"];
                if (isPlayerTurn && !action.disabled) {
                  buttonClasses.push("btn--glow");
                }
                return (
                  <div key={action.key} className="action-panel__button">
                    <Tooltip title={action.tooltip} placement="top">
                      <button
                        type="button"
                        className={buttonClasses.join(" ")}
                        onClick={action.onClick}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
              <div className="action-panel__button">
                <Tooltip
                  title="当其他操作全部完成后，请结束你的回合。"
                  placement="top"
                >
                  <button
                    type="button"
                    className={endTurnButtonClasses.join(" ")}
                    onClick={handleEndTurn}
                    disabled={endTurnDisabled}
                  >
                    结束回合
                  </button>
                </Tooltip>
              </div>
            </div>

            <CardLane
              deckRemaining={gameState.deck.drawPile.length}
              activeCard={activeCard}
              holdSlots={holdSlots}
              animationEvent={animationEvent}
            />
          </section>
        </div>

        <div className="layout__right">
          <TurnLog entries={gameState.log} />
        </div>
      </Flex>
      <MerchantModal
        isOpen={gameState.phase === "merchant"}
        offers={gameState.merchantOffers}
        onAccept={handleAcceptMerchant}
        onSkip={handleSkipMerchant}
      />
    </div>
  );
};

export default App;
