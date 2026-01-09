import { deepCopy } from "../utils";

export type CardColor = "black" | "blue" | "red" | "golden" | "colorless";

export type EffectType =
  | "math"
  | "mathBuff"
  | "set"
  | "reset"
  | "extraDraw"
  | "transfer"
  | "steal"
  | "V-shard"
  | "levelPass"
  | "shield"
  | "duplicate"
  | "merchantToken"
  | "wildcard"
  | "script"
  | "interactive"
  | "none";

export type TargetType = "self" | "opponent" | "both";

export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "mythic";

/**
 * 游戏情境状态的统一封装类
 *
 * 通过 getter 属性提供便捷访问,确保所有引用指向同一个 GameState 对象
 * 支持深拷贝,拷贝后的对象内部引用保持一致性
 */
export class SituationState {
  private _gameState: GameState;
  private _currentPlayerIndex: number;
  private _currentCardInstanceId?: number;
  /** 直接缓存的卡牌引用,用于 onCreate 等场景 */
  private _currentCardRef?: CardInstance;

  constructor(params: {
    gameState: GameState;
    currentPlayerIndex?: number;
    currentCard?: CardInstance;
  }) {
    this._gameState = params.gameState;
    this._currentPlayerIndex =
      params.currentPlayerIndex ?? params.gameState.currentPlayerIndex;
    if (params.currentCard) {
      this._currentCardInstanceId = params.currentCard.instanceId;
      this._currentCardRef = params.currentCard; // 直接缓存引用
    }
  }

  /** 获取完整游戏状态 */
  get G_state(): GameState {
    return this._gameState;
  }

  set G_state(newState: GameState) {
    this._gameState = newState;
  }

  /** 获取当前行动玩家 */
  get P_state(): PlayerState {
    return this._gameState.players[this._currentPlayerIndex];
  }

  /** 获取对手玩家 (单人对战场景) */
  get OP_state(): PlayerState | undefined {
    const opponentIndex =
      (this._currentPlayerIndex + 1) % this._gameState.players.length;
    return this._gameState.players[opponentIndex];
  }

  /** 获取当前关注的卡牌 */
  get C_current(): CardInstance | undefined {
    // 如果有直接缓存的引用,优先返回
    if (this._currentCardRef) {
      return this._currentCardRef;
    }

    // 否则通过 instanceId 在游戏状态中查找
    if (!this._currentCardInstanceId) return undefined;

    // 在各个卡牌集合中查找
    for (const player of this._gameState.players) {
      const found =
        player.drawnCards.find(
          (c) => c.instanceId === this._currentCardInstanceId
        ) ||
        player.handCards.find(
          (c) => c.instanceId === this._currentCardInstanceId
        ) ||
        player.stashedCards.find(
          (c) => c.instanceId === this._currentCardInstanceId
        );
      if (found) return found;
    }

    if (
      this._gameState.activeCard?.instanceId === this._currentCardInstanceId
    ) {
      return this._gameState.activeCard;
    }

    return undefined;
  }

  /** 设置当前关注的卡牌 */
  setCard(card: CardInstance | undefined): void {
    this._currentCardInstanceId = card?.instanceId;
    this._currentCardRef = card; // 同时更新缓存引用
  }

  /** 设置当前行动玩家 */
  setCurrentPlayerIndex(index: number): void {
    if (index >= 0 && index < this._gameState.players.length) {
      this._currentPlayerIndex = index;
    }
  }

  /** 深拷贝情境状态 */
  clone(): SituationState {
    const clonedGameState = cloneGameState(this._gameState);
    const clonedCard = this.C_current
      ? clonedGameState.players
          .flatMap((p) => [...p.drawnCards, ...p.handCards, ...p.stashedCards])
          .find((c) => c.instanceId === this._currentCardInstanceId) ||
        clonedGameState.activeCard
      : undefined;

    return new SituationState({
      gameState: clonedGameState,
      currentPlayerIndex: this._currentPlayerIndex,
      currentCard: clonedCard,
    });
  }

  /** 创建新的情境状态,指向相同的 GameState 但使用不同的玩家/卡牌视角 */
  withContext(params: {
    playerIndex?: number;
    card?: CardInstance;
  }): SituationState {
    return new SituationState({
      gameState: this._gameState,
      currentPlayerIndex: params.playerIndex ?? this._currentPlayerIndex,
      currentCard: params.card,
    });
  }
}

