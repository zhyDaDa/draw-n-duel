import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Space, Tooltip, Switch } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import CardLane, {
  type CardDeckStats,
  type CardLaneAnimationEvent,
} from "../components/CardLane";
import MerchantModal from "../components/MerchantModal";
import PlayerHUD from "../components/PlayerHUD";
import TurnLog from "../components/TurnLog";
import { getLevelConfig } from "../game/levels";
import LevelResultModal from "../components/LevelResultModal";
import PhaseIntroModal from "../components/PhaseIntroModal";
import InteractionModal from "../components/InteractionModal";
import DeckBrowserModal from "../components/DeckBrowserModal";
import {
  acceptMerchantOffer,
  initializeGameState,
  discardActiveCard,
  drawCards,
  finishPlayerTurn,
  finishLevel,
  ensurePhase,
  advanceSubPhase,
  advanceLevelPhase,
  beginNextPlayerTurn,
  playActiveCard,
  resolveInteractionOption,
  releaseHoldCard,
  skipMerchant,
  stashActiveCard,
  discardHoldCard,
} from "../game/engine";
import {
  buildCardSituationState,
  buildSituationState,
} from "../game/situations";
import {
  type ActionResult,
  type CardInstance,
  type DrawResult,
  type EngineError,
  type EngineOutcome,
  type GameState,
  type ResolveResult,
  AI_LABEL,
  DEFAULT_HAND_SIZE,
  PLAYER_LABEL,
} from "../game/types";
import { useSettings } from "../context/SettingsContext";
import "../App.css";
import "./GamePlayPage.less";

const isEngineError = <T,>(outcome: EngineOutcome<T>): outcome is EngineError =>
  (outcome as EngineError)?.type !== undefined;

type GameMode = "solo" | "versus";

const buildPlayerLabels = (mode: GameMode, soloAiCount: number): string[] => {
  if (mode === "versus") {
    return [PLAYER_LABEL, "勇者二号"];
  }
  const count = Number.isFinite(soloAiCount)
    ? Math.max(1, Math.floor(soloAiCount))
    : 1;
  return [PLAYER_LABEL, ...Array.from({ length: count }, () => AI_LABEL)];
};

