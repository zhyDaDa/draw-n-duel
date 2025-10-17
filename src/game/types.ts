export type EffectType =
  | "add"
  | "multiply"
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
  | "none";

export type TargetType = "self" | "opponent" | "both";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export interface CardEffect {
  type: EffectType;
  target?: TargetType;
  value?: number;
  minValue?: number;
  maxValue?: number;
  carryOver?: boolean;
  notes?: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
  rarity: Rarity;
  levelRange: [number, number];
  baseWeight: number;
  maxCopies?: number;
  effect: CardEffect;
  tags?: string[];
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  name: string;
  description: string;
  keywords: string[];
  rarity: Rarity;
  effect: CardEffect;
  tags: string[];
}

export interface DeckState {
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  publicInfo: {
    remainingShards: number;
    remainingRare: number;
  };
}

export interface PlayerState {
  label: string;
  score: number;
  drawsUsed: number;
  maxDraws: number;
  extraDraws: number;
  holdSlots: CardInstance[];
  backpack: CardInstance[];
  victoryShards: number;
  wins: number;
  passTokens: Array<{ level: number; threshold: number }>;
  shields: number;
  merchantTokens: number;
  logPrefix: string;
  pendingEffects: PendingEffect[];
  buffs: PlayerBuff[];
  isAI?: boolean;
  MAX_HOLD_SLOTS: number;
}

// 顶层阶段（Level Phase）
// levelStart -> playerTurn -> finishRound(levelEnd) -> finishLevel -> merchant/next level -> ... -> matchEnd
export type GamePhase =
  | "levelStart"
  | "playerTurn"
  | "finishRound" // 等价于 levelEnd：整轮已结束，等待结算
  | "finishLevel" // 层级结算中（可用于异步动画）
  | "merchant"
  | "matchEnd";

export type MerchantCostType =
  | "scorePenalty"
  | "nextDrawPenalty"
  | "startScorePenalty";

export interface MerchantCost {
  type: MerchantCostType;
  value: number;
  description: string;
  severity: "mild" | "moderate" | "severe";
}

export interface MerchantOffer {
  card: CardInstance;
  cost: MerchantCost;
}

export type PendingEffect =
  | { type: "nextDrawPenalty"; value: number }
  | { type: "startScorePenalty"; value: number };

export interface PlayerBuff {
  id: string;
  name: string;
  description: string;
  icon: string;
  effect: CardEffect;
  isPermanent: boolean;
  count: number;
  // 新增：阶段触发器
  onTurnStart?: (player: PlayerState, game: GameState) => void;
  onTurnEnd?: (player: PlayerState, game: GameState) => void;
  // 新增：数值修饰器
  valueModifier?: (value: number) => number;
  multiplierModifier?: (multiplier: number) => number;
  // 新增：行动与卡牌回调（可选）
  onBeforeDraw?: (player: PlayerState, game: GameState) => void;
  onAfterDraw?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onBeforePlay?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onAfterPlay?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onBeforeDiscard?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onAfterDiscard?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onBeforeStash?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onAfterStash?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onBeforeRelease?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
  onAfterRelease?: (
    player: PlayerState,
    game: GameState,
    card: CardInstance
  ) => void;
}

export interface LevelConfig {
  level: number;
  name: string;
  baseMaxDraws: number;
  extraDrawProbability: number;
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
    | "awaitHoldChoice"
    | "drawingCard"
    | "awaitAction"
    | "playingCard"
    | "stashingCard"
    | "discardingCard"
    | "turnEnd"
    | "nextPlayerTurnStart"
    | "releaselingHoldCard"
    | "discardingHoldCard"
    | "awaitMerchantSelection";
  rngSeed: number;
}

export interface DrawResult {
  state: GameState;
  drawnCard: CardInstance | null;
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
    | "merchantUnavailable";
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

export const DEFAULT_MAX_HOLD_SLOTS = 2;