/**
 * 卡牌创建时的特殊状态
 * 此时卡牌还未加入游戏状态,直接传递卡牌引用
 */
export interface CardCreationState {
  readonly G_state: GameState;
  readonly P_state?: PlayerState;
  readonly OP_state?: PlayerState;
  /** 直接传递的卡牌引用,而非通过 ID 查找 */
  readonly card: CardInstance;
}

/**
 * 确保 C_current 存在的 SituationState
 * 用于卡牌效果函数,保证能访问当前卡牌
 */
export interface CardSituationState extends SituationState {
  readonly C_current: CardInstance;
}

/**
 * 确保 C_current 存在的 SituationState(用于 Buff 效果)
 */
export interface BuffSituationState extends SituationState {
  readonly C_current: CardInstance;
}

// ==================== Deep Clone Utilities ====================
// 这些工具函数用于深拷贝游戏状态和卡牌数据
//
// 关键原则：
// 1. 函数类型字段（如 onCreate, onDraw, SituationFunction 等）保持引用，不拷贝
// 2. 数据类型字段（数组、对象、基本类型）进行深拷贝
// 3. 递归处理嵌套结构，确保所有可变数据都是独立的
//
// 公共 API (可导出使用):
// - cloneEffectValue: 拷贝单个效果值
// - cloneCardEffect: 拷贝卡牌效果
// - cloneCardInstance: 拷贝卡牌实例（保持 instanceId）
// - cloneGameState: 拷贝完整游戏状态
// - cloneSituationState: 拷贝情境状态
//
// 使用示例：
// ```typescript
// // 在卡牌效果中创建状态副本
// const stateCopy = cloneSituationState(state);
// stateCopy.P_state.score += 10; // 不会影响原状态
//
// // 在 AI 模拟中使用
// const simulatedState = cloneGameState(currentState);
// simulateMove(simulatedState); // 不会影响实际游戏状态
// ```

/**
 * 深拷贝 EffectValue
 * - 拷贝 type 数组和 sources 数组，避免共享引用
 */
export const cloneEffectValue = (value: EffectValue): EffectValue => ({
  ...value,
  type: [...value.type],
  sources: value.sources ? [...value.sources] : undefined,
});

/**
 * 深拷贝 CardEffect
 * - 递归拷贝 valueDict 中的所有 EffectValue
 * - 保持函数引用：onCreate, onDisplay, onDraw, onPlay, onDiscard, onStash, interactionAPI
 */
export const cloneCardEffect = (effect: CardEffect): CardEffect => ({
  ...effect,
  valueDict: Object.fromEntries(
    Object.entries(effect.valueDict ?? {}).map(([key, val]) => [
      key,
      cloneEffectValue(val),
    ])
  ),
});

/**
 * 深拷贝 CardInstance
 * - 深拷贝 C_effect (包括 valueDict)
 * - 拷贝数组：C_keywords, C_levelRange
 * - 拷贝对象：C_restriction, C_interactionTemplate
 * - 注意：instanceId 保持不变，如需新 ID 请使用 cards.ts 中的 cloneCardInstance
 */
export const cloneCardInstance = (card: CardInstance): CardInstance => ({
  ...card,
  C_effect: cloneCardEffect(card.C_effect),
  C_keywords: card.C_keywords ? [...card.C_keywords] : undefined,
  C_levelRange: [...card.C_levelRange] as [number, number],
  C_restriction: card.C_restriction ? { ...card.C_restriction } : undefined,
  C_interactionTemplate: card.C_interactionTemplate
    ? cloneInteractionTemplate(card.C_interactionTemplate)
    : undefined,
});

/**
 * 深拷贝 InteractionOption
 * - 处理单个或数组形式的 effect
 */
const cloneInteractionOption = (
  option: InteractionOption
): InteractionOption => ({
  ...option,
  effect: option.effect
    ? Array.isArray(option.effect)
      ? option.effect.map(cloneCardEffect)
      : cloneCardEffect(option.effect)
    : undefined,
});

/**
 * 深拷贝 InteractionTemplate
 * - 拷贝所有 options 数组
 */
const cloneInteractionTemplate = (
  template: InteractionTemplate
): InteractionTemplate => ({
  ...template,
  options: template.options.map(cloneInteractionOption),
});

/**
 * 深拷贝 InteractionRequest
 * - 继承 InteractionTemplate 的拷贝
 * - 深拷贝 sourceCard
 */
