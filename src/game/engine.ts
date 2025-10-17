/**
 * 判断所有玩家是否都不能再抽卡
 */
export function allPlayersCannotDraw(state: GameState): boolean {
  return state.players.every((player) => {
    const allowed = maxDrawsFor(player);
    return player.drawsUsed >= allowed || state.deck.drawPile.length === 0;
  });
}
import {
  cloneCardInstance,
  createWeightedCard,
  getMerchantPool,
} from "./cards";
import {
  buildDeckForLevel,
  getLevelConfig,
  nextLevelOrMerchantPhase,
} from "./levels";
import {
  AI_LABEL,
  BASE_MATCH_CONFIG,
  DEFAULT_MAX_DRAWS,
  PLAYER_LABEL,
  DEFAULT_MAX_HOLD_SLOTS,
  type ActionResult,
  type CardInstance,
  type EngineOutcome,
  type GameState,
  type LevelConfig,
  type MerchantCost,
  type MerchantOffer,
  type Rarity,
  type PlayerState,
  type ResolveResult,
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

const clonePlayer = (player: PlayerState): PlayerState => ({
  ...player,
  holdSlots: player.holdSlots.map((card) => ({ ...card })),
  passTokens: player.passTokens.map((token) => ({ ...token })),
  backpack: player.backpack.map((card) => ({ ...card })),
  pendingEffects: player.pendingEffects.map((effect) => ({ ...effect })),
  buffs: player.buffs?.map((buff) => ({ ...buff })) ?? [],
});

const cloneState = (state: GameState): GameState => ({
  ...state,
  players: state.players.map(clonePlayer),
  deck: {
    drawPile: [...state.deck.drawPile],
    discardPile: [...state.deck.discardPile],
    publicInfo: { ...state.deck.publicInfo },
  },
  merchantOffers: state.merchantOffers.map((offer) => ({
    card: { ...offer.card },
    cost: { ...offer.cost },
  })),
  log: [...state.log],
});

const addCardToHold = (player: PlayerState, card: CardInstance): void => {
  player.holdSlots.unshift(card);
  if (player.holdSlots.length > player.MAX_HOLD_SLOTS) {
    player.holdSlots.length = player.MAX_HOLD_SLOTS;
  }
};

const removeTopHoldCard = (player: PlayerState): CardInstance | undefined =>
  player.holdSlots.shift();

const hasHoldCapacity = (player: PlayerState): boolean =>
  player.holdSlots.length < player.MAX_HOLD_SLOTS;

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

type MerchantCostTemplate = Pick<
  MerchantCost,
  "type" | "value" | "description" | "severity"
>;

const MERCHANT_COST_POOL: Record<Rarity, MerchantCostTemplate[]> = {
  common: [
    {
      type: "scorePenalty",
      value: 6,
      description: "立即失去 6 分",
      severity: "mild",
    },
    {
      type: "nextDrawPenalty",
      value: 1,
      description: "下一层基础抽牌次数 -1",
      severity: "mild",
    },
  ],
  uncommon: [
    {
      type: "scorePenalty",
      value: 9,
      description: "立即失去 9 分",
      severity: "moderate",
    },
    {
      type: "nextDrawPenalty",
      value: 1,
      description: "下一层基础抽牌次数 -1，并额外感到疲劳",
      severity: "moderate",
    },
    {
      type: "startScorePenalty",
      value: 4,
      description: "下一层开局时额外扣除 4 分",
      severity: "moderate",
    },
  ],
  rare: [
    {
      type: "scorePenalty",
      value: 12,
      description: "立即失去 12 分",
      severity: "severe",
    },
    {
      type: "nextDrawPenalty",
      value: 2,
      description: "下一层基础抽牌次数 -2",
      severity: "severe",
    },
    {
      type: "startScorePenalty",
      value: 8,
      description: "下一层开局时额外扣除 8 分",
      severity: "severe",
    },
  ],
  legendary: [
    {
      type: "scorePenalty",
      value: 18,
      description: "立即失去 18 分",
      severity: "severe",
    },
    {
      type: "nextDrawPenalty",
      value: 2,
      description: "下一层基础抽牌次数 -2，并使行动迟缓",
      severity: "severe",
    },
    {
      type: "startScorePenalty",
      value: 12,
      description: "下一层开局时额外扣除 12 分",
      severity: "severe",
    },
  ],
};

const pickMerchantCost = (rarity: Rarity, rng: () => number): MerchantCost => {
  const pool = MERCHANT_COST_POOL[rarity] ?? MERCHANT_COST_POOL.common;
  const template =
    pool[Math.floor(rng() * pool.length)] ?? MERCHANT_COST_POOL.common[0];
  return { ...template };
};

const applyMerchantCost = (player: PlayerState, cost: MerchantCost): string => {
  switch (cost.type) {
    case "scorePenalty": {
      player.score = Math.max(0, player.score - cost.value);
      return `${player.logPrefix} 支付代价：${cost.description}`;
    }
    case "nextDrawPenalty": {
      player.pendingEffects.push({
        type: "nextDrawPenalty",
        value: cost.value,
      });
      return `${player.logPrefix} 接受代价：${cost.description}`;
    }
    case "startScorePenalty": {
      player.pendingEffects.push({
        type: "startScorePenalty",
        value: cost.value,
      });
      return `${player.logPrefix} 接受代价：${cost.description}`;
    }
    default:
      return `${player.logPrefix} 接受代价：${cost.description}`;
  }
};

const applyPendingLevelEffects = (
  state: GameState,
  player: PlayerState
): void => {
  if (player.pendingEffects.length === 0) return;
  let drawPenalty = 0;
  let startPenalty = 0;

  player.pendingEffects.forEach((effect) => {
    if (effect.type === "nextDrawPenalty") {
      drawPenalty += effect.value;
    }
    if (effect.type === "startScorePenalty") {
      startPenalty += effect.value;
    }
  });

  if (drawPenalty > 0) {
    player.maxDraws = Math.max(1, player.maxDraws - drawPenalty);
    appendLog(state, `${player.logPrefix} 的抽牌上限因代价减少 ${drawPenalty}`);
  }

  if (startPenalty > 0) {
    player.score = Math.max(0, player.score - startPenalty);
    appendLog(
      state,
      `${player.logPrefix} 的起始分数因代价降低 ${startPenalty}`
    );
  }

  player.pendingEffects = [];
};

const appendLog = (state: GameState, message: string): void => {
  state.log.push(message);
};

const resetPlayerForLevel = (
  player: PlayerState,
  levelConfig: LevelConfig
): void => {
  player.score = 1;
  player.drawsUsed = 0;
  player.extraDraws = 0;
  player.maxDraws = levelConfig.baseMaxDraws;
};

const consumeCard = (state: GameState): CardInstance | undefined => {
  const card = state.deck.drawPile.shift();
  if (!card) {
    return undefined;
  }
  state.deck.publicInfo.remainingRare -=
    card.rarity === "rare" || card.rarity === "legendary" ? 1 : 0;
  state.deck.publicInfo.remainingShards -=
    card.effect.type === "victoryShard" ? 1 : 0;
  return card;
};

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
export const setLevelPhase = (state: GameState, phase: GameState["phase"]): void => {
  console.log(`%c主动更改阶段: ${state.phase} -> ${phase}`, "border: 2px solid #0000aa; padding-left: 4px; border-radius: 4px;");
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
  const deck = buildDeckForLevel(level, () => rng.next());

  const players: PlayerState[] = playerLabels.map((label) => ({
    label,
    score: 1,
    drawsUsed: 0,
    maxDraws: levelConfig.baseMaxDraws,
    extraDraws: 0,
    holdSlots: [],
    backpack: [],
    victoryShards: 0,
    wins: 0,
    passTokens: [],
    shields: 0,
    merchantTokens: 0,
    logPrefix: label,
    pendingEffects: [],
    buffs: [],
    isAI: label === AI_LABEL,
    MAX_HOLD_SLOTS: DEFAULT_MAX_HOLD_SLOTS,
  }));

  const initial: GameState = {
    phase: "levelStart",
    subPhase: "turnStart",
    level,
    config: BASE_MATCH_CONFIG,
    deck,
    players,
    currentPlayerIndex: 0,
    activeCard: undefined,
    merchantOffers: [],
    log: ["对决开始！欢迎来到层级 1 —— Entrance Trial。抽卡准备！"],
    rngSeed: rng.getSeed(),
  };

  setCurrentPlayerByIndex(initial, 0);
  return initial;
};

// div: 子阶段推进：
// turnStart -> awaitHoldChoice -> drawingCard -> awaitAction -> turnEnd -> nextPlayerTurnStart -> turnStart
// releaselingHoldCard -> awaitHoldChoice
// discardingHoldCard -> awaitHoldChoice
export function nextSubPhase(state: GameState): void {
  if (state.phase !== "playerTurn") {
    return;
  }
  const player = state.players[state.currentPlayerIndex];
  const from = state.subPhase;
  switch (state.subPhase) {
    case undefined:
    case "turnStart": {
      player.buffs.forEach((buff) => buff.onTurnStart?.(player, state));
      state.subPhase = "awaitHoldChoice";
      break;
    }
    case "awaitHoldChoice": {
      // 前端在此阶段可以多次释放滞留卡；当用户选择结束滞留阶段后，推进至抽卡阶段
      state.subPhase = "drawingCard";
      break;
    }
    case "drawingCard": {
      // 真正的抽卡由 drawCard 执行；此处只是在抽完卡后推进到 awaitAction
      state.subPhase = "awaitAction";
      break;
    }
    case "releaselingHoldCard": {
      // 滞留卡结算完成后，回到可继续处理滞留或抽卡
      state.subPhase = "awaitHoldChoice";
      break;
    }
    case "discardingHoldCard": {
      // 滞留卡丢弃完成后，回到可继续处理滞留或抽卡
      state.subPhase = "awaitHoldChoice";
      break;
    }
    case "stashingCard":
    case "playingCard":
    case "discardingCard": 
    case "awaitAction": {
      // 前端在此阶段选择 play/stash/discard；当没有 activeCard 时结束回合
      state.subPhase = "turnEnd";
      break;
    }
    case "turnEnd": {
      player.buffs.forEach((buff) => buff.onTurnEnd?.(player, state));
      // 在回合结束时判断是否整轮结束
      if (allPlayersCannotDraw(state)) {
        appendLog(state, "所有玩家抽牌机会已用尽，进入本轮结算。");
        state.phase = "finishRound"; // 进入 Level Phase 的结算
        break; // 留给 nextLevelPhase/finishLevel 推进
      }
      state.subPhase = "nextPlayerTurnStart";
      break;
    }
    case "nextPlayerTurnStart": {
      const previous = state.players[state.currentPlayerIndex];
      const nextIndex = setNextPlayerAsCurrent(state);
      const nextPlayer = state.players[nextIndex];
      appendLog(
        state,
        `${previous.logPrefix} 回合结束，轮到 ${nextPlayer.logPrefix}。`
      );
      state.subPhase = "turnStart";
      break;
    }
    default: {
      state.subPhase = "turnStart";
    }
  }
  // 调试日志：记录子阶段变更
  // appendLog(state, `子阶段: ${from ?? "(none)"} -> ${state.subPhase}`);
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

const maxDrawsFor = (player: PlayerState): number =>
  player.maxDraws + player.extraDraws;

const applyExtraDrawNotes = (
  player: PlayerState,
  notes?: string
): string | null => {
  if (!notes) return null;
  if (notes.startsWith("gain-extra-draw-")) {
    const value = Number.parseInt(notes.replace("gain-extra-draw-", ""), 10);
    if (Number.isFinite(value)) {
      player.extraDraws += value;
      return `${player.logPrefix} 获得了额外的抽牌次数 +${value}。`;
    }
  }
  return null;
};

const applyNegativeWithShield = (
  target: PlayerState,
  apply: () => void
): string | null => {
  if (target.shields > 0) {
    target.shields -= 1;
    return `${target.logPrefix} 消耗护盾抵挡了负面效果！`;
  }
  apply();
  return null;
};

const applyCardTo = (
  state: GameState,
  actor: PlayerState,
  opponent: PlayerState,
  card: CardInstance
): string[] => {
  const messages: string[] = [];
  switch (card.effect.type) {
    case "add": {
      const value = card.effect.value ?? 0;
      actor.score += value;
      messages.push(
        `${actor.logPrefix} 使用 ${card.name}，分数 +${value} → ${actor.score}`
      );
      break;
    }
    case "multiply": {
      const value = card.effect.value ?? 1;
      actor.score *= value;
      messages.push(`${actor.logPrefix} 的分数乘以 ${value} → ${actor.score}`);
      break;
    }
    case "set": {
      const value = card.effect.value ?? actor.score;
      actor.score = value;
      messages.push(`${actor.logPrefix} 的分数直接被设置为 ${value}`);
      break;
    }
    case "reset": {
      const value = card.effect.value ?? 1;
      actor.score = value;
      messages.push(`${actor.logPrefix} 归零重置，当前分数 ${value}`);
      break;
    }
    case "extraDraw": {
      const value = card.effect.value ?? 1;
      actor.extraDraws += value;
      messages.push(`${actor.logPrefix} 获得额外抽牌 ${value} 次`);
      break;
    }
    case "transfer": {
      const value = card.effect.value ?? 0;
      const feedback = applyNegativeWithShield(opponent, () => {
        opponent.score = Math.max(0, opponent.score - value);
      });
      if (feedback) {
        messages.push(feedback);
      } else {
        messages.push(
          `${actor.logPrefix} 让对手失去 ${value} 分 → ${opponent.score}`
        );
      }
      break;
    }
    case "steal": {
      const value = card.effect.value ?? 0;
      const feedback = applyNegativeWithShield(opponent, () => {
        opponent.score = Math.max(0, opponent.score - value);
        actor.score += value;
      });
      if (feedback) {
        messages.push(feedback);
      } else {
        messages.push(`${actor.logPrefix} 窃取 ${value} 分 → ${actor.score}`);
      }
      break;
    }
    case "victoryShard": {
      const value = card.effect.value ?? 1;
      actor.victoryShards += value;
      messages.push(
        `${actor.logPrefix} 收集到胜利碎片（${actor.victoryShards}）`
      );
      break;
    }
    case "levelPass": {
      const threshold = card.effect.value ?? 50;
      actor.passTokens.push({ level: state.level, threshold });
      messages.push(
        `${actor.logPrefix} 获得层级通行证（保底 ${threshold} 分）`
      );
      break;
    }
    case "shield": {
      const value = card.effect.value ?? 1;
      actor.shields += value;
      messages.push(`${actor.logPrefix} 获得护盾 x${value}`);
      break;
    }
    case "duplicate": {
      if (actor.holdSlots.length > 0) {
        const top = actor.holdSlots[0];
        const clone = cloneCardInstance(top);
        messages.push(`${actor.logPrefix} 复制滞留卡 ${top.name}`);
        const childMessages = applyCardTo(state, actor, opponent, clone);
        messages.push(...childMessages);
      } else {
        messages.push(`${actor.logPrefix} 尝试复制滞留卡，但槽位为空。`);
      }
      break;
    }
    case "merchantToken": {
      actor.merchantTokens += card.effect.value ?? 1;
      messages.push(`${actor.logPrefix} 获得旅行商人优惠券！`);
      break;
    }
    case "wildcard": {
      if (actor.score < opponent.score) {
        const swap = actor.score;
        actor.score = opponent.score;
        opponent.score = swap;
        messages.push(`${actor.logPrefix} 触发百变替换，分数对调！`);
      } else {
        messages.push(
          `${actor.logPrefix} 试图使用百变替换，但自己领先，效果落空。`
        );
      }
      break;
    }
    case "none":
    default:
      messages.push(`${card.name} 暂未定义明确效果。`);
  }

  const extraMessage = applyExtraDrawNotes(actor, card.effect.notes);
  if (extraMessage) {
    messages.push(extraMessage);
  }

  return messages;
};

const addCardToDiscard = (state: GameState, card: CardInstance): void => {
  state.deck.discardPile.push(card);
};

export const drawCard = (
  sourceState: GameState
): EngineOutcome<ResolveResult> => {
  const validation = ensurePhase(sourceState, "playerTurn", "drawingCard");
  if (validation) return validation;

  if (sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "当前还有待处理的卡牌，请先处理后再抽。",
    };
  }

  const state = cloneState(sourceState);
  const player = state.players[state.currentPlayerIndex];
  const allowed = maxDrawsFor(player);
  if (player.drawsUsed >= allowed) {
    return {
      type: "maxDrawsReached",
      message: `已达到本层最大抽牌次数（${allowed}）。`,
    };
  }
  if (state.deck.drawPile.length === 0) {
    return {
      type: "emptyDeck",
      message: "卡堆已经被抽空。",
    };
  }

  const card = consumeCard(state);
  if (!card) {
    return {
      type: "emptyDeck",
      message: "卡堆已经被抽空。",
    };
  }

  player.drawsUsed += 1;
  // Buff: 抽卡前/后
  player.buffs.forEach((b) => b.onBeforeDraw?.(player, state));
  state.activeCard = card;
  player.buffs.forEach((b) => b.onAfterDraw?.(player, state, card));

  nextSubPhase(state); // drawingCard -> awaitAction

  appendLog(state, `${player.logPrefix} 抽到了 ${card.name}`);

  return {
    state,
    appliedCard: card,
    messages: [`抽到 ${card.name}`],
  };
};

export const playActiveCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn");
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
  // Buff: before play
  player.buffs.forEach((b) => b.onBeforePlay?.(player, state, card));
  const messages = applyCardTo(state, player, opponent, card);
  addCardToDiscard(state, card);
  state.activeCard = undefined;
  // Buff: after play
  player.buffs.forEach((b) => b.onAfterPlay?.(player, state, card));
  messages.forEach((message) => appendLog(state, message));
  // 自动推进回合子阶段（awaitAction -> turnEnd）
  nextSubPhase(state);
  return {
    state,
    appliedCard: card,
    messages,
  };
};

