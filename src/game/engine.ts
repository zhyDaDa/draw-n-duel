import { cloneCardInstance } from "./cards";
import {
  buildDeckForLevel,
  getLevelConfig,
  nextLevelOrMerchantPhase,
} from "./levels";
import { buildCardSituationState, buildSituationState } from "./situations";
import {
  AI_LABEL,
  BASE_MATCH_CONFIG,
  BlankDeckState,
  DEFAULT_HAND_SIZE,
  PLAYER_LABEL,
  type ActionResult,
  type CardInstance,
  type DrawResult,
  type EngineOutcome,
  type GameState,
  type InteractionRequest,
  type InteractionTemplate,
  type LevelConfig,
  type MerchantOffer,
  type PlayerBuff,
  type PlayerState,
} from "./types";

const RNG_MOD = 0x100000000;
const RNG_MULT = 1664525;
const RNG_INC = 1013904223;

const createSeededRng = (seed: number) => {
  let current = seed >>> 0;
  return {
    next: (): number => {
      current = (Math.imul(current, RNG_MULT) + RNG_INC) >>> 0;
      return current / RNG_MOD;
    },
    getSeed: () => current >>> 0,
  };
};

const cloneBuff = (buff: PlayerBuff): PlayerBuff => ({ ...buff });

const clonePlayer = (player: PlayerState): PlayerState => ({
  ...player,
  handCards: player.handCards.map(cloneCardInstance),
  drawnCards: player.drawnCards.map(cloneCardInstance),
  stashedCards: player.stashedCards.map(cloneCardInstance),
  targetCard: player.targetCard
    ? cloneCardInstance(player.targetCard)
    : null,
  passTokens: player.passTokens.map((token) => ({ ...token })),
  victoryShards: { ...player.victoryShards },
  buffs: player.buffs.map(cloneBuff),
});

const cloneMerchantOffers = (offers: MerchantOffer[]): MerchantOffer[] =>
  offers.map((offer) => ({
    cost: offer.cost,
    buff: { ...offer.buff },
  }));

const cloneState = (state: GameState): GameState => ({
  ...state,
  players: state.players.map(clonePlayer),
  deck: {
    originalDeckSize: state.deck.originalDeckSize,
    drawPile: state.deck.drawPile.map(cloneCardInstance),
    discardPile: state.deck.discardPile.map(cloneCardInstance),
    publicInfo: { ...state.deck.publicInfo },
  },
  merchantOffers: cloneMerchantOffers(state.merchantOffers),
  log: [...state.log],
  pendingInteraction: state.pendingInteraction
    ? {
        ...state.pendingInteraction,
        sourceCard: cloneCardInstance(state.pendingInteraction.sourceCard),
        options: state.pendingInteraction.options.map((option) => ({
          ...option,
        })),
      }
    : null,
});

const appendLog = (state: GameState, message: string): void => {
  state.log.push(message);
};

const formatScore = (value: number): string =>
  Number.isInteger(value) ? `${value}` : value.toFixed(2);

const maxDrawsFor = (player: PlayerState): number =>
  player.baseDraws + player.extraDraws;
const totalLaneCards = (player: PlayerState): number =>
  player.drawnCards.length +
  player.handCards.length +
  player.stashedCards.length;

const hasFreeLaneSlot = (player: PlayerState): boolean =>
  totalLaneCards(player) < player.handSize;

const removeDrawnCard = (
  player: PlayerState,
  target: CardInstance
): void => {
  player.drawnCards = player.drawnCards.filter(
    (card) => card.instanceId !== target.instanceId
  );
};

const promoteStashedCardsToHand = (player: PlayerState): void => {
  if (!player.stashedCards.length) return;
  player.handCards = [...player.handCards, ...player.stashedCards];
  player.stashedCards = [];
};

const resetPlayerHandState = (player: PlayerState): void => {
  player.drawnCards = [];
  player.targetCard = null;
};

const addCardToDiscard = (state: GameState, card: CardInstance): void => {
  state.deck.discardPile.push(card);
};