const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const gameMode: GameMode = modeParam === "versus" ? "versus" : "solo";

  const playerLabels = useMemo(
    () => buildPlayerLabels(gameMode, settings.soloAiCount),
    [gameMode, settings.soloAiCount]
  );

  const [gameState, setGameState] = useState<GameState>(() =>
    initializeGameState(undefined, playerLabels)
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [animationEvent, setAnimationEvent] =
    useState<CardLaneAnimationEvent | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoAI, setAutoAI] = useState(true);
  const [aiBusy] = useState(false);
  const [showLevelResult, setShowLevelResult] = useState(false);
  const [showPhaseIntro, setShowPhaseIntro] = useState(false);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const phaseIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionAutoRef = useRef<string | null>(null);

  useEffect(() => {
    setGameState(initializeGameState(undefined, playerLabels));
    setStatusMessage(null);
    setShowLevelResult(false);
    setShowPhaseIntro(true);
  }, [playerLabels]);

  useEffect(() => {
    if (!playerLabels.includes(AI_LABEL)) {
      setAutoAI(false);
    }
  }, [playerLabels]);

  useEffect(() => {
    setGameState((s) => {
      if (s.phase === "levelStart") setShowPhaseIntro(true);
      return s;
    });
  }, []);

  useEffect(() => {
    if (gameState.phase === "levelStart") {
      setShowPhaseIntro(true);
      if (phaseIntroTimerRef.current) clearTimeout(phaseIntroTimerRef.current);
      phaseIntroTimerRef.current = setTimeout(() => {
        setShowPhaseIntro(false);
        setGameState((s) => beginNextPlayerTurn(advanceLevelPhase(s)));
      }, 1000);
    }
  }, [gameState.phase]);

  useEffect(() => {
    if (gameState.phase === "finishRound") {
      setGameState((s) => advanceLevelPhase(s));
    }
  }, [gameState.phase]);

  useEffect(() => {
    if (gameState.phase === "finishLevel") {
      setShowLevelResult(true);
    }
  }, [gameState.phase]);

  // useEffect(() => {
  //   const runWithDelay = async (ms: number) =>
  //     await new Promise((r) => setTimeout(r, ms));

  //   // 缩短 AI 的随机延迟: 由原来的 500-1000ms 缩短到 200-400ms，使动作更紧凑但依然可见
  //   const randomDelay = () => 200 + Math.floor(Math.random() * 200);
  //   const waitRandom = () => runWithDelay(randomDelay());

  //   /**
  //    * 包装 AI 的单次操作：在操作前后等待一段随机时间。
  //    * options.skipPostWait: 若操作后控制权已回到人类玩家，则跳过后置等待（以便立刻解禁 UI）。
  //    */
  //   const performAiOperation = async (
  //     operation: () => boolean,
  //     options?: { skipPostWait?: () => boolean }
  //   ) => {
  //     await waitRandom();
  //     const succeeded = operation();
  //     const skip = options?.skipPostWait ? options.skipPostWait() : false;
  //     if (!skip) {
  //       await waitRandom();
  //     }
  //     return succeeded;
  //   };

  //   const getDrawsRemaining = (s: GameState) => {
  //     const p = s.players[s.currentPlayerIndex];
  //     return p.baseDraws + p.extraDraws - p.drawsUsed;
  //   };

  //   const runAiTurn = async () => {
  //     if (aiRunningRef.current) return;

  //     let s = gameState;
  //     if (s.phase !== "playerTurn") return;
  //     const me = s.players[s.currentPlayerIndex];
  //     if (!me?.isAI) return;

  //     aiRunningRef.current = true;
  //     setAiBusy(true);
  //     try {
  //       if (s.subPhase === "turnStart" || s.subPhase === undefined) {
  //         s = beginNextPlayerTurn(s);
  //         setGameState(s);
  //         // 给出一个短的预览动画帧（比之前短一点）再继续 AI 逻辑
  //         await runWithDelay(300);
  //       }

  //       const opponent =
  //         s.players[(s.currentPlayerIndex + 1) % s.players.length];
  //       const ai = s.players[s.currentPlayerIndex];

  //       if (s.subPhase === "checkCanDraw") {
  //         if (
  //           (ai.handCards?.length ?? 0) > 0 &&
  //           ai.score - opponent.score < 0 &&
  //           !s.activeCard
  //         ) {
  //           await performAiOperation(
  //             () => {
  //               const res = releaseHoldCard(s);
  //               if (!isEngineError(res)) {
  //                 s = res.state;
  //                 setGameState(s);
  //                 return true;
  //               }
  //               return false;
  //             },
  //             { skipPostWait: () => !s.players[s.currentPlayerIndex]?.isAI }
  //           );
  //         }

  //         const drawsRemaining = getDrawsRemaining(s);
  //         const canDraw = drawsRemaining > 0 && s.deck.drawPile.length > 0;
  //         if (canDraw && s.subPhase === "checkCanDraw" && !s.activeCard) {
  //           const check = ensurePhase(s, "playerTurn", "checkCanDraw");
  //           if (!check) {
  //             await performAiOperation(
  //               () => {
  //                 const s1 = advanceSubPhase(s);
  //                 const res = drawCard(s1);
  //                 if (!isEngineError(res)) {
  //                   s = res.state;
  //                   setGameState(s);
  //                   return true;
  //                 }
  //                 return false;
  //               },
  //               { skipPostWait: () => !s.players[s.currentPlayerIndex]?.isAI }
  //             );
  //           }
  //         } else if (!s.activeCard) {
  //           await performAiOperation(
  //             () => {
  //               const endState = finishPlayerTurn(s);
  //               const started = beginNextPlayerTurn(endState);
  //               s = started;
  //               setGameState(started);
  //               return true;
  //             },
  //             { skipPostWait: () => !s.players[s.currentPlayerIndex]?.isAI }
  //           );
  //           return;
  //         }
  //       }

  //       if (
  //         s.phase === "playerTurn" &&
  //         s.subPhase === "waitingDrawChoice" &&
  //         s.activeCard
  //       ) {
  //         const decide = () => {
  //           // AI决策
  //           return "play";
  //         };
  //         const decision = decide();
  //         let actionSucceeded = false;
  //         await performAiOperation(
  //           () => {
  //             let res: EngineOutcome<ActionResult>;
  //             if (decision === "hold") {
  //               res = stashActiveCard(s);
  //             } else {
  //               res = playActiveCard(s);
  //             }
  //             if (!isEngineError(res)) {
  //               s = res.state;
  //               setGameState(s);
  //               actionSucceeded = true;
  //               return true;
  //             }
  //             return false;
  //           },
  //           { skipPostWait: () => !s.players[s.currentPlayerIndex]?.isAI }
  //         );

  //         if (actionSucceeded) {
  //           await performAiOperation(
  //             () => {
  //               const endState = finishPlayerTurn(s);
  //               const started = beginNextPlayerTurn(endState);
  //               s = started;
  //               setGameState(started);
  //               return true;
  //             },
  //             { skipPostWait: () => !s.players[s.currentPlayerIndex]?.isAI }
  //           );
  //         }
  //       }
  //     } finally {
  //       aiRunningRef.current = false;
  //       setAiBusy(false);
  //     }
  //   };

  //   if (autoAI && gameState.phase === "playerTurn") {
  //     const current = gameState.players[gameState.currentPlayerIndex];
  //     if (current?.isAI) {
  //       runAiTurn();
  //     }
  //   }
  // }, [autoAI, gameState]);

  const resolveOutcomeMessages = (
    payload: ActionResult | ResolveResult | DrawResult
  ): string[] | undefined => {
    if ("messages" in payload && payload.messages) {
      return payload.messages;
    }
    if ("messsages" in payload) {
      const maybe = (payload as DrawResult).messsages;
      return Array.isArray(maybe) ? maybe : undefined;
    }
    return undefined;
  };

  const handleOutcome = (
    outcome: EngineOutcome<ActionResult | ResolveResult | DrawResult>
  ) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message);
      return;
    }
    console.log("Handling outcome", outcome);
    setGameState(outcome.state.G_state);
    const mergedMessages = resolveOutcomeMessages(outcome);
    setStatusMessage(mergedMessages?.join(" ") ?? null);
    setGameState((s) => {
      if (s.phase === "playerTurn" && s.subPhase === "turnStart") {
        return beginNextPlayerTurn(s);
      }
      return s;
    });
  };

  useEffect(() => {
    const interaction = gameState.pendingInteraction;
    if (!interaction) {
      interactionAutoRef.current = null;
      return;
    }
    const owner = gameState.players[interaction.ownerIndex];
    if (!owner?.isAI || !autoAI) return;
    if (interactionAutoRef.current === interaction.id) return;
    interactionAutoRef.current = interaction.id;

    const pickOption = () => {
      if (!interaction.options.length) return null;
      return interaction.options.reduce<{
        option: (typeof interaction.options)[0];
        weight: number;
      } | null>((best, option) => {
        const base =
          option.aiWeight ??
          (option.intent === "positive"
            ? 1.4
            : option.intent === "negative"
            ? 0.6
            : 1);
        const weight = option.autoResolve ? base + 0.5 : base;
        if (!best || weight > best.weight) {
          return { option, weight };
        }
        return best;
      }, null)?.option;
    };

    const chosen = pickOption();
    if (!chosen) return;

    const timer = setTimeout(() => {
      const latest = gameState.pendingInteraction;
      if (!latest || latest.id !== interaction.id) return;
      handleOutcome(resolveInteractionOption(gameState, chosen.id));
    }, 600);

    return () => clearTimeout(timer);
  }, [autoAI, gameState, handleOutcome]);

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

  const handleDraw = () => {
    if (aiBusy || interactionLocked) return;
    const phaseCheck = ensurePhase(gameState, "playerTurn", "checkCanDraw");
    if (phaseCheck) {
      setStatusMessage(phaseCheck.message);
      return;
    }
    const nextGameState = advanceSubPhase(gameState);

    // 问题在这里:需要创建 SituationState 实例,而不是直接传递 GameState
    const situation = buildSituationState({
      state: nextGameState,
      playerIndex: nextGameState.currentPlayerIndex,
    });

    const result = drawCards(situation);

    if (
      !isEngineError(result) &&
      result?.drawnCards &&
      result.drawnCards.length > 0
    ) {
      registerAnimation({
        type: "draw",
        cards: result.drawnCards,
        timestamp: Date.now(),
      });
    }
    handleOutcome(result);
  };

  const handlePlay = () => {
    if (aiBusy || interactionLocked) return;
    const activeCard = gameState.activeCard;
    const result = playActiveCard(gameState);
    if (!isEngineError(result) && activeCard) {
      registerAnimation({
        type: "play",
        cards: [activeCard],
        timestamp: Date.now(),
      });
    }
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state.G_state);
      const newSituation = buildSituationState({
        state: endState,
        playerIndex: endState.currentPlayerIndex,
      });
      handleOutcome({
        ...result,
        state: newSituation,
      });
    } else {
      handleOutcome(result);
    }
  };

  const handleStash = () => {
    if (aiBusy || interactionLocked) return;
    const activeCard = gameState.activeCard;
    const result = stashActiveCard(gameState);
    if (!isEngineError(result) && activeCard) {
      registerAnimation({
        type: "stash",
        cards: [activeCard],
        timestamp: Date.now(),
      });
    }
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state.G_state);
      const newSituation = buildSituationState({
        state: endState,
        playerIndex: endState.currentPlayerIndex,
      });
      handleOutcome({ ...result, state: newSituation });
    } else {
      handleOutcome(result);
    }
  };

  const handleDiscard = () => {
    if (aiBusy || interactionLocked) return;
    const activeCard = gameState.activeCard;
    const result = discardActiveCard(gameState);
    if (!isEngineError(result) && activeCard) {
      registerAnimation({
        type: "discard",
        cards: [activeCard],
        timestamp: Date.now(),
      });
    }
    if (!isEngineError(result)) {
      const endState = finishPlayerTurn(result.state.G_state);
      const newSituation = buildSituationState({
        state: endState,
        playerIndex: endState.currentPlayerIndex,
      });
      handleOutcome({ ...result, state: newSituation });
    } else {
      handleOutcome(result);
    }
  };

  const handleReleaseHold = () => {
    if (aiBusy) return;
    if (interactionLocked) return;
    const current =
      gameState.players?.[gameState.currentPlayerIndex] ??
      gameState.players?.[0];
    const handCardCount = current?.handCards?.length ?? 0;
    const targetHandCard =
      handCardCount > 0 ? current?.handCards?.[handCardCount - 1] : undefined;
    const result = releaseHoldCard(gameState);
    if (!isEngineError(result) && targetHandCard) {
      registerAnimation({
        type: "release",
        cards: [targetHandCard],
        timestamp: Date.now(),
      });
    }
    handleOutcome(result);
  };

  const handleInteractionSelect = (optionId: string) => {
    if (!pendingInteraction) return;
    const outcome = resolveInteractionOption(gameState, optionId);
    handleOutcome(outcome);
  };

  const handleEndTurn = () => {
    if (aiBusy || interactionLocked) return;
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
    const s = initializeGameState(undefined, playerLabels);
    setShowPhaseIntro(true);
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
  const pendingInteraction = gameState.pendingInteraction;
  const interactionOwner = pendingInteraction
    ? gameState.players[pendingInteraction.ownerIndex]
    : null;
  const isLocalInteractionOwner = Boolean(
    pendingInteraction && interactionOwner && !interactionOwner.isAI
  );
  const interactionLocked = Boolean(pendingInteraction);
  const drawnCards = currentPlayer?.drawnCards ?? [];
  const stashedCards = currentPlayer?.stashedCards ?? [];
  const handCards = currentPlayer?.handCards ?? [];
  const handSize = currentPlayer?.handSize ?? DEFAULT_HAND_SIZE;
  const activeCard = gameState.activeCard;
  const activeCardState =
    currentPlayer && activeCard
      ? buildCardSituationState({
          state: gameState,
          playerIndex: gameState.currentPlayerIndex,
          card: activeCard,
        })
      : undefined;
  const mapToState = (card: CardInstance) =>
    buildCardSituationState({
      state: gameState,
      playerIndex: gameState.currentPlayerIndex,
      card,
    });
  const drawnStates = currentPlayer ? drawnCards.map(mapToState) : [];
  console.log("drawnStates", drawnStates);
  const stashedStates = currentPlayer ? stashedCards.map(mapToState) : [];
  const handStates = currentPlayer ? handCards.map(mapToState) : [];
  const deckPerspectivePlayer = currentPlayer ?? gameState.players[0];
  const deckCardStates = deckPerspectivePlayer
    ? gameState.deck.drawPile.map((card) =>
        buildCardSituationState({
          state: gameState,
          playerIndex: gameState.players.indexOf(deckPerspectivePlayer),
          card,
        })
      )
    : [];
  const canPlay = Boolean(activeCard);
  const canStash = Boolean(activeCard);
  const canDiscard = Boolean(activeCard);
  const drawDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "checkCanDraw" ||
    Boolean(activeCard) ||
    aiBusy ||
    interactionLocked;
  const playDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "waitingDrawChoice" ||
    !canPlay ||
    aiBusy ||
    interactionLocked;
  const stashDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "waitingDrawChoice" ||
    !canStash ||
    aiBusy ||
    interactionLocked;
  const discardDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "waitingDrawChoice" ||
    !canDiscard ||
    aiBusy ||
    interactionLocked;
  const releaseDisabled =
    !isPlayerTurn ||
    gameState.subPhase !== "checkCanDraw" ||
    handCards.length === 0 ||
    Boolean(activeCard) ||
    aiBusy ||
    interactionLocked;
  const endTurnDisabled = !isPlayerTurn || aiBusy || interactionLocked;
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
    (currentPlayer?.baseDraws ?? 0) +
    (currentPlayer?.extraDraws ?? 0) -
    (currentPlayer?.drawsUsed ?? 0);
  const drawButtonLabel = `抽卡 [${currentPlayer?.drawsUsed ?? 0}/${
    (currentPlayer?.baseDraws ?? 0) + (currentPlayer?.extraDraws ?? 0)
  }]`;

  const actionButtons = useMemo(() => {
    if (gameState.subPhase === "checkCanDraw") {
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
          label: "使用手牌",
          onClick: handleReleaseHold,
          disabled: releaseDisabled,
          tooltip: "从手牌中打出最右侧的卡牌。",
        },
        {
          key: "discard-hold",
          label: "丢弃手牌",
          onClick: () => {
            if (aiBusy) return;
            const res = discardHoldCard(gameState);
            handleOutcome(res);
          },
          disabled:
            !isPlayerTurn ||
            handCards.length === 0 ||
            Boolean(activeCard) ||
            aiBusy ||
            interactionLocked,
          tooltip: "丢弃最右侧的手牌。",
        },
      ];
    }
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
    drawButtonLabel,
    handleDraw,
    drawDisabled,
    drawsRemaining,
    handleReleaseHold,
    releaseDisabled,
    aiBusy,
    isPlayerTurn,
    handCards.length,
    activeCard,
    handleOutcome,
    gameState,
    interactionLocked,
    handlePlay,
    playDisabled,
    handleStash,
    stashDisabled,
    handleDiscard,
    discardDisabled,
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

  const hasAiPlayer = gameState.players.some((player) => player.isAI);

  return (
    <div id="app-root">
      <header className="top-bar">
        <div className="top-bar__info">
          <Space align="center" size="middle" wrap>
            <div className="top-bar__title">
              <h1>纯粹抽卡决斗</h1>
              <p>
                模式：{gameMode === "solo" ? "单人" : "对战"}｜层级{" "}
                {gameState.level}
              </p>
              <p>
                阶段：{gameState.phase}
                ｜子阶段： {gameState.subPhase ?? "无"}
              </p>
            </div>
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
            onClick={() => navigate("/")}
          >
            返回大厅
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleReset}
          >
            重置对决
          </button>
          {hasAiPlayer ? (
            <div className="ai-toggle">
              <span>允许 AI 自动操作</span>
              <Switch checked={autoAI} onChange={setAutoAI} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="layout">
        <div className="layout__top">
          <div className="layout__top-left">
            <Space className="players-wrapper">
              {gameState.players?.map((player, idx) => (
                <PlayerHUD
                  key={player.label + idx}
                  gameState={gameState}
                  playerIndex={idx}
                  isCurrent={
                    gameState.currentPlayerIndex === idx && isPlayerTurn
                  }
                />
              ))}
            </Space>
          </div>
          <div className="layout__top-right">
            <TurnLog entries={gameState.log} />
          </div>
        </div>

        <div className="layout__bottom">
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
              activeCardState={activeCardState}
              drawnStates={drawnStates}
              stashedStates={stashedStates}
              handStates={handStates}
              handSize={handSize}
              animationEvent={animationEvent}
              pendingInteraction={pendingInteraction}
              interactionOwnerName={
                interactionOwner?.logPrefix ?? interactionOwner?.label
              }
              isInteractionOwner={isLocalInteractionOwner}
              onDeckClick={() => setShowDeckModal(true)}
            />
          </section>
        </div>
      </div>
      <InteractionModal
        interaction={pendingInteraction}
        visible={Boolean(pendingInteraction && isLocalInteractionOwner)}
        ownerLabel={
          interactionOwner?.logPrefix ?? interactionOwner?.label ?? "你"
        }
        onSelect={handleInteractionSelect}
      />
      <MerchantModal
        isOpen={gameState.phase === "merchant"}
        offers={gameState.merchantOffers}
        onAccept={handleAcceptMerchant}
        onSkip={handleSkipMerchant}
      />
      <DeckBrowserModal
        open={showDeckModal}
        onClose={() => setShowDeckModal(false)}
        cards={deckCardStates}
      />
      <LevelResultModal
        open={showLevelResult}
        players={gameState.players}
        level={gameState.level}
        onClose={() => {
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

export default GamePlayPage;