export const stashActiveCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn");
  if (validation) return validation;
  if (!sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "没有可滞留的卡牌。",
    };
  }
  const player = sourceState.players[sourceState.currentPlayerIndex];
  if (!hasHoldCapacity(player)) {
    return {
      type: "invalidPhase",
      message: "滞留位已满。",
    };
  }
  const state = cloneState(sourceState);
  const activeCard = state.activeCard!;
  // Buff: before stash
  player.buffs.forEach((b) => b.onBeforeStash?.(player, state, activeCard));
  addCardToHold(state.players[state.currentPlayerIndex], activeCard);
  appendLog(
    state,
    `${player.logPrefix} 将 ${activeCard.name} 放入滞留位顶部。`
  );
  state.activeCard = undefined;
  // Buff: after stash
  player.buffs.forEach((b) => b.onAfterStash?.(player, state, activeCard));
  nextSubPhase(state); // awaitAction -> turnEnd
  return {
    state,
    messages: ["卡牌已放入滞留位。"],
  };
};

export const discardActiveCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn", "awaitAction");
  if (validation) return validation;
  if (!sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "没有可以丢弃的卡牌。",
    };
  }
  const player = sourceState.players[sourceState.currentPlayerIndex];
  const state = cloneState(sourceState);
  const activeCard = state.activeCard!;
  setSubPhase(state, "discardingCard");
  // Buff: before discard
  player.buffs.forEach((b) => b.onBeforeDiscard?.(player, state, activeCard));
  addCardToDiscard(state, activeCard);
  appendLog(state, `${player.logPrefix} 丢弃了 ${activeCard.name}`);
  state.activeCard = undefined;
  // Buff: after discard
  player.buffs.forEach((b) => b.onAfterDiscard?.(player, state, activeCard));
  nextSubPhase(state); // awaitAction -> turnEnd
  return {
    state,
    messages: ["卡牌已丢弃。"],
  };
};

