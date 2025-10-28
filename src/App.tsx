import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex, Space, Tooltip, Switch } from "antd";
import CardLane, {
  type CardDeckStats,
  type CardLaneAnimationEvent,
} from "./components/CardLane";
import MerchantModal from "./components/MerchantModal";
import PlayerHUD from "./components/PlayerHUD";
import TurnLog from "./components/TurnLog";
import { getLevelConfig } from "./game/levels";
import LevelResultModal from "./components/LevelResultModal.tsx";
import PhaseIntroModal from "./components/PhaseIntroModal.tsx";
import {
  acceptMerchantOffer,
  createInitialState,
  discardActiveCard,
  drawCard,
  finishPlayerTurn,
  finishLevel,
  ensurePhase,
  advanceSubPhase,
  advanceLevelPhase,
  beginNextPlayerTurn,
  playActiveCard,
  releaseHoldCard,
  skipMerchant,
  stashActiveCard,
  discardHoldCard,
} from "./game/engine";
import {
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
  const aiRunningRef = useRef(false);
  const [showLevelResult, setShowLevelResult] = useState(false);
  const [showPhaseIntro, setShowPhaseIntro] = useState(false);
  const phaseIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 启动时将 turnStart 推进到 awaitHoldChoice
  useEffect(() => {
    // 进入开场的 levelStart 引导动画（~1s），结束后再推进到玩家回合
    setGameState((s) => {
      if (s.phase === "levelStart") setShowPhaseIntro(true);
      return s;
    });
  }, []);

  // Level Phase：当处于 levelStart 时，自动进入玩家回合（playerTurn -> turnStart -> awaitHoldChoice）
  useEffect(() => {
    if (gameState.phase === "levelStart") {
      // 展示阶段开场动画 1s，结束后推进
      setShowPhaseIntro(true);
      if (phaseIntroTimerRef.current) clearTimeout(phaseIntroTimerRef.current);
      phaseIntroTimerRef.current = setTimeout(() => {
        setShowPhaseIntro(false);
        setGameState((s) => beginNextPlayerTurn(advanceLevelPhase(s)));
      }, 1000);
    }
  }, [gameState.phase]);

  // Level Phase：当进入 finishRound 或 finishLevel，自动推进层结算与层切换
  useEffect(() => {
    if (gameState.phase === "finishRound") {
      // 推进一步到 finishLevel（进行通行证等同步结算），随后展示动画
      setGameState((s) => advanceLevelPhase(s));
    }
  }, [gameState.phase]);

  useEffect(() => {
    if (gameState.phase === "finishLevel") {
      // 弹出结算动画，由 LevelResultModal 控制何时关闭并触发 finishLevel
      setShowLevelResult(true);
    }
  }, [gameState.phase]);

  // 简易随机 AI（开关控制）：
  useEffect(() => {
    // 带延迟（1~1.5s）的 AI 执行器
    const runWithDelay = async (ms: number) =>
      await new Promise((r) => setTimeout(r, ms));

    const randomDelay = () => 1000 + Math.floor(Math.random() * 500);

    const getDrawsRemaining = (s: GameState) => {
      const p = s.players[s.currentPlayerIndex];
      return p.maxDraws + p.extraDraws - p.drawsUsed;
    };

    const runAiTurn = async () => {
      if (aiRunningRef.current) return;
      aiRunningRef.current = true;
      try {
        let s = gameState;
        // 安全检查：必须是 AI 回合
        if (s.phase !== "playerTurn") return;
        const me = s.players[s.currentPlayerIndex];
        if (!me?.isAI) return;

        // 若处于 nextPlayerTurnStart/turnStart，推进到 awaitHoldChoice
        if (
          s.subPhase === "nextPlayerTurnStart" ||
          s.subPhase === "turnStart" ||
          s.subPhase === undefined
        ) {
          s = beginNextPlayerTurn(s);
          setGameState(s);
          await runWithDelay(400);
        }

        // 循环最多处理一次“抽卡+动作”，或一次“释放滞留”，不足则直接结束回合
        const opponent =
          s.players[(s.currentPlayerIndex + 1) % s.players.length];
        const ai = s.players[s.currentPlayerIndex];

        // awaitHoldChoice 分支
        if (s.subPhase === "awaitHoldChoice") {
          // 若可释放滞留且有利（落后时），先释放
          if (
            (ai.holdSlots?.length ?? 0) > 0 &&
            ai.score < opponent.score &&
            !s.activeCard
          ) {
            const res = releaseHoldCard(s);
            if (!isEngineError(res)) {
              s = res.state;
              setGameState(s);
              await runWithDelay(randomDelay());
            }
          }

          // 抽卡尝试
          const drawsRemaining = getDrawsRemaining(s);
          const canDraw = drawsRemaining > 0 && s.deck.drawPile.length > 0;
          if (canDraw && s.subPhase === "awaitHoldChoice" && !s.activeCard) {
            const check = ensurePhase(s, "playerTurn", "awaitHoldChoice");
            if (!check) {
              const s1 = advanceSubPhase(s); // -> drawingCard
              const res = drawCard(s1);
              if (!isEngineError(res)) {
                s = res.state;
                setGameState(s);
                await runWithDelay(randomDelay());
              }
            }
          } else if (!s.activeCard) {
            // BUG修复：在 awaitHoldChoice 且无法抽卡时，直接结束回合
            const endState = finishPlayerTurn(s);
            const started = beginNextPlayerTurn(endState);
            setGameState(started);
            return;
          }
        }

        // awaitAction：对 activeCard 决策
        if (
          s.phase === "playerTurn" &&
          s.subPhase === "awaitAction" &&
          s.activeCard
        ) {
          const card = s.activeCard;
          const aiNow = s.players[s.currentPlayerIndex];
          const oppNow =
            s.players[(s.currentPlayerIndex + 1) % s.players.length];
          // 简单策略（与引擎一致）
          const decide = () => {
            switch (card.effect.type) {
              case "victoryShard":
              case "levelPass":
              case "shield":
              case "extraDraw":
                return "play" as const;
              case "multiply":
                if ((aiNow.holdSlots?.length ?? 0) > 0) return "play" as const;
                if (aiNow.score < oppNow.score) return "play" as const;
                return "hold" as const;
              case "add":
                return "play" as const;
              case "reset":
                return aiNow.score < oppNow.score * 0.6
                  ? ("play" as const)
                  : ("hold" as const);
              case "transfer":
              case "steal":
                return "play" as const;
              case "duplicate":
                return (aiNow.holdSlots?.length ?? 0) > 0
                  ? ("play" as const)
                  : ("hold" as const);
              case "wildcard":
                return aiNow.score < oppNow.score
                  ? ("play" as const)
                  : ("hold" as const);
              default:
                return "play" as const;
            }
          };
          const decision = decide();
          let res: EngineOutcome<ActionResult>;
          if (
            decision === "hold" &&
            (aiNow.holdSlots?.length ?? 0) < aiNow.MAX_HOLD_SLOTS
          ) {
            res = stashActiveCard(s);
          } else if (decision === "hold") {
            res = discardActiveCard(s); // 槽满则丢弃
          } else {
            res = playActiveCard(s);
          }
          if (!isEngineError(res)) {
            s = res.state;
            setGameState(s);
            await runWithDelay(randomDelay());

            // 结束回合并切到下一个
            const endState = finishPlayerTurn(s);
            const started = beginNextPlayerTurn(endState);
            setGameState(started);
          }
        }
      } finally {
        aiRunningRef.current = false;
      }
    };

    if (autoAI && gameState.phase === "playerTurn") {
      const current = gameState.players[gameState.currentPlayerIndex];
      if (current?.isAI) {
        runAiTurn();
      }
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
      if (phaseIntroTimerRef.current) {
        clearTimeout(phaseIntroTimerRef.current);
      }
    },
    []
  );

  // 抽卡（awaitHoldChoice -> drawingCard -> awaitAction）
  const handleDraw = () => {
    const phaseCheck = ensurePhase(gameState, "playerTurn", "awaitHoldChoice");
    if (phaseCheck) {
      setStatusMessage(phaseCheck.message);
      return;
    }
    const drawingState = advanceSubPhase(gameState);
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

  // 结算当前卡（awaitAction）
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
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state);
      handleOutcome({ ...result, state: endState });
    } else {
      handleOutcome(result);
    }
  };

  // 滞留当前卡（awaitAction）
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
    const s = createInitialState();
    setShowPhaseIntro(true);
    // 先展示阶段动画，再推进
    if (phaseIntroTimerRef.current) clearTimeout(phaseIntroTimerRef.current);
    phaseIntroTimerRef.current = setTimeout(() => {
      const started = beginNextPlayerTurn(advanceLevelPhase(s));
      setGameState(started);
    }, 1000);
    setStatusMessage("已重置对决。");
  };

  const isPlayerTurn = gameState.phase === "playerTurn";
  const currentPlayer =
    gameState.players?.[gameState.currentPlayerIndex] ?? gameState.players?.[0];
  const holdSlots = currentPlayer?.holdSlots ?? [];
  const activeCard = gameState.activeCard;
  const canPlay = Boolean(activeCard);
  const canStash =
    Boolean(activeCard) && holdSlots.length < currentPlayer.MAX_HOLD_SLOTS;
  const canDiscard = Boolean(activeCard);
  const drawDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "awaitHoldChoice" ||
    Boolean(activeCard);
  const playDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitAction" || !canPlay;
  const stashDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitAction" || !canStash;
  const discardDisabled =
    !isPlayerTurn || gameState.subPhase !== "awaitAction" || !canDiscard;
  const releaseDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "awaitHoldChoice" ||
    holdSlots.length === 0 ||
    Boolean(activeCard);
  const endTurnDisabled = !isPlayerTurn;
  const noActionsAvailable =
    isPlayerTurn &&
    drawDisabled &&
    playDisabled &&
    stashDisabled &&
    discardDisabled &&
    releaseDisabled;

  const deckStats = useMemo(
    () =>
      ({
        total: gameState.deck.originalDeckSize,
        remaining: gameState.deck.drawPile.length,
        remaining_rare: gameState.deck.publicInfo.remainingRare,
        remaining_shard: gameState.deck.publicInfo.remainingShards,
      } as CardDeckStats),
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
          key: "draw",
          label: drawButtonLabel,
          onClick: handleDraw,
          disabled: drawDisabled || drawsRemaining <= 0,
          tooltip: "从牌堆抽取一张卡牌。",
        },
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
            !isPlayerTurn ||
            (holdSlots?.length ?? 0) === 0 ||
            Boolean(activeCard),
          tooltip: "丢弃滞留位顶部的卡牌。",
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
  }, [
    gameState.subPhase,
    releaseDisabled,
    isPlayerTurn,
    holdSlots?.length,
    activeCard,
    drawButtonLabel,
    handleDraw,
    drawDisabled,
    drawsRemaining,
    playDisabled,
    handlePlay,
    stashDisabled,
    handleStash,
    discardDisabled,
    handleDiscard,
  ]);

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
            {/* <span className="top-bar__chip top-bar__chip--metric">
              {deckStats}
            </span> */}
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
                  title="直接结束你的回合(有卡未处理自动丢弃)"
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
              deckStats={deckStats}
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
      <LevelResultModal
        open={showLevelResult}
        players={gameState.players}
        level={gameState.level}
        onClose={() => {
          // 关闭 Modal 并推进到下一层结算
          setShowLevelResult(false);
          setGameState((s) => finishLevel(s));
        }}
      />
      <PhaseIntroModal
        open={showPhaseIntro}
        level={gameState.level}
        levelName={getLevelConfig(gameState.level).name}
        onClose={() => setShowPhaseIntro(false)}
      />
    </div>
  );
};

export default App;