const consumeCard = (state: GameState): CardInstance | undefined => {
  const card = state.deck.drawPile.shift();
  if (!card) return undefined;
  if (card.C_rarity === "rare" || card.C_rarity === "legendary") {
    state.deck.publicInfo.remainingRare = Math.max(
      0,
      state.deck.publicInfo.remainingRare - 1
    );
  }
  if (card.C_keywords?.includes("shard")) {
    state.deck.publicInfo.remainingShards = Math.max(
      0,
      state.deck.publicInfo.remainingShards - 1
    );
  }
  return card;
};

type CardLifecycleHook = "onDraw" | "onPlay" | "onDiscard" | "onStash";

const invokeCardHook = (
  card: CardInstance,
  hook: CardLifecycleHook,
  state: GameState,
  actor: PlayerState,
  opponent?: PlayerState
): void => {
  const handler = card.C_effect?.[hook];
  if (typeof handler === "function") {
    handler(buildCardSituationState({ state, player: actor, opponent, card }));
  }
};

type BuffLifecycleHook =
  | "onTurnStart"
  | "onTurnEnd"
  | "onAfterDraw"
  | "onBeforePlay"
  | "onAfterPlay"
  | "onBeforeStash"
  | "onAfterStash";

const invokeBuffHook = (
  buff: PlayerBuff,
  hook: BuffLifecycleHook,
  state: GameState,
  owner: PlayerState,
  opponent?: PlayerState,
  card?: CardInstance
): void => {
  const handler = buff[hook];
  if (typeof handler === "function") {
    const situation = card
      ? buildCardSituationState({ state, player: owner, opponent, card })
      : buildSituationState({ state, player: owner, opponent });
    handler(situation);
  }
};

const cloneInteractionTemplate = (
  template: InteractionTemplate
): InteractionTemplate => ({
  ...template,
  options: template.options.map((option) => ({ ...option })),
});

const resolveInteractionTemplate = (
  card: CardInstance
): InteractionTemplate | null => {
  if (!card.C_interactionTemplate) return null;
  return cloneInteractionTemplate(card.C_interactionTemplate);
};

let interactionSequence = 0;

const spawnInteractionRequest = (
  state: GameState,
  params: {
    ownerIndex: number;
    card: CardInstance;
    template: InteractionTemplate;
    resumeFrom: NonNullable<GameState["subPhase"]>;
    context?: InteractionRequest["sourceContext"];
  }
): InteractionRequest => {
  const { ownerIndex, card, template, resumeFrom, context } = params;
  const normalizedOptions = template.options.map((option, idx) => ({
    ...option,
    id: option.id ?? `option-${idx}`,
  }));
  const request: InteractionRequest = {
    ...template,
    options: normalizedOptions,
    id: `intr-${Date.now()}-${interactionSequence++}`,
    ownerIndex,
    sourceCard: card,
    createdAt: Date.now(),
    autoResolveForAI: state.players[ownerIndex]?.isAI ?? false,
    resumeFromSubPhase: resumeFrom,
    sourceContext: context ?? "active",
  };
  state.pendingInteraction = request;
  setSubPhase(state, "resolvingInteraction");
  return request;
};

const applyCardTo = (
  state: GameState,
  actor: PlayerState,
  opponent: PlayerState,
  card: CardInstance,
  resumeSubPhase: NonNullable<GameState["subPhase"]>
): string[] => {
  invokeCardHook(card, "onPlay", state, actor, opponent);
  const template = resolveInteractionTemplate(card);
  if (template) {
    const ownerIndex = state.players.indexOf(actor);
    spawnInteractionRequest(state, {
      ownerIndex: ownerIndex === -1 ? state.currentPlayerIndex : ownerIndex,
      card,
      template,
      resumeFrom: resumeSubPhase,
    });
    return [`${actor.logPrefix} 需要处理 ${card.C_name} 的效果。`];
  }
  return [`${actor.logPrefix} 结算了 ${card.C_name}`];
};