export const releaseHoldCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn", "awaitHoldChoice");
  if (validation) return validation;
  const player = sourceState.players[sourceState.currentPlayerIndex];
  if (player.holdSlots.length === 0) {
    return {
      type: "noHoldCard",
      message: "滞留位为空。",
    };
  }
  if (sourceState.activeCard) {
    return {
      type: "invalidPhase",
      message: "先处理当前抽到的卡牌，再释放滞留卡。",
    };
  }
  const state = cloneState(sourceState);
  const holdCard = removeTopHoldCard(state.players[state.currentPlayerIndex])!;
  setSubPhase(state, "releaselingHoldCard");
  // Buff: before release
  player.buffs.forEach((b) => b.onBeforeRelease?.(player, state, holdCard));
  const opponent =
    state.players[(state.currentPlayerIndex + 1) % state.players.length];
  const messages = applyCardTo(
    state,
    state.players[state.currentPlayerIndex],
    opponent,
    holdCard
  );
  addCardToDiscard(state, holdCard);
  messages.forEach((message) => appendLog(state, message));
  // Buff: after release
  player.buffs.forEach((b) => b.onAfterRelease?.(player, state, holdCard));
  // 回到可继续处理滞留或抽卡
  nextSubPhase(state); // releaselingHoldCard -> awaitHoldChoice
  return {
    state,
    appliedCard: holdCard,
    messages,
  };
};