const cloneInteractionRequest = (
  request: InteractionRequest
): InteractionRequest => ({
  ...cloneInteractionTemplate(request),
  id: request.id,
  ownerIndex: request.ownerIndex,
  sourceCard: cloneCardInstance(request.sourceCard),
  createdAt: request.createdAt,
  autoResolveForAI: request.autoResolveForAI,
  resumeFromSubPhase: request.resumeFromSubPhase,
  sourceContext: request.sourceContext,
  isSkippable: request.isSkippable,
});

/**
 * 深拷贝 DeckState
 * - 深拷贝 drawPile 和 discardPile 中的所有卡牌
 * - 拷贝 publicInfo 对象
 */
const cloneDeckState = (deck: DeckState): DeckState => ({
  originalDeckSize: deck.originalDeckSize,
  drawPile: deck.drawPile.map(cloneCardInstance),
  discardPile: deck.discardPile.map(cloneCardInstance),
  publicInfo: { ...deck.publicInfo },
});

/**
 * 深拷贝 PlayerState
 * - 深拷贝所有卡牌相关字段：targetCard, handCards, drawnCards, stashedCards
 * - 拷贝 victoryShards 对象和 passTokens 数组
 * - 深拷贝所有 buffs
 */
const clonePlayerState = (player: PlayerState): PlayerState => ({
  ...player,
  targetCard: player.targetCard ? cloneCardInstance(player.targetCard) : null,
  handCards: player.handCards.map(cloneCardInstance),
  drawnCards: player.drawnCards.map(cloneCardInstance),
  stashedCards: player.stashedCards.map(cloneCardInstance),
  victoryShards: { ...player.victoryShards },
  passTokens: player.passTokens.map((token) => ({ ...token })),
  buffs: player.buffs.map((buff) => buff.clone()),
});

/**
 * 深拷贝 MerchantOffer
 * - 深拷贝内部的 buff
 */
const cloneMerchantOffer = (offer: MerchantOffer): MerchantOffer => ({
  cost: offer.cost,
  buff: offer.buff.clone(),
});

/**
 * 深拷贝 GameState
 * - 完整拷贝整个游戏状态
 * - 深拷贝 deck, players, activeCard, merchantOffers, pendingInteraction
 * - 拷贝 config 和 log 数组
 * - 用于状态快照、回滚、AI 模拟等场景
 */
export const cloneGameState = (state: GameState): GameState => ({
  ...state,
  config: { ...state.config },
  deck: cloneDeckState(state.deck),
  players: state.players.map(clonePlayerState),
  activeCard: state.activeCard
    ? cloneCardInstance(state.activeCard)
    : undefined,
  merchantOffers: state.merchantOffers.map(cloneMerchantOffer),
  log: [...state.log],
  pendingInteraction: state.pendingInteraction
    ? cloneInteractionRequest(state.pendingInteraction)
    : null,
});

/**
 * 深拷贝 SituationState
 * - 完整拷贝情境状态（包含游戏状态和玩家状态）
 * - 使用 SituationState 类的 clone() 方法
 * - 用于在卡牌效果中创建独立的状态副本，避免意外修改原状态
 */
export const cloneSituationState = (state: SituationState): SituationState => {
  // 如果传入的不是实例只是对象，则先构造实例
  if (!(state instanceof SituationState)) {
    return new SituationState(state);
  } else return state.clone();
};

export type SituationFunction<R = void> = (state: SituationState) => R;
export type CardSituationFunction<R = void> = (state: CardSituationState) => R;

export type CardHandler<R = void> = (card: CardInstance) => R;

// effect中用到的数值, 因为可能收到各种影响, 所以用一个字典来存储原本的数值和各种修改后的数值, 以及修改的来源
export type EffectValue = {
  type: string[];
  base: number;
  modified?: number;
  sources?: string[];
};

export interface CardEffect {
  type: EffectType;
  target?: TargetType;
  valueDict: Record<string, EffectValue>;
  notes?: (state: CardSituationState) => string;
  /** onCreate 特殊:直接传递卡牌引用,不通过游戏状态查找 */
  onCreate?: (state: CardCreationState) => void;
  onDisplay?: (state: CardSituationState) => void;
  onDraw?: (state: CardSituationState) => void;
  onPlay?: (state: CardSituationState) => void;
  onDiscard?: (state: CardSituationState) => void;
  onStash?: (state: CardSituationState) => void;
  interactionAPI?: any;
}