const resetPlayerForLevel = (
  player: PlayerState,
  levelConfig: LevelConfig
): void => {
  player.score = 1;
  player.drawsUsed = 0;
  player.extraDraws = 0;
  player.baseDraws = levelConfig.baseMaxDraws;
  player.handCards = [];
  player.stashedCards = [];
  player.drawnCards = [];
  player.targetCard = null;
};

const anyShardVictory = (player: PlayerState, threshold: number): boolean =>
  Object.values(player.victoryShards).some((v) => v >= threshold);

const setCurrentPlayerByIndex = (state: GameState, index: number): void => {
  if (index >= 0 && index < state.players.length) {
    state.currentPlayerIndex = index;
  }
};

const setCurrentPlayerByLabel = (
  state: GameState,
  label: PlayerState["label"]
): number => {
  const idx = state.players.findIndex((p) => p.label === label);
  if (idx >= 0) {
    state.currentPlayerIndex = idx;
    return idx;
  }
  return state.currentPlayerIndex;
};

const setNextPlayerAsCurrent = (state: GameState): number => {
  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.players.length;
  return state.currentPlayerIndex;
};

export function allPlayersCannotDraw(state: GameState): boolean {
  return state.players.every((player) => {
    const allowed = maxDrawsFor(player);
    return player.drawsUsed >= allowed || state.deck.drawPile.length === 0;
  });
}

export const ensurePhase = (
  state: GameState,
  expected: GameState["phase"],
  expectedSubPhase?: NonNullable<GameState["subPhase"]>
): EngineOutcome<void> => {
  if (state.phase !== expected) {
    return {
      type: "invalidPhase",
      message: `当前阶段为 ${state.phase}，不能执行该操作。`,
    };
  }
  if (expectedSubPhase && state.subPhase !== expectedSubPhase) {
    return {
      type: "invalidPhase",
      message: `当前子阶段为 ${
        state.subPhase ?? "(none)"
      }，预期 ${expectedSubPhase}。`,
    };
  }
  return undefined;
};

export const setLevelPhase = (
  state: GameState,
  phase: GameState["phase"]
): void => {
  console.log(
    `%c主动更改阶段: ${state.phase} -> ${phase}`,
    "border: 2px solid #0000aa; padding-left: 4px; border-radius: 4px;"
  );
  state.phase = phase;
};

export const createInitialState = (
  seed?: number,
  playerLabels: string[] = [PLAYER_LABEL, AI_LABEL]
): GameState => {
  const initialSeed = (seed ?? Date.now()) >>> 0;
  const rng = createSeededRng(initialSeed);
  const level = 1;
  const levelConfig = getLevelConfig(level);

  const players: PlayerState[] = playerLabels.map((label) => ({
    label,
    score: 1,
    drawsUsed: 0,
    baseDraws: levelConfig.baseMaxDraws,
    extraDraws: 0,
    handSize: DEFAULT_HAND_SIZE,
    targetCard: null,
    handCards: [],
    drawnCards: [],
    stashedCards: [],
    victoryShards: {},
    wins: 0,
    passTokens: [],
    shields: 0,
    merchantTokens: 0,
    logPrefix: label,
    buffs: [],
    isAI: label === AI_LABEL,
  }));

  const initial: GameState = {
    phase: "levelStart",
    subPhase: "turnStart",
    level,
    config: BASE_MATCH_CONFIG,
    deck: BlankDeckState,
    players,
    currentPlayerIndex: 0,
    activeCard: undefined,
    merchantOffers: [],
    log: ["对决开始！欢迎来到层级 1 —— Entrance Trial。"],
    rngSeed: rng.getSeed(),
    pendingInteraction: null,
  };

  initial.deck = buildDeckForLevel(
    {
      G_state: initial,
    },
    () => rng.next()
  );

  setCurrentPlayerByIndex(initial, 0);
  return initial;
};