export const discardHoldCard = (
  sourceState: GameState
): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, "playerTurn", "awaitHoldChoice");
  if (validation) return validation;
  const player = sourceState.players[sourceState.currentPlayerIndex];
  if (player.holdSlots.length === 0) {
    return {
      type: "noHoldCard",
      message: "滞留位为空。",
    };
  }
  const state = cloneState(sourceState);
  const holdCard = removeTopHoldCard(state.players[state.currentPlayerIndex])!;
  setSubPhase(state, "discardingHoldCard");
  // Buff: before discard (hold)
  player.buffs.forEach((b) => b.onBeforeDiscard?.(player, state, holdCard));
  addCardToDiscard(state, holdCard);
  appendLog(state, `${player.logPrefix} 丢弃了滞留牌 ${holdCard.name}`);
  // Buff: after discard (hold)
  player.buffs.forEach((b) => b.onAfterDiscard?.(player, state, holdCard));
  nextSubPhase(state); // discardingHoldCard -> awaitHoldChoice
  return {
    state,
    appliedCard: holdCard,
    messages: ["滞留牌已丢弃。"],
  };
};

const resolvePassTokens = (state: GameState, actor: PlayerState): string[] => {
  const messages: string[] = [];
  actor.passTokens = actor.passTokens.filter((token) => {
    if (token.level === state.level) {
      const minScore = token.threshold;
      if (actor.score < minScore) {
        actor.score = minScore;
        messages.push(
          `${actor.logPrefix} 的层级通行证生效，分数提升至 ${minScore}`
        );
      }
      return false;
    }
    return true;
  });
  return messages;
};