export interface CardLogicConfig {
  checkHistory?: boolean;
  checkHand?: boolean;
  miniGame?: "dice" | "coin" | "sprint";
  requiresCollection?: string;
  disableAIInteraction?: boolean;
}

export class CardDefinition {
  C_id: string;
  C_name: string;
  C_description?: string;
  C_keywords?: string[];
  C_rarity: Rarity;
  C_color?: CardColor;
  C_levelRange: [number, number];
  C_baseWeight: number;
  C_effect: CardEffect;
  C_restriction?: CardLogicConfig;
  C_interactionTemplate?: InteractionTemplate;

  constructor(params: {
    C_id: string;
    C_name: string;
    C_description?: string;
    C_keywords?: string[];
    C_rarity: Rarity;
    C_color?: CardColor;
    C_levelRange?: [number, number];
    C_baseWeight?: number;
    C_effect: CardEffect;
    C_restriction?: CardLogicConfig;
    C_interactionTemplate?: InteractionTemplate;
  }) {
    this.C_id = params.C_id;
    this.C_name = params.C_name;
    this.C_description = params.C_description;
    this.C_keywords = params.C_keywords;
    this.C_rarity = params.C_rarity;
    this.C_color = params.C_color;
    this.C_levelRange = params.C_levelRange ?? [1, Infinity];
    this.C_baseWeight = params.C_baseWeight ?? 1;
    this.C_effect = params.C_effect;
    this.C_restriction = params.C_restriction;
    this.C_interactionTemplate = params.C_interactionTemplate;
  }

  private resolve<T>(val: SituationFunction<T>, state?: SituationState): T {
    return typeof val === "function"
      ? (val as (s: SituationState) => T)(state as SituationState)
      : (val as T);
  }

  // 获取在特定情形下的名称文本（如果是函数则执行）
  getName(state?: SituationState): string {
    return this.resolve(() => this.C_name, state);
  }

  // 获取在特定情形下的描述文本（如果是函数则执行）
  getDescription(state?: SituationState): string {
    if (!this.C_description) return "";
    return this.resolve(() => this.C_description, state) || "无描述";
  }

  // 快速创建一个 CardInstance（会把定义 id 写入 definitionId，并分配 instanceId）
  createInstance(instanceId: number): CardInstance {
    // 把定义的字段拷贝为一个 plain 对象，移除 C_id 并添加实例相关字段
    const { C_id, ...rest } = this as unknown as Record<string, unknown>;

    return {
      ...(rest as Omit<CardDefinition, "C_id">),
      instanceId,
      definitionId: this.C_id,
    } as CardInstance;
  }

  // 可以用来克隆（浅拷贝）定义
  clone(
    overrides?: Partial<Omit<CardDefinition, "C_id"> & { C_id?: string }>
  ): CardDefinition {
    return new CardDefinition({
      C_id: overrides?.C_id ?? this.C_id,
      C_name: (overrides && (overrides as any).C_name) ?? this.C_name,
      C_description:
        (overrides && (overrides as any).C_description) ?? this.C_description,
      C_keywords: overrides?.C_keywords ?? this.C_keywords,
      C_rarity: (overrides && (overrides as any).C_rarity) ?? this.C_rarity,
      C_color: overrides?.C_color ?? this.C_color,
      C_levelRange: overrides?.C_levelRange ?? this.C_levelRange,
      C_baseWeight: overrides?.C_baseWeight ?? this.C_baseWeight,
      C_effect: (overrides && (overrides as any).C_effect) ?? this.C_effect,
      C_restriction: overrides?.C_restriction ?? this.C_restriction,
      C_interactionTemplate:
        overrides?.C_interactionTemplate ?? this.C_interactionTemplate,
    });
  }
}

export interface CardPayload {
  C_id: string;
  C_name: string;
  C_description?: string;
  C_keywords?: string[];
  C_rarity: Rarity;
  C_color?: CardColor;
  C_levelRange?: [number, number];
  C_baseWeight?: number;
  C_effect: CardEffect;
  C_restriction?: CardLogicConfig;
  C_interactionTemplate?: InteractionTemplate;
}