export function nextSubPhase(state: GameState): void {
  if (state.phase !== "playerTurn") return;
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];
  const from = state.subPhase;

  switch (state.subPhase) {
    case undefined: {
      state.subPhase = "turnStart";
      break;
    }
    case "turnStart": {
      const current = state.players[state.currentPlayerIndex];
      promoteStashedCardsToHand(current);
      resetPlayerHandState(current);
      player.buffs.forEach((buff) =>
        invokeBuffHook(buff, "onTurnStart", state, player, opponent)
      );
      state.subPhase = "checkCanDraw";
      break;
    }
    case "checkCanDraw": {
      state.subPhase = "prepareDrawingCard";
      break;
    }
    case "prepareDrawingCard":
    case "waitingDrawChoice":
    case "awaitMerchantSelection":
    case "resolvingInteraction": {
      break;
    }
    case "onUseCard":
    case "onStashCard": {
      state.subPhase = "preTurnEnd";
      break;
    }
    case "preTurnEnd": {
      state.subPhase = "turnEnd";
      break;
    }
    case "turnEnd": {
      player.buffs.forEach((buff) =>
        invokeBuffHook(buff, "onTurnEnd", state, player, opponent)
      );
      if (allPlayersCannotDraw(state)) {
        appendLog(state, "所有玩家抽牌机会已用尽，进入本轮结算。");
        setLevelPhase(state, "finishRound");
      } else {
        const previous = player;
        const nextIndex = setNextPlayerAsCurrent(state);
        const nextPlayer = state.players[nextIndex];
        appendLog(
          state,
          `${previous.logPrefix} 回合结束，轮到 ${nextPlayer.logPrefix}。`
        );
        state.subPhase = "turnStart";
      }
      break;
    }
    default: {
      state.subPhase = "turnStart";
      break;
    }
  }
  console.log(`子阶段: ${from ?? "(none)"} -> ${state.subPhase}`);
}

export function setSubPhase(
  state: GameState,
  subPhase: GameState["subPhase"]
): void {
  console.log(
    `%c主动更改子阶段: ${state.subPhase ?? "(none)"} -> ${subPhase}`,
    "border-left: 2px solid #00aa00; padding-left: 4px;"
  );
  state.subPhase = subPhase;
}

export const drawCard = (sourceState: GameState): EngineOutcome<DrawResult> => {
  const validation = ensurePhase(
    sourceState,
    "playerTurn",
    "prepareDrawingCard"
  );
  if (validation) return validation;
  if (sourceState.deck.drawPile.length === 0) {
    return { type: "emptyDeck", message: "当前牌堆已空。" };
  }

  const state = cloneState(sourceState);
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];

  if (player.drawsUsed >= maxDrawsFor(player)) {
    return { type: "maxDrawsReached", message: "抽牌次数已用尽。" };
  }

  if (!hasFreeLaneSlot(player)) {
    return {
      type: "handSlotsFull",
      message: "手牌槽位已满，请先处理现有卡牌。",
    };
  }

  const card = consumeCard(state);
  if (!card) {
    return { type: "emptyDeck", message: "没有可抽取的卡牌。" };
  }

  player.drawsUsed += 1;
  state.activeCard = card;
  player.targetCard = card;
  player.drawnCards = [card];
  player.buffs.forEach((buff) =>
    invokeBuffHook(buff, "onAfterDraw", state, player, opponent, card)
  );
  invokeCardHook(card, "onDraw", state, player, opponent);

  const log = `${player.logPrefix} 抽取了 ${card.C_name}。`;
  appendLog(state, log);
  setSubPhase(state, "waitingDrawChoice");

  return { state, drawnCard: card, messsages: [log] };
};