const checkShardVictory = (state: GameState): string | undefined => {
  for (const player of state.players) {
    if (player.victoryShards >= state.config.shardsToWin) return player.label;
  }
  return undefined;
};

const applyLevelEnd = (state: GameState): void => {
  // 结算所有玩家的通行证
  state.players.forEach((player) => {
    const messages = resolvePassTokens(state, player);
    messages.forEach((message) => appendLog(state, message));
  });
  // 结算分数，统计胜场
  if (state.players.length >= 2) {
    const p0 = state.players[0];
    const p1 = state.players[1];
    if (p0.score > p1.score) {
      p0.wins += 1;
      appendLog(
        state,
        `${p0.logPrefix} 以 ${p0.score} : ${p1.score} 赢下本层！`
      );
    } else if (p1.score > p0.score) {
      p1.wins += 1;
      appendLog(
        state,
        `${p1.logPrefix} 以 ${p1.score} : ${p0.score} 赢下本层。`
      );
    } else {
      appendLog(
        state,
        `双方战平 ${p0.score} : ${p1.score}，视为平局不计胜场。`
      );
    }
  }
  // 判断胜利
  const shardWinner = checkShardVictory(state);
  let bestOfFiveWinner: string | undefined = undefined;
  for (const player of state.players) {
    if (player.wins >= 3) {
      bestOfFiveWinner = player.label;
      break;
    }
  }
  state.winner = shardWinner ?? bestOfFiveWinner;
};