export const createCard = (def: CardPayload): CardDefinition =>
  new CardDefinition({
    C_id: def.C_id,
    C_name: def.C_name,
    C_description: def.C_description,
    C_keywords: def.C_keywords,
    C_rarity: def.C_rarity,
    C_color: def.C_color,
    C_levelRange: def.C_levelRange ?? [1, Infinity],
    C_baseWeight: def.C_baseWeight ?? 1,
    C_effect: def.C_effect,
    C_restriction: def.C_restriction,
    C_interactionTemplate: def.C_interactionTemplate,
  });

export type CardInstance = Omit<CardDefinition, "C_id"> & {
  instanceId: number;
  definitionId: CardDefinition["C_id"];
};

export interface DeckState {
  originalDeckSize: number;
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  publicInfo: {
    remainingShards: number;
    remainingRare: number;
  };
}
export const BlankDeckState = {
  originalDeckSize: 0,
  drawPile: [],
  discardPile: [],
  publicInfo: {
    remainingRare: 0,
    remainingShards: 0,
  },
} as DeckState;

/**
 * 玩家在游戏中的完整运行时状态。
 *
 * 包含游戏引擎用于跟踪玩家身份、资源、卡牌集合、状态效果以及其他每回合或每场比赛元数据的持久性和瞬时字段。
 */
export interface PlayerState {
  /** 玩家的可读名称或标识符 */
  label: string;
  /** 玩家当前累积的分数 */
  score: number;
  /** 玩家本回合已使用的抽牌次数 */
  drawsUsed: number;
  /** 玩家每回合基础抽牌次数（buff修改前） */
  baseDraws: number;
  /** 当前回合由效果、物品或能力额外授予的抽牌次数 */
  extraDraws: number;
  /** 当前最大手牌大小（卡槽上限） */
  handSize: number; // 当前手牌上限
  /** 玩家本回合当前聚焦或正在使用的卡牌实例；无则为 null（当前关注的卡牌） */
  targetCard: CardInstance | null; // 当前关注的卡牌(当前回合正在使用的卡牌)
  /** 玩家手牌中滞留过一回合以上可以使用的卡牌 */
  handCards: CardInstance[]; // 手牌(已经过了回合, 可以使用的滞留卡牌)
  /** 刚抽到的等待选择的卡牌 */
  drawnCards: CardInstance[]; // 刚抽到的若干等待选择的卡牌
  /** 滞留且当前回合不可用 */
  stashedCards: CardInstance[]; // 存放的卡牌(滞留卡牌, 当前回合不可用)
  /** 本轮使用过的牌 */
  usedCards: CardInstance[];
  /** 胜利碎片 */
  victoryShards: Record<string, number>;
  /** 玩家在当前会话中赢得的回合或比赛次数 */
  wins: number;
  /** @deprecated 传递令牌对象数组，表示剩余传递和阈值；每个令牌有等级和阈值 */
  passTokens: Array<{ level: number; threshold: number }>;
  /** @deprecated 当前护盾/防御值，用于减轻传入伤害或效果 */
  shields: number;
  /** @deprecated 用于回合间商人/互动的货币或令牌计数 */
  merchantTokens: number;
  /** 为该玩家记录动作或事件时使用的简短前缀字符串 */
  logPrefix: string;
  /** 影响行为或统计的活跃临时或永久玩家增益/效果 */
  buffs: BuffDefinition[];
  /** 可选标志，表示该玩家是否由 AI 控制 */
  isAI?: boolean;
}

// 顶层阶段（Level Phase）
// levelStart -> playerTurn -> finishRound(levelEnd) -> finishLevel -> merchant/next level -> ... -> matchEnd
export type GamePhase =
  | "matchSetup"
  | "levelStart"
  | "playerTurn"
  | "finishRound" // 等价于 levelEnd：整轮已结束，等待结算
  | "finishLevel" // 层级结算中（可用于异步动画）
  | "merchant"
  | "matchEnd";

export type PlayerBuffCategory =
  | "buff"
  | "debuff"
  | "shield"
  | "math"
  | "extraDraw"
  | "temporary"
  | "permanent"
  | "V-shard"
  | "collection"
  | "token"
  | "statusChange";

export type BuffSituationFunction<R = void> = (
  self: BuffDefinition,
  state: SituationState
) => R;

function* BuffIdGenerator(): Generator<number, number, never> {
  let currentId = 0;
  while (true) {
    yield currentId++;
  }
}

