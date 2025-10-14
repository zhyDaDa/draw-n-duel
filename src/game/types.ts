export type EffectType =
  | 'add'
  | 'multiply'
  | 'set'
  | 'reset'
  | 'extraDraw'
  | 'transfer'
  | 'steal'
  | 'victoryShard'
  | 'levelPass'
  | 'shield'
  | 'duplicate'
  | 'merchantToken'
  | 'wildcard'
  | 'none'

export type TargetType = 'self' | 'opponent' | 'both'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export interface CardEffect {
  type: EffectType
  target?: TargetType
  value?: number
  minValue?: number
  maxValue?: number
  carryOver?: boolean
  notes?: string
}

export interface CardDefinition {
  id: string
  name: string
  description: string
  rarity: Rarity
  levelRange: [number, number]
  baseWeight: number
  maxCopies?: number
  effect: CardEffect
  tags?: string[]
}

export interface CardInstance {
  instanceId: string
  definitionId: string
  name: string
  description: string
  rarity: Rarity
  effect: CardEffect
  tags: string[]
}

export interface DeckState {
  drawPile: CardInstance[]
  discardPile: CardInstance[]
  publicInfo: {
    remainingShards: number
    remainingRare: number
  }
}

export interface PlayerState {
  label: 'Player' | 'AI'
  score: number
  drawsUsed: number
  maxDraws: number
  extraDraws: number
  holdSlot?: CardInstance
  backpack: CardInstance[]
  victoryShards: number
  wins: number
  passTokens: Array<{ level: number; threshold: number }>
  shields: number
  merchantTokens: number
  logPrefix: string
}

export type GamePhase =
  | 'playerTurn'
  | 'aiTurn'
  | 'levelEnd'
  | 'merchant'
  | 'matchEnd'

export interface MerchantOffer {
  card: CardInstance
  costType: 'score' | 'card'
  costValue: number
}

export interface LevelConfig {
  level: number
  name: string
  baseMaxDraws: number
  extraDrawProbability: number
  rareBonusWeight: number
  specialInjections: string[]
}

export interface MatchConfig {
  totalLevels: number
  shardsToWin: number
  baseDrawMin: number
  baseDrawMax: number
}

export interface GameState {
  phase: GamePhase
  level: number
  config: MatchConfig
  deck: DeckState
  player: PlayerState
  ai: PlayerState
  activeCard?: CardInstance
  merchantOffers: MerchantOffer[]
  log: string[]
  winner?: 'Player' | 'AI'
  subPhase?: 'awaitAction' | 'awaitHoldChoice' | 'awaitMerchantSelection'
  rngSeed: number
}

export interface DrawResult {
  state: GameState
  drawnCard: CardInstance | null
}

export interface ResolveResult {
  state: GameState
  appliedCard?: CardInstance
  messages: string[]
}

export type ActionResult = ResolveResult

export interface AIOptions {
  riskTolerance: number
  preferShards: boolean
}

export interface AIContext {
  state: GameState
  options: AIOptions
}

export type EngineError = {
  type: 'invalidPhase' | 'emptyDeck' | 'noHoldCard' | 'maxDrawsReached' | 'merchantUnavailable'
  message: string
}

export type EngineOutcome<T> = T | EngineError

export const VICTORY_SHARDS_TO_WIN = 3
export const BASE_MATCH_CONFIG: MatchConfig = {
  totalLevels: 5,
  shardsToWin: VICTORY_SHARDS_TO_WIN,
  baseDrawMin: 3,
  baseDrawMax: 5,
}

export const DEFAULT_MAX_DRAWS = 3

export const PLAYER_LABEL: PlayerState['label'] = 'Player'
export const AI_LABEL: PlayerState['label'] = 'AI'