const prepareNextLevel = (state: GameState): void => {
  state.level += 1;
  if (state.level > state.config.totalLevels) {
    state.phase = "matchEnd";
    return;
  }

  const rng = createSeededRng(state.rngSeed);
  const deck = buildDeckForLevel(state.level, () => rng.next());
  state.rngSeed = rng.getSeed();
  state.deck = deck;

  const levelConfig = getLevelConfig(state.level);
  state.players.forEach((player) => {
    resetPlayerForLevel(player, levelConfig);
    applyPendingLevelEffects(state, player);
  });

  state.activeCard = undefined;
  setCurrentPlayerByLabel(state, PLAYER_LABEL);
  appendLog(state, `进入层级 ${state.level} —— ${levelConfig.name}`);
  // 进入层起始阶段，等待推进到对战
  state.phase = "levelStart";
};

/**
 * 获取 AI 行动的每一步（每步一个 state），用于前端逐步推进。
 */
export function getAiTurnSteps(sourceState: GameState): GameState[] {
  const steps: GameState[] = [];
  let state = cloneState(sourceState);
  const aiIndex = state.players.findIndex((p) => p.label === AI_LABEL);
  if (aiIndex === -1) {
    return steps;
  }
  state.currentPlayerIndex = aiIndex;
  const ai = state.players[aiIndex];
  const player =
    state.players.find((_, idx) => idx !== aiIndex) ?? state.players[0];
  const allowed = maxDrawsFor(ai);
  const rng = createSeededRng(state.rngSeed);

  const shouldDraw = (): boolean => {
    if (ai.drawsUsed >= allowed) return false;
    if (state.deck.drawPile.length === 0) return false;
    if (ai.score >= player.score && ai.drawsUsed >= DEFAULT_MAX_DRAWS) {
      return rng.next() < 0.35;
    }
    return true;
  };

  // 只执行一次抽卡和处理
  if (shouldDraw()) {
    const card = consumeCard(state);
    if (card) {
      ai.drawsUsed += 1;
      appendLog(state, `AI 抽到了 ${card.name}`);
      steps.push(cloneState(state));

      const decision = decideAiAction(card, ai, player);
      if (decision === "hold" && hasHoldCapacity(ai)) {
        addCardToHold(ai, card);
        appendLog(state, "AI 将卡牌置入滞留位顶部。");
        steps.push(cloneState(state));
      } else {
        const messages = applyCardTo(state, ai, player, card);
        addCardToDiscard(state, card);
        messages.forEach((message) => appendLog(state, message));
        steps.push(cloneState(state));
      }
    }
  } else if (ai.holdSlots.length > 0 && ai.score < player.score) {
    // 没有抽卡机会时，尝试释放一张滞留卡
    const holdCard = removeTopHoldCard(ai);
    if (holdCard) {
      const messages = applyCardTo(state, ai, player, holdCard);
      addCardToDiscard(state, holdCard);
      messages.forEach((message) => appendLog(state, message));
      steps.push(cloneState(state));
    }
  }

  state.rngSeed = rng.getSeed();
  return steps;
}