export interface BuffCreatePayLoad {
  B_id?: number;
  B_definitionId: string;
  B_name: BuffSituationFunction<string>;
  B_description: BuffSituationFunction<string>;
  B_icon: string;
  B_isPermanent?: boolean;
  B_category?: PlayerBuffCategory[];
  B_valueDict: Record<string, number>;
  B_maxCount?: number;
  B_maxStacks?: number;
  B_onCreate?: BuffSituationFunction<void>;
  B_onCombine?: (
    state: BuffSituationState,
    self: BuffDefinition,
    target: BuffDefinition
  ) => void;

  B_onTurnStart?: BuffSituationFunction<void>;
  B_onTurnEnd?: BuffSituationFunction<void>;
  B_onAfterDraw?: BuffSituationFunction<void>;
  B_onBeforePlay?: BuffSituationFunction<void>;
  B_onAfterPlay?: BuffSituationFunction<void>;
  B_onBeforeStash?: BuffSituationFunction<void>;
  B_onAfterStash?: BuffSituationFunction<void>;
  count?: number;
  canCombine?: boolean;
}

export class BuffDefinition {
  B_id!: number;
  B_definitionId!: string;
  B_name!: BuffSituationFunction<string>;
  B_description!: BuffSituationFunction<string>;
  B_icon!: string;
  B_isPermanent!: boolean;
  B_category?: PlayerBuffCategory[];
  B_valueDict!: Record<string, number>;
  B_maxCount?: number;
  B_maxStacks?: number;
  B_onCreate?: BuffSituationFunction<void>;
  B_onCombine?: (
    state: BuffSituationState,
    self: BuffDefinition,
    target: BuffDefinition
  ) => void;

  B_onTurnStart?: BuffSituationFunction<void>;
  B_onTurnEnd?: BuffSituationFunction<void>;
  B_onAfterDraw?: BuffSituationFunction<void>;
  B_onBeforePlay?: BuffSituationFunction<void>;
  B_onAfterPlay?: BuffSituationFunction<void>;
  B_onBeforeStash?: BuffSituationFunction<void>;
  B_onAfterStash?: BuffSituationFunction<void>;

  count?: number;
  duration?: number;
  canCombine?: boolean; // 相同buff能否直接叠加

  constructor(params: BuffCreatePayLoad) {
    this.B_id = params.B_id ?? BuffIdGenerator().next().value;
    this.B_definitionId = params.B_definitionId;
    this.B_name = params.B_name;
    this.B_description = params.B_description;
    this.B_icon = params.B_icon;
    this.B_isPermanent = params.B_isPermanent ?? false;
    this.B_category = params.B_category;
    this.B_valueDict = params.B_valueDict;
    this.B_maxCount = params.B_maxCount;
    this.B_maxStacks = params.B_maxStacks;
    this.B_onCreate = params.B_onCreate;
    this.B_onTurnStart = params.B_onTurnStart;
    this.B_onTurnEnd = params.B_onTurnEnd;
    this.B_onAfterDraw = params.B_onAfterDraw;
    this.B_onBeforePlay = params.B_onBeforePlay;
    this.B_onAfterPlay = params.B_onAfterPlay;
    this.B_onBeforeStash = params.B_onBeforeStash;
    this.B_onAfterStash = params.B_onAfterStash;
    this.count = params.count;
    this.canCombine = params.canCombine;
    console.log("###", this);

    // 运行时简单断言，帮助在开发阶段尽早发现缺失的必需字段
    const _required = ["B_definitionId", "B_name", "B_icon", "B_valueDict"];
    for (const k of _required) {
      if ((this as any)[k] === undefined) {
        throw new Error(`BuffDefinition missing required field ${k}`);
      }
    }
  }

  /**
   * 生成运行时的 BuffDefinition 实例（用于放入 GameState.players[].buffs）
   * 接受可选 overrides 用于运行时参数（如 count/duration/id）
   */
  createInstance(
    state: BuffSituationState,
    overrides?: Partial<BuffDefinition> & { id?: number }
  ): BuffDefinition {
    const instance = this.clone();
    instance.B_id = overrides?.id ?? BuffIdGenerator().next().value;
    if (overrides) {
      Object.assign(instance, overrides);
    }
    instance.B_onCreate?.(instance, state); // 调用 onCreate 回调
    return instance;
  }

  clone(): BuffDefinition {
    return new BuffDefinition({
      ...(this as unknown as BuffCreatePayLoad),
      B_category: deepCopy(this.B_category),
      B_valueDict: deepCopy(this.B_valueDict),
    });
  }
}