export const playActiveCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(
    sourceState,
    "playerTurn",
    "waitingDrawChoice"
  );
  if (validation) return validation;
  if (!sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "当前没有待结算的卡牌。",
    };
  }

  const state = cloneState(sourceState);
  const card = state.activeCard;
  if (!card) {
    return {
      type: "invalidPhase",
      message: "当前没有待结算的卡牌。",
    };
  }
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];

  removeDrawnCard(player, card);
  player.buffs.forEach((buff) =>
    invokeBuffHook(buff, "onBeforePlay", state, player, opponent, card)
  );
  setSubPhase(state, "onUseCard");

  const messages = applyCardTo(state, player, opponent, card, "onUseCard");
  const awaitingInteraction =
    state.pendingInteraction?.sourceCard.instanceId === card.instanceId;

  if (!awaitingInteraction) {
    addCardToDiscard(state, card);
    state.activeCard = undefined;
    player.targetCard = null;
    player.buffs.forEach((buff) =>
      invokeBuffHook(buff, "onAfterPlay", state, player, opponent, card)
    );
    setSubPhase(state, "onUseCard");
    nextSubPhase(state);
  }

  messages.forEach((message) => appendLog(state, message));
  return {
    state,
    appliedCard: card,
    messages,
  };
};

export const resolveInteractionOption = (
  sourceState: GameState,
  optionId: string
): EngineOutcome<ActionResult> => {
  if (!sourceState.pendingInteraction) {
    return {
      type: "invalidPhase",
      message: "当前没有需要处理的交互。",
    };
  }
  const state = cloneState(sourceState);
  const interaction = state.pendingInteraction;
  if (!interaction) {
    return {
      type: "invalidPhase",
      message: "交互状态不存在。",
    };
  }
  const option = interaction.options.find((opt) => opt.id === optionId);
  if (!option) {
    return {
      type: "invalidPhase",
      message: "交互选项不存在。",
    };
  }

  const actor = state.players[interaction.ownerIndex];
  appendLog(state, `${actor.logPrefix} 选择了「${option.label}」`);

  state.pendingInteraction = null;
  addCardToDiscard(state, interaction.sourceCard);
  state.activeCard = undefined;
  state.players[interaction.ownerIndex].targetCard = null;
  state.subPhase = interaction.resumeFromSubPhase;
  if (
    state.subPhase === "onUseCard" ||
    state.subPhase === "onStashCard" ||
    state.subPhase === "preTurnEnd"
  ) {
    nextSubPhase(state);
  }

  return {
    state,
    appliedCard: interaction.sourceCard,
    messages: [`${actor.logPrefix} 完成了交互。`],
  };
};

export const stashActiveCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(
    sourceState,
    "playerTurn",
    "waitingDrawChoice"
  );
  if (validation) return validation;
  if (!sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "没有可滞留的卡牌。",
    };
  }

  const state = cloneState(sourceState);
  const activeCard = state.activeCard;
  if (!activeCard) {
    return {
      type: "invalidPhase",
      message: "没有可滞留的卡牌。",
    };
  }
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];

  player.buffs.forEach((buff) =>
    invokeBuffHook(buff, "onBeforeStash", state, player, opponent, activeCard)
  );

  removeDrawnCard(player, activeCard);
  player.stashedCards.unshift(activeCard);
  invokeCardHook(activeCard, "onStash", state, player, opponent);
  appendLog(
    state,
    `${player.logPrefix} 将 ${activeCard.C_name} 放入滞留区。`
  );
  state.activeCard = undefined;
  player.targetCard = null;

  player.buffs.forEach((buff) =>
    invokeBuffHook(buff, "onAfterStash", state, player, opponent, activeCard)
  );

  setSubPhase(state, "onStashCard");
  nextSubPhase(state);
  return {
    state,
    messages: ["卡牌已放入滞留位。"],
  };
};

export const discardActiveCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(
    sourceState,
    "playerTurn",
    "waitingDrawChoice"
  );
  if (validation) return validation;
  if (!sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "没有可以丢弃的卡牌。",
    };
  }

  const state = cloneState(sourceState);
  const player = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];
  const activeCard = state.activeCard;
  if (!activeCard) {
    return {
      type: "invalidPhase",
      message: "没有可以丢弃的卡牌。",
    };
  }

  setSubPhase(state, "onUseCard");
  removeDrawnCard(player, activeCard);
  invokeCardHook(activeCard, "onDiscard", state, player, opponent);
  addCardToDiscard(state, activeCard);
  appendLog(state, `${player.logPrefix} 丢弃了 ${activeCard.C_name}`);
  state.activeCard = undefined;
  player.targetCard = null;
  nextSubPhase(state);

  return {
    state,
    messages: ["卡牌已丢弃。"],
  };
};