// 异步执行 AI 回合，带有随机延时（100-500ms）
export const executeAiTurnAsync = async (
  sourceState: GameState,
  onStep?: (state: GameState) => void
): Promise<GameState> => {
  if (sourceState.phase !== "playerTurn") {
    return sourceState;
  }

  const steps = getAiTurnSteps(sourceState);
  let lastState = sourceState;
  for (const step of steps) {
    const delay = 100 + Math.random() * 400;
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (onStep) onStep(step);
    lastState = step;
  }

  // AI只执行一回合，结束后切换到下一个玩家
  let state = finishPlayerTurn(lastState);
  // 如果所有玩家都不能再抽卡，交给 level phase 推进
  if (allPlayersCannotDraw(state)) {
    state.phase = "finishRound";
    return state;
  }
  return state;
};

const decideAiAction = (
  card: CardInstance,
  ai: PlayerState,
  player: PlayerState
): "play" | "hold" => {
  switch (card.effect.type) {
    case "victoryShard":
    case "levelPass":
    case "shield":
    case "extraDraw":
      return "play";
    case "multiply":
      if (ai.holdSlots.length > 0) return "play";
      if (ai.score < player.score) return "play";
      return "hold";
    case "add":
      return "play";
    case "reset":
      return ai.score < player.score * 0.6 ? "play" : "hold";
    case "transfer":
    case "steal":
      return "play";
    case "duplicate":
      return ai.holdSlots.length > 0 ? "play" : "hold";
    case "wildcard":
      return ai.score < player.score ? "play" : "hold";
    default:
      return "play";
  }
};

export const finishPlayerTurn = (sourceState: GameState): GameState => {
  if (sourceState.phase !== "playerTurn") {
    return sourceState;
  }
  if (sourceState.activeCard) {
    discardActiveCard(sourceState);
  }

  const state = cloneState(sourceState);
  setSubPhase(state, "turnEnd");
  // 不直接切人，改为推进子阶段进入 nextPlayerTurnStart，由 nextSubPhase 负责切换
  nextSubPhase(state); // turnEnd -> nextPlayerTurnStart
  // 若整轮结束判断在 nextSubPhase 内将 phase 切到 finishRound，这里不再直接处理
  return state;
};

// 以不可变方式推进子阶段，返回新状态
export const advanceSubPhase = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  nextSubPhase(state);
  return state;
};

// 若当前处于 nextPlayerTurnStart，则切换到下一玩家并进入 turnStart；
// 若当前是 turnStart，则进入 awaitHoldChoice。
export const beginNextPlayerTurn = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  if (state.phase !== "playerTurn") return state;
  if (state.subPhase === "nextPlayerTurnStart") {
    nextSubPhase(state); // 会切换 currentPlayer 并置为 turnStart
  }
  if (state.subPhase === undefined || state.subPhase === "turnStart") {
    nextSubPhase(state); // turnStart -> awaitHoldChoice
  }
  return state;
};

