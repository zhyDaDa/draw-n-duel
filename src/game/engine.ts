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
import { ComplexScore } from "./ComplexScore";
import {
  AI_LABEL,
  BASE_MATCH_CONFIG,
  DEFAULT_MAX_DRAWS,
  PLAYER_LABEL,
  DEFAULT_MAX_HOLD_SLOTS,
  type ActionResult,
  type CardInstance,
  type InteractionRequest,
  type InteractionTemplate,
  type EngineOutcome,
  type GameState,
  type LevelConfig,
  type MerchantCost,
  type MerchantOffer,
  type PendingEffect,
  type Rarity,
  type TargetType,
  type PlayerState,
  type PlayerBuff,
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

const nextRandomFloat = (state: GameState): number => {
  const rng = createSeededRng(state.rngSeed);
  const value = rng.next();
  state.rngSeed = rng.getSeed();
  return value;
};

const clonePlayer = (player: PlayerState): PlayerState => ({
  ...player,
  score: player.score.clone(),
  holdSlots: player.holdSlots.map((card) => ({ ...card })),
  passTokens: player.passTokens.map((token) => ({ ...token })),
  backpack: player.backpack.map((card) => ({ ...card })),
  pendingEffects: player.pendingEffects.map((effect) => ({ ...effect })),
  // clone shard counts map
  victoryShards: { ...(player.victoryShards ?? {}) },
  buffs: player.buffs?.map((buff) => ({ ...buff })) ?? [],
});

const cloneState = (state: GameState): GameState => ({
  ...state,
  players: state.players.map(clonePlayer),
  deck: {
    originalDeckSize: state.deck.originalDeckSize,
    drawPile: [...state.deck.drawPile],
    discardPile: [...state.deck.discardPile],
    publicInfo: { ...state.deck.publicInfo },
  },
  merchantOffers: state.merchantOffers.map((offer) => ({
    card: { ...offer.card },
    cost: { ...offer.cost },
  })),
  log: [...state.log],
  pendingInteraction: state.pendingInteraction
    ? {
        ...state.pendingInteraction,
        sourceCard: { ...state.pendingInteraction.sourceCard },
      }
    : null,
});

// ---- Shard helpers ----
const addShardsTo = (
  player: PlayerState,
  color: string,
  count: number = 1
): number => {
  if (!player.victoryShards) player.victoryShards = {};
  const prev = player.victoryShards[color] ?? 0;
  const next = prev + count;
  player.victoryShards[color] = next;
  return next;
};

const anyShardVictory = (player: PlayerState, threshold: number): boolean => {
  if (!player.victoryShards) return false;
  return Object.values(player.victoryShards).some((v) => v >= threshold);
};

const addCardToHold = (player: PlayerState, card: CardInstance): void => {
  player.holdSlots.unshift(card);
  if (player.holdSlots.length > player.MAX_HOLD_SLOTS) {
    player.holdSlots.length = player.MAX_HOLD_SLOTS;
  }
};

const generateBuffId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const removeBuffById = (player: PlayerState, buffId: string): void => {
  player.buffs = player.buffs.filter((buff) => buff.id !== buffId);
};

const findBuff = (
  player: PlayerState,
  predicate: (buff: PlayerBuff) => boolean
): PlayerBuff | undefined => player.buffs.find(predicate);

const addCollectionCharacter = (
  player: PlayerState,
  char: string,
  options?: { icon?: string; description?: string }
): PlayerBuff => {
  const existing = findBuff(
    player,
    (buff) => buff.category === "collection" && buff.meta?.char === char
  );
  if (existing) {
    existing.count += 1;
    return existing;
  }
  const buff: PlayerBuff = {
    id: generateBuffId(`char-${char}`),
    name: `收藏「${char}」`,
    description: options?.description ?? `收集到汉字 ${char}`,
    icon: options?.icon ?? "/src/assets/svg/文字收藏.svg",
    effect: { type: "none" },
    isPermanent: true,
    count: 1,
    category: "collection",
    meta: { char },
  };
  player.buffs.push(buff);
  return buff;
};

const countCollectedCharacters = (player: PlayerState): number =>
  player.buffs
    .filter((buff) => buff.category === "collection")
    .reduce((sum, buff) => sum + (buff.count ?? 1), 0);

const addKeyBuff = (
  player: PlayerState,
  keyType: string,
  options?: { name?: string; description?: string; icon?: string }
): PlayerBuff => {
  const existing = findBuff(
    player,
    (buff) => buff.category === "key" && buff.meta?.keyType === keyType
  );
  if (existing) {
    existing.count += 1;
    return existing;
  }
  const buff: PlayerBuff = {
    id: generateBuffId(`key-${keyType}`),
    name: options?.name ?? `${keyType} 钥匙`,
    description: options?.description ?? `掌握 ${keyType} 钥匙，可在特殊事件中使用。`,
    icon: options?.icon ?? "/src/assets/svg/钥匙.svg",
    effect: { type: "none" },
    isPermanent: true,
    count: 1,
    category: "key",
    meta: { keyType },
  };
  player.buffs.push(buff);
  return buff;
};

const consumeKeyBuff = (
  player: PlayerState,
  keyType: string,
  amount: number = 1
): boolean => {
  const buff = findBuff(
    player,
    (b) => b.category === "key" && b.meta?.keyType === keyType
  );
  if (!buff) return false;
  if (buff.count <= amount) {
    removeBuffById(player, buff.id);
  } else {
    buff.count -= amount;
  }
  return true;
};

const removeTopHoldCard = (player: PlayerState): CardInstance | undefined =>
  player.holdSlots.shift();

const hasHoldCapacity = (player: PlayerState): boolean =>
  player.holdSlots.length < player.MAX_HOLD_SLOTS;

const maxDrawsFor = (player: PlayerState): number =>
  player.maxDraws + player.extraDraws;

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
      player.score.subtractReal(cost.value);
      return `${player.logPrefix} 支付代价：${
        cost.description
      }（当前 ${player.score.toString()}）`;
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
    player.score.subtractReal(startPenalty);
    appendLog(
      state,
      `${
        player.logPrefix
      } 的起始分数因代价降低 ${startPenalty} → ${player.score.toString()}`
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
  player.score.set(1, 0);
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
  state.deck.publicInfo.remainingShards -= card.tags?.includes("shard") ? 1 : 0;
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
    score: ComplexScore.from(1, 0),
    drawsUsed: 0,
    maxDraws: levelConfig.baseMaxDraws,
    extraDraws: 0,
    holdSlots: [],
    backpack: [],
    victoryShards: {},
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
  const deck = buildDeckForLevel(players, level, () => rng.next());

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
    pendingInteraction: null,
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
        setLevelPhase(state, "finishRound"); // 进入 Level Phase 的结算
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

const compareScore = (a: ComplexScore, b: ComplexScore | number): number =>
  a.compareMagnitude(b);

const parseEffectNotes = (notes?: string): Record<string, string> => {
  if (!notes) return {};
  return notes
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .reduce<Record<string, string>>((acc, segment) => {
      const [key, ...rest] = segment.split("=");
      if (rest.length === 0) {
        acc[key] = "true";
      } else {
        acc[key] = rest.join("=");
      }
      return acc;
    }, {});
};

const resolveEffectTargets = (
  actor: PlayerState,
  opponent: PlayerState,
  target?: TargetType
): PlayerState[] => {
  if (target === "opponent") return [opponent];
  if (target === "both") return [actor, opponent];
  return [actor];
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
    sourceCard: { ...card },
    createdAt: Date.now(),
    autoResolveForAI: state.players[ownerIndex]?.isAI ?? false,
    resumeFromSubPhase: resumeFrom,
    sourceContext: context ?? "active",
  };
  state.pendingInteraction = request;
  setSubPhase(state, "resolvingInteraction");
  return request;
};

type InteractionBuilderContext = {
  state: GameState;
  actor: PlayerState;
  opponent: PlayerState;
  card: CardInstance;
};

type InteractionBuilder = (
  ctx: InteractionBuilderContext
) => InteractionTemplate | null;

const INTERACTION_BUILDERS: Record<string, InteractionBuilder> = {};

const cloneInteractionTemplate = (
  template: InteractionTemplate
): InteractionTemplate => ({
  ...template,
  options: template.options.map((option) => ({ ...option })),
});

const resolveInteractionTemplate = (
  ctx: InteractionBuilderContext
): InteractionTemplate | null => {
  if (ctx.card.interactionTemplate) {
    return cloneInteractionTemplate(ctx.card.interactionTemplate);
  }
  const interactionId = ctx.card.effect.interactionId;
  if (!interactionId) return null;
  const builder = INTERACTION_BUILDERS[interactionId];
  if (!builder) return null;
  const template = builder(ctx);
  return template ? cloneInteractionTemplate(template) : null;
};

const executeScriptEffect = (
  state: GameState,
  actor: PlayerState,
  opponent: PlayerState,
  card: CardInstance
): string[] => {
  const scriptId = card.effect.script ?? "";
  const params = parseEffectNotes(card.effect.notes);
  const messages: string[] = [];

  const getNumberParam = (key: string, fallback: number): number => {
    const raw = params[key];
    if (raw === undefined) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const logTransition = (
    target: PlayerState,
    before: ComplexScore,
    description: string
  ) => {
    messages.push(
      `${
        target.logPrefix
      } ${description}：${before.toString()} → ${target.score.toString()}`
    );
  };

  switch (scriptId) {
    case "math.add": {
      const amount = getNumberParam("value", card.effect.value ?? 0);
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        target.score.addReal(amount);
        logTransition(target, before, `通过 ${card.name} +${amount}`);
      });
      break;
    }
    case "math.multiply": {
      const factor = getNumberParam("factor", card.effect.value ?? 1);
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        target.score.multiplyScalar(factor);
        logTransition(target, before, `通过 ${card.name} 乘以 ${factor}`);
      });
      break;
    }
    case "math.divide": {
      const divisorRaw = Math.trunc(card.effect.value ?? 1);
      const safeDivisor = divisorRaw === 0 ? 1 : Math.abs(divisorRaw);
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        target.score.divideScalar(safeDivisor);
        logTransition(target, before, `通过 ${card.name} 除以 ${safeDivisor}`);
      });
      break;
    }
    case "math.power": {
      const exponent = card.effect.value ?? 2;
      const cap = getNumberParam("cap", Number.POSITIVE_INFINITY);
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        target.score.power(exponent);
        if (Number.isFinite(cap) && target.score.modulus() > cap) {
          target.score.normalizeMagnitude(cap);
        }
        logTransition(target, before, `使用 ${card.name} 进行指数运算`);
      });
      break;
    }
    case "score.set": {
      const desired = card.effect.value ?? 0;
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const doSet = () => target.score.set(desired, 0);
        const before = target.score.clone();
        if (target === opponent && compareScore(opponent.score, desired) > 0) {
          const feedback = applyNegativeWithShield(opponent, doSet);
          if (feedback) {
            messages.push(feedback);
          } else {
            logTransition(
              opponent,
              before,
              `被 ${card.name} 强制设置为 ${desired}`
            );
          }
        } else {
          doSet();
          logTransition(target, before, `被 ${card.name} 设置为 ${desired}`);
        }
      });
      break;
    }
    case "score.invert": {
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        const applyInvert = () => target.score.negate();
        if (target === opponent) {
          const feedback = applyNegativeWithShield(opponent, applyInvert);
          if (feedback) {
            messages.push(feedback);
          } else {
            logTransition(opponent, before, `受到 ${card.name} 的分数反转`);
          }
        } else {
          applyInvert();
          logTransition(target, before, `触发 ${card.name} 的反转`);
        }
      });
      break;
    }
    case "score.percentTransfer": {
      const percent = Math.max(
        0,
        Math.min(100, Math.trunc(card.effect.value ?? 0))
      );
      if (percent <= 0) {
        messages.push(`${card.name} 的数值不足以窃取分数。`);
        break;
      }
      const reductionFactor = 1 - percent / 100;
      const initial = opponent.score.modulus();
      if (initial <= 0) {
        messages.push(`${opponent.logPrefix} 没有可窃取的分数。`);
        break;
      }
      const feedback = applyNegativeWithShield(opponent, () => {
        opponent.score.scaleMagnitude(reductionFactor);
      });
      if (feedback) {
        messages.push(feedback);
      } else {
        const after = opponent.score.modulus();
        const stolen = initial - after;
        actor.score.addReal(stolen);
        messages.push(
          `${actor.logPrefix} 窃取了 ${percent}% 分数（≈${stolen.toFixed(
            2
          )}），当前 ${actor.score.toString()}`
        );
      }
      break;
    }
    case "score.floorHalf": {
      const targetMagnitude = Math.ceil(opponent.score.modulus() / 2);
      if (compareScore(actor.score, targetMagnitude) >= 0) {
        messages.push(`${actor.logPrefix} 已达对手一半的模长，无需调整。`);
      } else {
        const before = actor.score.clone();
        actor.score.normalizeMagnitude(targetMagnitude);
        logTransition(actor, before, `借助 ${card.name} 稳定到对手一半模长`);
      }
      break;
    }
    case "shard.cost": {
      const shardCount = Math.max(1, Math.trunc(card.effect.value ?? 1));
      const color = params.color ?? "未知";
      messages.push(
        `${actor.logPrefix} 选择支付代价以获得 ${color} 碎片 x${shardCount}。`
      );
      
      const scorePenalty = Math.max(
        0,
        Math.trunc(getNumberParam("scorePenalty", 0))
      );
      const nextDrawPenalty = Math.max(
        0,
        Math.trunc(getNumberParam("nextDrawPenalty", 0))
      );
      const startScorePenalty = Math.max(
        0,
        Math.trunc(getNumberParam("startScorePenalty", 0))
      );

      if (scorePenalty > 0) {
        actor.score.subtractReal(scorePenalty);
        messages.push(
          `${
            actor.logPrefix
          } 为获得碎片失去 ${scorePenalty} 分 → ${actor.score.toString()}`
        );
      }

      if (nextDrawPenalty > 0) {
        actor.pendingEffects.push({
          type: "nextDrawPenalty",
          value: nextDrawPenalty,
        });
        messages.push(`${actor.logPrefix} 下层抽牌次数 -${nextDrawPenalty}。`);
      }

      if (startScorePenalty > 0) {
        actor.pendingEffects.push({
          type: "startScorePenalty",
          value: startScorePenalty,
        });
        messages.push(
          `${actor.logPrefix} 下一层开局额外扣 ${startScorePenalty} 分。`
        );
      }

      // const newCount = addShardsTo(actor, color, shardCount);
      // messages.push(
      //   `${actor.logPrefix} 获得了 ${color} 碎片 x${shardCount}（该色共 ${newCount}）。`
      // );
      break;
    }
    case "shard.tradeDraw": {
      const shards = Math.max(
        1,
        Math.trunc(getNumberParam("shards", card.effect.value ?? 1))
      );
      const color = params.color ?? "未知";
      const remaining = Math.max(0, maxDrawsFor(actor) - actor.drawsUsed);
      let cost = Math.trunc(card.effect.value ?? -1);
      if (cost < 0) cost = remaining;
      cost = Math.min(cost, remaining);
      if (cost <= 0) {
        messages.push(`${actor.logPrefix} 没有可放弃的抽牌次数，交易失败。`);
        break;
      }
      actor.drawsUsed += cost;
      const scorePenalty = Math.max(
        0,
        Math.trunc(getNumberParam("scorePenalty", 0))
      );

      if (scorePenalty > 0) {
        actor.score.subtractReal(scorePenalty);
        messages.push(`${actor.logPrefix} 付出代价，失去 ${scorePenalty} 分。`);
      }

      const newCountT = addShardsTo(actor, color, shards);
      messages.push(
        `${actor.logPrefix} 放弃 ${cost} 次抽牌机会，换取 ${color} 碎片 x${shards}（该色共 ${newCountT}）。`
      );
      break;
    }
    case "shard.threshold": {
      const threshold = Math.trunc(card.effect.value ?? 10);
      const shards = Math.max(1, Math.trunc(getNumberParam("shards", 1)));
      const scorePenalty = Math.max(
        0,
        Math.trunc(getNumberParam("scorePenalty", 0))
      );
      const color = params.color ?? "未知";
      if (compareScore(actor.score, threshold) <= 0) {
        const newCt = addShardsTo(actor, color, shards);
        messages.push(
          `${actor.logPrefix} 在模长 ≤ ${threshold} 时获得 ${color} 碎片 x${shards}（该色共 ${newCt}）。`
        );
      } else if (scorePenalty > 0) {
        actor.score.subtractReal(scorePenalty);
        messages.push(
          `${
            actor.logPrefix
          } 未满足条件，反而失去 ${scorePenalty} 分 → ${actor.score.toString()}`
        );
      } else {
        messages.push(`${actor.logPrefix} 未满足碎片条件，效果落空。`);
      }
      break;
    }
    case "debuff.drawPenalty": {
      const targets = resolveEffectTargets(
        actor,
        opponent,
        card.effect.target ?? "opponent"
      );
      const penalty = Math.max(1, Math.trunc(card.effect.value ?? 1));
      targets.forEach((target) => {
        const pending: PendingEffect = {
          type: "nextDrawPenalty",
          value: penalty,
        };
        target.pendingEffects.push(pending);
        messages.push(`${target.logPrefix} 的下一层抽牌次数 -${penalty}。`);
      });
      break;
    }
    case "hold.boost": {
      const perCard = Math.trunc(card.effect.value ?? 2);
      const count = actor.holdSlots.length;
      if (count === 0) {
        messages.push(`${actor.logPrefix} 的滞留位为空，增幅未生效。`);
      } else {
        const gain = perCard * count;
        const before = actor.score.clone();
        actor.score.addReal(gain);
        logTransition(
          actor,
          before,
          `通过 ${card.name} 获得连击增幅 +${gain}（滞留卡 x${count}）`
        );
      }
      break;
    }
    case "hold.burn": {
      const payout = Math.trunc(card.effect.value ?? 4);
      let burned = 0;
      while (actor.holdSlots.length > 0) {
        const removed = actor.holdSlots.shift();
        if (!removed) break;
        state.deck.discardPile.push(removed);
        burned += 1;
      }
      if (burned === 0) {
        messages.push(`${actor.logPrefix} 没有可释放的滞留卡。`);
      } else {
        const gain = burned * payout;
        const before = actor.score.clone();
        actor.score.addReal(gain);
        logTransition(actor, before, `释放滞留连锁获得 ${gain} 分`);
      }
      break;
    }
    case "hold.expand": {
      const increment = Math.max(1, Math.trunc(card.effect.value ?? 1));
      const maxCap = Math.max(
        actor.MAX_HOLD_SLOTS,
        Math.trunc(getNumberParam("max", actor.MAX_HOLD_SLOTS + increment))
      );
      const newCap = Math.min(actor.MAX_HOLD_SLOTS + increment, maxCap);
      if (newCap === actor.MAX_HOLD_SLOTS) {
        messages.push(
          `${actor.logPrefix} 的滞留容量已达上限，无法进一步扩容。`
        );
      } else {
        actor.MAX_HOLD_SLOTS = newCap;
        messages.push(`${actor.logPrefix} 的滞留位扩容至 ${newCap} 个槽位。`);
      }
      break;
    }
    case "defense.steadyBuffer": {
      const threshold = Math.trunc(card.effect.value ?? 12);
      if (compareScore(actor.score, threshold) >= 0) {
        messages.push(
          `${actor.logPrefix} 的模长已高于 ${threshold}，无需缓冲。`
        );
      } else {
        const before = actor.score.clone();
        actor.score.normalizeMagnitude(threshold);
        logTransition(actor, before, `通过 ${card.name} 稳定在 ${threshold}`);
      }
      break;
    }
    case "resource.drawToScore": {
      const mode = params.mode ?? "linear";
      const remaining = Math.max(0, maxDrawsFor(actor) - actor.drawsUsed);
      if (remaining === 0) {
        messages.push(`${actor.logPrefix} 没有剩余抽牌次数，无法转化资源。`);
        break;
      }
      let gain: number;
      if (mode === "quadratic") {
        gain = remaining * remaining;
      } else {
        const ratio = card.effect.value ?? 3;
        gain = remaining * ratio;
      }
      const before = actor.score.clone();
      actor.score.addReal(gain);
      actor.drawsUsed = maxDrawsFor(actor);
      logTransition(actor, before, `转化 ${remaining} 次抽牌获取 ${gain} 分`);
      break;
    }
    case "resource.recoverDiscard": {
      if (state.deck.discardPile.length === 0) {
        messages.push(`${actor.logPrefix} 的弃牌堆为空。`);
        break;
      }
      const recovered = state.deck.discardPile.pop();
      if (!recovered) {
        messages.push(`没有可回收的卡牌。`);
        break;
      }
      if (!hasHoldCapacity(actor)) {
        state.deck.discardPile.push(recovered);
        messages.push(`${actor.logPrefix} 的滞留位已满，回收失败。`);
        break;
      }
      actor.holdSlots.unshift(recovered);
      messages.push(
        `${actor.logPrefix} 将 ${recovered.name} 回收到滞留位顶部。`
      );
      break;
    }
    case "collection.addChar": {
      const char = params.char ?? card.name.charAt(0) ?? "字";
      addCollectionCharacter(actor, char, {
        description: params.description,
        icon: params.icon,
      });
      messages.push(`${actor.logPrefix} 收集到汉字「${char}」。`);
      break;
    }
    case "key.add": {
      const keyType = params.type ?? "simple";
      addKeyBuff(actor, keyType, {
        name: params.name,
        description: params.description,
        icon: params.icon,
      });
      messages.push(`${actor.logPrefix} 获得 ${keyType} 钥匙。`);
      break;
    }
    case "key.consume": {
      const keyType = params.type ?? "simple";
      const ok = consumeKeyBuff(actor, keyType, Number(params.amount ?? 1));
      if (ok) {
        messages.push(`${actor.logPrefix} 消耗了 ${keyType} 钥匙。`);
      } else {
        messages.push(`${actor.logPrefix} 没有 ${keyType} 钥匙可供消耗。`);
      }
      break;
    }
    case "collection.countToScore": {
      const per = Number(params.per ?? card.effect.value ?? 0);
      const count = countCollectedCharacters(actor);
      if (count <= 0 || per === 0) {
        messages.push(`${actor.logPrefix} 还没有收藏任何汉字。`);
        break;
      }
      const gain = per * count;
      const before = actor.score.clone();
      actor.score.addReal(gain);
      logTransition(
        actor,
        before,
        `凭借 ${count} 个汉字，每个奖励 ${per}`
      );
      break;
    }
    case "math.abs": {
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        const transformed = Math.abs(before.real);
        target.score.set(transformed, 0);
        logTransition(target, before, `通过 ${card.name} 取绝对值`);
      });
      break;
    }
    case "math.squareRootChain":
    case "legacy.makeAChoice.squareRoot": {
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        const squared = before.real * before.real;
        const transformed = Math.sqrt(Math.abs(squared));
        target.score.set(transformed, 0);
        logTransition(target, before, `通过 ${card.name} 先平方后开根`);
      });
      break;
    }
    case "math.randomZeroClamp":
    case "legacy.ranZero": {
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        const min = Math.min(0, before.real);
        const max = Math.max(0, before.real);
        const span = max - min;
        const roll = span === 0 ? 0 : nextRandomFloat(state);
        const value = span === 0 ? min : min + span * roll;
        target.score.set(value, 0);
        logTransition(
          target,
          before,
          `通过 ${card.name} 在区间 [${min.toFixed(2)}, ${max.toFixed(2)}] 随机取值`
        );
      });
      break;
    }
    case "legacy.ansSixCycle":
    case "math.ansSixCycle": {
      const targets = resolveEffectTargets(actor, opponent, card.effect.target);
      targets.forEach((target) => {
        const before = target.score.clone();
        const ansReal = before.real;
        const transformed = ((ansReal - 6) * 6 + 6) / 6;
        target.score.set(transformed, 0);
        logTransition(target, before, `通过 ${card.name} 触发 (((Ans-6)*6)+6)/6`);
      });
      break;
    }
    default: {
      messages.push(
        `${card.name} 的特殊脚本 ${scriptId || "(未指定)"} 尚未实现。`
      );
    }
  }

  return messages;
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
      const before = actor.score.clone();
      actor.score.addReal(value);
      messages.push(
        `${actor.logPrefix} 使用 ${
          card.name
        }，分数 +${value}：${before.toString()} → ${actor.score.toString()}`
      );
      break;
    }
    case "multiply": {
      const value = card.effect.value ?? 1;
      const before = actor.score.clone();
      actor.score.multiplyScalar(value);
      messages.push(
        `${
          actor.logPrefix
        } 的分数乘以 ${value}：${before.toString()} → ${actor.score.toString()}`
      );
      break;
    }
    case "set": {
      const value = card.effect.value ?? actor.score.modulus();
      const before = actor.score.clone();
      actor.score.set(value, 0);
      messages.push(
        `${actor.logPrefix} 的分数被 ${
          card.name
        } 设置为 ${value}：${before.toString()} → ${actor.score.toString()}`
      );
      break;
    }
    case "reset": {
      const value = card.effect.value ?? 1;
      const before = actor.score.clone();
      actor.score.set(value, 0);
      messages.push(
        `${
          actor.logPrefix
        } 归零重置：${before.toString()} → ${actor.score.toString()}`
      );
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
        opponent.score.subtractReal(value);
      });
      if (feedback) {
        messages.push(feedback);
      } else {
        messages.push(
          `${
            actor.logPrefix
          } 让对手失去 ${value} 分 → ${opponent.score.toString()}`
        );
      }
      break;
    }
    case "steal": {
      const value = card.effect.value ?? 0;
      const feedback = applyNegativeWithShield(opponent, () => {
        opponent.score.subtractReal(value);
        actor.score.addReal(value);
      });
      if (feedback) {
        messages.push(feedback);
      } else {
        messages.push(
          `${actor.logPrefix} 窃取 ${value} 分 → ${actor.score.toString()}`
        );
      }
      break;
    }
    case "victoryShard": {
      const value = card.effect.value ?? 1;
      // allow optional color in notes for generic victoryShard cards
      const localParams = parseEffectNotes(card.effect.notes);
      if (card.effect.script) {
        const scriptMessages = executeScriptEffect(state, actor, opponent, card);
        messages.push(...scriptMessages);
      }
      const color = localParams.color ?? "命运";
      const newCt = addShardsTo(actor, color, value);
      messages.push(
        `${actor.logPrefix} 收集到 ${color} 碎片 x${value}（该色共 ${newCt}）`
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
      if (compareScore(actor.score, opponent.score) < 0) {
        const swap = actor.score.clone();
        const beforeOpponent = opponent.score.clone();
        actor.score.setFrom(beforeOpponent);
        opponent.score.setFrom(swap);
        messages.push(
          `${
            actor.logPrefix
          } 触发百变替换，分数对调！当前 ${actor.score.toString()} / ${opponent.score.toString()}`
        );
      } else {
        messages.push(
          `${actor.logPrefix} 试图使用百变替换，但自己领先，效果落空。`
        );
      }
      break;
    }
    case "script": {
      const scriptMessages = executeScriptEffect(state, actor, opponent, card);
      messages.push(...scriptMessages);
      break;
    }
    case "interactive": {
      const ownerIndex = state.players.indexOf(actor);
      const template = resolveInteractionTemplate({
        state,
        actor,
        opponent,
        card,
      });
      if (!template) {
        messages.push(`${card.name} 缺少交互模板，效果未生效。`);
        break;
      }
      spawnInteractionRequest(state, {
        ownerIndex: ownerIndex >= 0 ? ownerIndex : state.currentPlayerIndex,
        card,
        template,
        resumeFrom: state.subPhase ?? "awaitAction",
      });
      messages.push(`${actor.logPrefix} 正在处理 ${card.name} 的抉择…`);
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
  const awaitingInteraction =
    state.pendingInteraction?.sourceCard.instanceId === card.instanceId;
  if (!awaitingInteraction) {
    addCardToDiscard(state, card);
    state.activeCard = undefined;
  }
  // Buff: after play
  player.buffs.forEach((b) => b.onAfterPlay?.(player, state, card));
  messages.forEach((message) => appendLog(state, message));
  // 自动推进回合子阶段（awaitAction -> turnEnd）
  if (!awaitingInteraction) {
    nextSubPhase(state);
  } else {
    setSubPhase(state, "resolvingInteraction");
  }
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
      message: "交互状态已被清除，请重试。",
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
  const opponent =
    state.players[(interaction.ownerIndex + 1) % state.players.length];
  const optionEffects = Array.isArray(option.effect)
    ? option.effect.map((effect) => ({ ...effect }))
    : option.effect
    ? [{ ...option.effect }]
    : [];
  if (option.resultScript) {
    optionEffects.push({
      type: "script",
      script: option.resultScript,
      target: "self",
    });
  }

  const messages: string[] = [
    `${actor.logPrefix} 选择了「${option.label}」`,
  ];

  optionEffects.forEach((effect, idx) => {
    const pseudoCard: CardInstance = {
      ...interaction.sourceCard,
      instanceId: `${interaction.sourceCard.instanceId}-opt-${idx}`,
      effect,
    };
    const resultMessages = applyCardTo(state, actor, opponent, pseudoCard);
    messages.push(...resultMessages);
  });

  state.pendingInteraction = null;
  addCardToDiscard(state, interaction.sourceCard);
  state.activeCard = undefined;
  state.subPhase = interaction.resumeFromSubPhase;
  nextSubPhase(state);
  messages.forEach((message) => appendLog(state, message));
  return {
    state,
    appliedCard: interaction.sourceCard,
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
  state.activeCard = holdCard;
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
  const awaitingInteraction =
    state.pendingInteraction?.sourceCard.instanceId === holdCard.instanceId;
  if (!awaitingInteraction) {
    addCardToDiscard(state, holdCard);
    state.activeCard = undefined;
  } else {
    setSubPhase(state, "resolvingInteraction");
  }
  messages.forEach((message) => appendLog(state, message));
  // Buff: after release
  player.buffs.forEach((b) => b.onAfterRelease?.(player, state, holdCard));
  // 回到可继续处理滞留或抽卡
  if (!awaitingInteraction) {
    nextSubPhase(state); // releaselingHoldCard -> awaitHoldChoice
  }
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
      if (compareScore(actor.score, minScore) < 0) {
        const before = actor.score.clone();
        actor.score.set(minScore, 0);
        messages.push(
          `${
            actor.logPrefix
          } 的层级通行证生效：${before.toString()} → ${actor.score.toString()}`
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
    if (anyShardVictory(player, state.config.shardsToWin)) return player.label;
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
    const comparison = compareScore(p0.score, p1.score);
    if (comparison > 0) {
      p0.wins += 1;
      appendLog(
        state,
        `${
          p0.logPrefix
        } 以 ${p0.score.toString()} : ${p1.score.toString()} 赢下本层！`
      );
    } else if (comparison < 0) {
      p1.wins += 1;
      appendLog(
        state,
        `${
          p1.logPrefix
        } 以 ${p1.score.toString()} : ${p0.score.toString()} 赢下本层。`
      );
    } else {
      appendLog(
        state,
        `双方战平 ${p0.score.toString()} : ${p1.score.toString()}，视为平局不计胜场。`
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
    setLevelPhase(state, "matchEnd");
    return;
  }

  const rng = createSeededRng(state.rngSeed);
  const deck = buildDeckForLevel(state.players, state.level, () => rng.next());
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
  setLevelPhase(state, "levelStart");
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
    if (
      compareScore(ai.score, player.score) >= 0 &&
      ai.drawsUsed >= DEFAULT_MAX_DRAWS
    ) {
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
  } else if (
    ai.holdSlots.length > 0 &&
    compareScore(ai.score, player.score) < 0
  ) {
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
      if (compareScore(ai.score, player.score) < 0) return "play";
      return "hold";
    case "add":
      return "play";
    case "reset":
      return compareScore(ai.score, player.score.modulus() * 0.6) < 0
        ? "play"
        : "hold";
    case "transfer":
    case "steal":
      return "play";
    case "duplicate":
      return ai.holdSlots.length > 0 ? "play" : "hold";
    case "wildcard":
      return compareScore(ai.score, player.score) < 0 ? "play" : "hold";
    default:
      return "play";
  }
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
    setLevelPhase(state, "matchEnd");
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
      setLevelPhase(state, "playerTurn");
      break;
    }
    case "finishRound": {
      // 进入层结算动画阶段
      applyLevelEnd(state);
      if (state.winner) {
        setLevelPhase(state, "matchEnd");
        const winnerDisplay =
          state.winner === PLAYER_LABEL ? "玩家" : state.winner;
        appendLog(state, `比赛结束，${winnerDisplay} 获胜！`);
        break;
      }
      setLevelPhase(state, "finishLevel");
      break;
    }
    case "finishLevel": {
      // 决定是商人还是下一层
      const transition = nextLevelOrMerchantPhase(state.level);
      if (transition === "merchant" && state.level < state.config.totalLevels) {
        prepareMerchant(state);
        setLevelPhase(state, "merchant");
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