export const createBuff = (payload: BuffCreatePayLoad) =>
  new BuffDefinition(payload);

export const addBuffToPlayer = (
  state: BuffSituationState,
  player: PlayerState,
  buff: BuffDefinition
) => {
  let flag = true; // 没有同类的标志
  if (buff.canCombine) {
    player.buffs = player.buffs.reduce((pre: BuffDefinition[], cur) => {
      if (cur.B_definitionId != buff.B_definitionId) {
        return [...pre, cur];
      }
      // 如果有同种的buff
      if (typeof cur.B_onCombine === "function") {
        cur.B_onCombine(state, cur, buff);
      } else {
        cur.count = (cur.count ?? 1) + (buff.count ?? 1);
      }
      flag = false;
      return [...pre, cur];
    }, [] as BuffDefinition[]);
  }
  if (flag) player.buffs.push(buff);
};

export interface MerchantOffer {
  cost: string;
  buff: BuffDefinition;
}

export type InteractionType = "choice" | "payment" | "gamble" | "miniGame";

export type InteractionVisibility = "owner-only" | "public";

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
  costDescription?: string;
  effect?: CardEffect | CardEffect[];
  resultScript?: string;
  intent?: "positive" | "negative" | "neutral";
  aiWeight?: number;
  autoResolve?: boolean;
}

export interface InteractionTemplate {
  type: InteractionType;
  title: string;
  message: string;
  options: InteractionOption[];
  visibility?: InteractionVisibility;
  allowCancel?: boolean;
  timerMs?: number;
}

export interface InteractionRequest extends InteractionTemplate {
  id: string;
  ownerIndex: number;
  sourceCard: CardInstance;
  createdAt: number;
  autoResolveForAI?: boolean;
  resumeFromSubPhase: NonNullable<GameState["subPhase"]>;
  sourceContext?: "active" | "hold" | "script";
  isSkippable?: boolean;
}

export interface LevelConfig {
  level: number;
  name: string;
  baseMaxDraws: number;
  extraDrawProbability: number;
  deckSize: number;
  rareBonusWeight: number;
  specialInjections: string[];
}

export interface MatchConfig {
  totalLevels: number;
  shardsToWin: number;
  baseDrawMin: number;
  baseDrawMax: number;
}

export interface GameState {
  phase: GamePhase;
  level: number;
  config: MatchConfig;
  deck: DeckState;
  players: PlayerState[]; // 多玩家支持
  currentPlayerIndex: number; // 当前行动玩家索引
  activeCard?: CardInstance;
  merchantOffers: MerchantOffer[];
  log: string[];
  winner?: string;
  subPhase?:
    | "turnStart"
    | "checkCanDraw"
    | "prepareDrawingCard"
    | "waitingDrawChoice"
    | "onUseCard"
    | "onStashCard"
    | "preTurnEnd"
    | "turnEnd"
    | "awaitMerchantSelection"
    | "resolvingInteraction";
  rngSeed: number;
  pendingInteraction: InteractionRequest | null;
}

export interface DrawResult {
  state: SituationState;
  drawnCards: CardInstance[];
  messsages: string[];
}

export interface ResolveResult {
  state: SituationState;
  appliedCard?: CardInstance;
  messages: string[];
}

export type ActionResult = ResolveResult;

export interface AIOptions {
  riskTolerance: number;
  preferShards: boolean;
}

export interface AIContext {
  state: GameState;
  options: AIOptions;
}

export type EngineError = {
  type:
    | "invalidPhase"
    | "emptyDeck"
    | "noHoldCard"
    | "maxDrawsReached"
    | "merchantUnavailable"
    | "handSlotsFull";
  message: string;
};

export type EngineOutcome<T> = T | EngineError;

export const VICTORY_SHARDS_TO_WIN = 3;
export const BASE_MATCH_CONFIG: MatchConfig = {
  totalLevels: 5,
  shardsToWin: VICTORY_SHARDS_TO_WIN,
  baseDrawMin: 3,
  baseDrawMax: 5,
};

export const DEFAULT_MAX_DRAWS = 3;

export const PLAYER_LABEL: PlayerState["label"] = "Player";
export const AI_LABEL: PlayerState["label"] = "AI";

export const DEFAULT_HAND_SIZE = 3;
// TODO: remove DEFAULT_MAX_HOLD_SLOTS after all call sites migrate
export const DEFAULT_MAX_HOLD_SLOTS = DEFAULT_HAND_SIZE;