export const releaseHoldCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn", "checkCanDraw");
  if (validation) return validation;
  const player = sourceState.players[sourceState.currentPlayerIndex];
  if (player.handCards.length === 0) {
    return {
      type: "noHoldCard",
      message: "手牌为空。",
    };
  }
  if (sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "先处理当前抽到的卡牌，再使用手牌。",
    };
  }

  const state = cloneState(sourceState);
  const actor = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];
  const handCard = actor.handCards.pop()!;

  state.activeCard = handCard;
  actor.targetCard = handCard;
  actor.buffs.forEach((buff) =>
    invokeBuffHook(buff, "onBeforePlay", state, actor, opponent, handCard)
  );

  const messages = applyCardTo(
    state,
    actor,
    opponent,
    handCard,
    "checkCanDraw"
  );
  const awaitingInteraction =
    state.pendingInteraction?.sourceCard.instanceId === handCard.instanceId;

  if (!awaitingInteraction) {
    addCardToDiscard(state, handCard);
    state.activeCard = undefined;
    actor.buffs.forEach((buff) =>
      invokeBuffHook(buff, "onAfterPlay", state, actor, opponent, handCard)
    );
    actor.targetCard = null;
    setSubPhase(state, "checkCanDraw");
  }

  messages.forEach((message) => appendLog(state, message));
  return {
    state,
    appliedCard: handCard,
    messages,
  };
};

export const discardHoldCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn", "checkCanDraw");
  if (validation) return validation;
  const player = sourceState.players[sourceState.currentPlayerIndex];
  if (player.handCards.length === 0) {
    return {
      type: "noHoldCard",
      message: "手牌为空。",
    };
  }

  const state = cloneState(sourceState);
  const actor = state.players[state.currentPlayerIndex];
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];
  const handCard = actor.handCards.pop()!;

  invokeCardHook(handCard, "onDiscard", state, actor, opponent);
  addCardToDiscard(state, handCard);
  appendLog(state, `${actor.logPrefix} 丢弃了手牌 ${handCard.C_name}`);
  setSubPhase(state, "checkCanDraw");

  return {
    state,
    appliedCard: handCard,
    messages: ["手牌已丢弃。"],
  };
};

export const finishPlayerTurn = (sourceState: GameState): GameState => {
  if (sourceState.phase !== "playerTurn") {
    return sourceState;
  }
  if (sourceState.pendingInteraction) {
    appendLog(sourceState, "当前有待处理的选择，无法结束回合。");
    return sourceState;
  }
  if (sourceState.activeCard) {
    appendLog(sourceState, "请先处理当前抽到的卡牌。");
    return sourceState;
  }

  const state = cloneState(sourceState);
  setSubPhase(state, "turnEnd");
  nextSubPhase(state);
  return state;
};

export const advanceSubPhase = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  nextSubPhase(state);
  return state;
};

export const beginNextPlayerTurn = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  if (state.phase !== "playerTurn") return state;
  if (state.subPhase === undefined) {
    nextSubPhase(state);
  }
  if (state.subPhase === "turnStart") {
    nextSubPhase(state);
  }
  return state;
};

const resolvePassTokens = (state: GameState, actor: PlayerState): string[] => {
  const messages: string[] = [];
  actor.passTokens = actor.passTokens.filter((token) => {
    if (token.level === state.level) {
      if (actor.score < token.threshold) {
        const before = actor.score;
        actor.score = token.threshold;
        messages.push(
          `${actor.logPrefix} 的层级通行证生效：${formatScore(
            before
          )} → ${formatScore(actor.score)}`
        );
      }
      return false;
    }
    return true;
  });
  return messages;
};

const checkShardVictory = (state: GameState): string | undefined => {
  return state.players.find((player) =>
    anyShardVictory(player, state.config.shardsToWin)
  )?.label;
};