const prepareMerchant = (state: GameState): void => {
  const rng = createSeededRng(state.rngSeed);
  const pool = getMerchantPool(state.level + 1);
  const offers: MerchantOffer[] = [];
  const offerCount = 3;
  for (let i = 0; i < offerCount; i += 1) {
    const def = pool[Math.floor(rng.next() * pool.length)];
    if (!def) continue;
    const card = createWeightedCard(def, () => rng.next());
    offers.push({
      card,
      cost: pickMerchantCost(card.rarity, () => rng.next()),
    });
  }
  state.merchantOffers = offers;
  state.rngSeed = rng.getSeed();
  setCurrentPlayerByLabel(state, PLAYER_LABEL);
  appendLog(state, "旅行商人现身，挑选你的增益吧！");
};

export const skipMerchant = (sourceState: GameState): GameState => {
  if (sourceState.phase !== "merchant") return sourceState;
  const state = cloneState(sourceState);
  appendLog(state, "你决定无视旅行商人。");
  proceedFromMerchant(state);
  return state;
};

export const acceptMerchantOffer = (
  sourceState: GameState,
  index: number
): EngineOutcome<GameState> => {
  if (sourceState.phase !== "merchant") {
    return {
      type: "merchantUnavailable",
      message: "当前不在旅行商人阶段。",
    };
  }
  const offer = sourceState.merchantOffers[index];
  if (!offer) {
    return {
      type: "merchantUnavailable",
      message: "该商品不存在。",
    };
  }

  const state = cloneState(sourceState);
  const chosen = state.merchantOffers[index];
  if (!chosen) {
    return {
      type: "merchantUnavailable",
      message: "该商品不存在。",
    };
  }

  const player = state.players[state.currentPlayerIndex];
  const canPlaceInHold = hasHoldCapacity(player);
  if (canPlaceInHold) {
    addCardToHold(player, chosen.card);
    appendLog(state, `玩家购入 ${chosen.card.name}，放入滞留位。`);
  } else {
    appendLog(state, `${player.logPrefix} 的滞留位已满, 奖励卡牌丢失！`);
  }

  const costMessage = applyMerchantCost(player, chosen.cost);

  appendLog(state, costMessage);
  state.merchantOffers = [];
  proceedFromMerchant(state);
  return state;
};

const proceedFromMerchant = (state: GameState): void => {
  prepareNextLevel(state);
  if (state.level > state.config.totalLevels) {
    state.phase = "matchEnd";
    return;
  }
  // 进入下一层的 levelStart，等待外部驱动到 playerTurn
};

// ===== Level Phase 推进（与 subPhase 类似的有限状态流） =====
export function nextLevelPhase(state: GameState): void {
  switch (state.phase) {
    case "levelStart": {
      // 开始对战：进入玩家回合流程
      setCurrentPlayerByLabel(state, PLAYER_LABEL);
      state.subPhase = "turnStart";
      state.phase = "playerTurn";
      break;
    }
    case "finishRound": {
      // 进入层结算动画阶段
      applyLevelEnd(state);
      if (state.winner) {
        state.phase = "matchEnd";
        const winnerDisplay =
          state.winner === PLAYER_LABEL ? "玩家" : state.winner;
        appendLog(state, `比赛结束，${winnerDisplay} 获胜！`);
        break;
      }
      state.phase = "finishLevel";
      break;
    }
    case "finishLevel": {
      // 决定是商人还是下一层
      const transition = nextLevelOrMerchantPhase(state.level);
      if (transition === "merchant" && state.level < state.config.totalLevels) {
        prepareMerchant(state);
        state.phase = "merchant";
        break;
      }
      prepareNextLevel(state); // 将 phase 置为 levelStart
      break;
    }
    default:
      break;
  }
}

// 以不可变方式推进 Level Phase
export const advanceLevelPhase = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  nextLevelPhase(state);
  return state;
};

// 可用于异步层结算（动画/延时），这里提供同步便捷方法
export const finishLevel = (sourceState: GameState): GameState => {
  const state = cloneState(sourceState);
  if (state.phase === "finishRound") {
    nextLevelPhase(state); // -> finishLevel 或 matchEnd
  }
  if (state.phase === "finishLevel") {
    nextLevelPhase(state); // -> merchant 或 levelStart
  }
  return state;
};
