export type CardColor = "black" | "blue" | "red" | "golden" | "colorless";

export type EffectType =
  | "math"
  | "set"
  | "reset"
  | "extraDraw"
  | "transfer"
  | "steal"
  | "victoryShard"
  | "levelPass"
  | "shield"
  | "duplicate"
  | "merchantToken"
  | "wildcard"
  | "script"
  | "interactive"
  | "none";

export type TargetType = "self" | "opponent" | "both";

export type Rarity =
  | 1
  | 2
  | 3
  | 4
  | 5
  | "common"
  | "uncommon"
  | "rare"
  | "legendary"
  | "mythic";

export interface SituationState {
  G_state: GameState;
  P_state: PlayerState;
  OP_state?: PlayerState;
}
export interface CardSituationState extends SituationState {
  C_current: CardInstance;
}
export interface BuffSituationState extends SituationState {
  B_current: CardInstance;
}

export type SituationFunction<R = void> = R | ((state: SituationState) => R);
export type CardSituationFunction<R = void> =
  | R
  | ((state: CardSituationState) => R);

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
  notes?: string | CardSituationFunction<string>;
  onCreate?: (state: Omit<CardSituationState, "P_state">) => void;
  onDisplay?: CardSituationFunction<void>;
  onDraw?: CardSituationFunction<void>;
  onPlay?: CardSituationFunction<void>;
  onDiscard?: CardSituationFunction<void>;
  onStash?: CardSituationFunction<void>;
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
    return this.resolve(this.C_name, state);
  }

  // 获取在特定情形下的描述文本（如果是函数则执行）
  getDescription(state?: SituationState): string {
    if (!this.C_description) return "";
    return this.resolve(this.C_description, state);
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

export interface PlayerState {
  label: string;
  score: number;
  drawsUsed: number;
  baseDraws: number;
  extraDraws: number;
  handSize: number; // 当前手牌上限
  targetCard: CardInstance | null; // 当前关注的卡牌(当前回合正在使用的卡牌)
  handCards: CardInstance[]; // 手牌(已经过了回合, 可以使用的滞留卡牌)
  drawnCards: CardInstance[]; // 刚抽到的若干等待选择的卡牌
  stashedCards: CardInstance[]; // 存放的卡牌(滞留卡牌, 当前回合不可用)
  victoryShards: Record<string, number>;
  wins: number;
  passTokens: Array<{ level: number; threshold: number }>;
  shields: number;
  merchantTokens: number;
  logPrefix: string;
  buffs: PlayerBuff[];
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
  | "collection"
  | "statusChange";

export interface PlayerBuff {
  id: number;
  name: string | SituationFunction<string>;
  description: string | SituationFunction<string>;
  icon: string;
  isPermanent: boolean;
  duration?: number;
  count?: number;
  category?: PlayerBuffCategory | PlayerBuffCategory[];
  valueDict?: Record<string, number>;
  maxStacks?: number;
  onTurnStart?: SituationFunction<void>;
  onTurnEnd?: SituationFunction<void>;
  onAfterDraw?: SituationFunction<void>;
  onBeforePlay?: SituationFunction<void>;
  onAfterPlay?: SituationFunction<void>;
  onBeforeStash?: SituationFunction<void>;
  onAfterStash?: SituationFunction<void>;
}

export interface MerchantOffer {
  cost: string;
  buff: PlayerBuff;
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
  state: GameState;
  drawnCard: CardInstance | null;
  messsages: string[];
}

export interface ResolveResult {
  state: GameState;
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