const applyLevelEnd = (state: GameState): void => {
  state.players.forEach((player) => {
    const messages = resolvePassTokens(state, player);
    messages.forEach((message) => appendLog(state, message));
  });

  if (state.players.length >= 2) {
    const [p0, p1] = state.players;
    if (p0.score > p1.score) {
      p0.wins += 1;
      appendLog(
        state,
        `${p0.logPrefix} 以 ${formatScore(p0.score)} : ${formatScore(
          p1.score
        )} 赢下本层！`
      );
    } else if (p0.score < p1.score) {
      p1.wins += 1;
      appendLog(
        state,
        `${p1.logPrefix} 以 ${formatScore(p1.score)} : ${formatScore(
          p0.score
        )} 赢下本层。`
      );
    } else {
      appendLog(
        state,
        `双方战平 ${formatScore(p0.score)} : ${formatScore(
          p1.score
        )}，视为平局不计胜场。`
      );
    }
  }

  const shardWinner = checkShardVictory(state);
  const bestOfFiveWinner = state.players.find(
    (player) => player.wins >= 3
  )?.label;
  state.winner = shardWinner ?? bestOfFiveWinner;
};

const prepareNextLevel = (state: GameState): void => {
  state.level += 1;
  const levelConfig = getLevelConfig(state.level);

  const rng = createSeededRng(state.rngSeed);
  const deck = buildDeckForLevel({ G_state: state }, () => rng.next());
  state.rngSeed = rng.getSeed();
  state.deck = deck;

  state.players.forEach((player) => resetPlayerForLevel(player, levelConfig));

  state.activeCard = undefined;
  state.pendingInteraction = null;
  state.merchantOffers = [];
  setCurrentPlayerByLabel(state, PLAYER_LABEL);
  setLevelPhase(state, "levelStart");
  state.subPhase = "turnStart";
  appendLog(state, `进入层级 ${state.level} —— ${levelConfig.name}`);
};

const handleInterLevelTransition = (state: GameState): void => {
  if (state.level >= state.config.totalLevels) {
    setLevelPhase(state, "matchEnd");
    return;
  }
  const transition = nextLevelOrMerchantPhase(state.level);
  if (transition === "merchant") {
    appendLog(state, "层间事件暂未开放，自动前往下一层。");
  }
  prepareNextLevel(state);
};

export const skipMerchant = (sourceState: GameState): GameState => {
  if (sourceState.phase !== "merchant") return sourceState;
  const state = cloneState(sourceState);
  appendLog(state, "层间事件暂未开放，自动跳过。");
  handleInterLevelTransition(state);
  return state;
};

export const acceptMerchantOffer = (
  sourceState: GameState,
  _index: number
): EngineOutcome<GameState> => {
  if (sourceState.phase !== "merchant") {
    return {
      type: "merchantUnavailable",
      message: "当前不在层间事件阶段。",
    };
  }
  const state = cloneState(sourceState);
  appendLog(state, "层间事件内容暂未实现，自动继续前进。");
  handleInterLevelTransition(state);
  return state;
};

export function nextLevelPhase(state: GameState): void {
  switch (state.phase) {
    case "levelStart": {
      setCurrentPlayerByLabel(state, PLAYER_LABEL);
      state.subPhase = "turnStart";
      setLevelPhase(state, "playerTurn");
      break;
    }
    case "finishRound": {
      applyLevelEnd(state);
      if (state.winner) {
        setLevelPhase(state, "matchEnd");
        const winnerDisplay =
          state.winner === PLAYER_LABEL ? "玩家" : state.winner;
        appendLog(state, `比赛结束，${winnerDisplay} 获胜！`);
      } else {
        setLevelPhase(state, "finishLevel");
      }
      break;
    }
    case "finishLevel": {
      handleInterLevelTransition(state);
      break;
    }
    default:
      break;
  }
}

export const advanceLevelPhase = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  nextLevelPhase(state);
  return state;
};

export const finishLevel = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  if (state.phase === "finishRound" || state.phase === "finishLevel") {
    nextLevelPhase(state);
  }
  return state;
};

export function getAiTurnSteps(): GameState[] {
  return [];
}
