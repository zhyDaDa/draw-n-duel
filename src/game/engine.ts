import { cloneCardInstance, createWeightedCard, getMerchantPool } from './cards'
import { buildDeckForLevel, getLevelConfig, nextLevelOrMerchantPhase } from './levels'
import {
  AI_LABEL,
  BASE_MATCH_CONFIG,
  DEFAULT_MAX_DRAWS,
  PLAYER_LABEL,
  type ActionResult,
  type CardInstance,
  type EngineOutcome,
  type GameState,
  type LevelConfig,
  type MerchantOffer,
  type PlayerState,
  type ResolveResult,
} from './types'

const RNG_MOD = 0x100000000
const RNG_MULT = 1664525
const RNG_INC = 1013904223

const createSeededRng = (seed: number) => {
  let current = seed >>> 0
  return {
    next: (): number => {
      current = (Math.imul(current, RNG_MULT) + RNG_INC) >>> 0
      return current / RNG_MOD
    },
    getSeed: () => current >>> 0,
  }
}

const clonePlayer = (player: PlayerState): PlayerState => ({
  ...player,
  passTokens: player.passTokens.map((token) => ({ ...token })),
  backpack: player.backpack.map((card) => ({ ...card })),
})

const cloneState = (state: GameState): GameState => ({
  ...state,
  player: clonePlayer(state.player),
  ai: clonePlayer(state.ai),
  deck: {
    drawPile: [...state.deck.drawPile],
    discardPile: [...state.deck.discardPile],
    publicInfo: { ...state.deck.publicInfo },
  },
  merchantOffers: state.merchantOffers.map((offer) => ({
    card: { ...offer.card },
    costType: offer.costType,
    costValue: offer.costValue,
  })),
  log: [...state.log],
})

const appendLog = (state: GameState, message: string): void => {
  state.log.push(message)
}

const resetPlayerForLevel = (player: PlayerState, levelConfig: LevelConfig): void => {
  player.score = 1
  player.drawsUsed = 0
  player.extraDraws = 0
  player.maxDraws = levelConfig.baseMaxDraws
}

const consumeCard = (state: GameState): CardInstance | undefined => {
  const card = state.deck.drawPile.shift()
  if (!card) {
    return undefined
  }
  state.deck.publicInfo.remainingRare -= card.rarity === 'rare' || card.rarity === 'legendary' ? 1 : 0
  state.deck.publicInfo.remainingShards -= card.effect.type === 'victoryShard' ? 1 : 0
  return card
}

const ensurePhase = (state: GameState, expected: GameState['phase']): EngineOutcome<void> => {
  if (state.phase !== expected) {
    return {
      type: 'invalidPhase',
      message: `当前阶段为 ${state.phase}，不能执行该操作。`,
    }
  }
  return undefined
}

export const createInitialState = (seed?: number): GameState => {
  const initialSeed = (seed ?? Date.now()) >>> 0
  const rng = createSeededRng(initialSeed)
  const level = 1
  const levelConfig = getLevelConfig(level)
  const deck = buildDeckForLevel(level, () => rng.next())

  const initial: GameState = {
    phase: 'playerTurn',
    level,
    config: BASE_MATCH_CONFIG,
    deck,
    player: {
      label: PLAYER_LABEL,
      score: 1,
      drawsUsed: 0,
      maxDraws: levelConfig.baseMaxDraws,
      extraDraws: 0,
      holdSlot: undefined,
      backpack: [],
      victoryShards: 0,
      wins: 0,
      passTokens: [],
      shields: 0,
      merchantTokens: 0,
      logPrefix: '玩家',
    },
    ai: {
      label: AI_LABEL,
      score: 1,
      drawsUsed: 0,
      maxDraws: levelConfig.baseMaxDraws,
      extraDraws: 0,
      holdSlot: undefined,
      backpack: [],
      victoryShards: 0,
      wins: 0,
      passTokens: [],
      shields: 0,
      merchantTokens: 0,
      logPrefix: 'AI',
    },
    activeCard: undefined,
    merchantOffers: [],
    log: [
      '对决开始！欢迎来到层级 1 —— Entrance Trial。抽卡准备！',
    ],
    rngSeed: rng.getSeed(),
  }

  return initial
}

const maxDrawsFor = (player: PlayerState): number => player.maxDraws + player.extraDraws

const applyExtraDrawNotes = (player: PlayerState, notes?: string): string | null => {
  if (!notes) return null
  if (notes.startsWith('gain-extra-draw-')) {
    const value = Number.parseInt(notes.replace('gain-extra-draw-', ''), 10)
    if (Number.isFinite(value)) {
      player.extraDraws += value
      return `${player.logPrefix} 获得了额外的抽牌次数 +${value}。`
    }
  }
  return null
}

const applyNegativeWithShield = (target: PlayerState, apply: () => void): string | null => {
  if (target.shields > 0) {
    target.shields -= 1
    return `${target.logPrefix} 消耗护盾抵挡了负面效果！`
  }
  apply()
  return null
}

const applyCardTo = (
  state: GameState,
  actor: PlayerState,
  opponent: PlayerState,
  card: CardInstance,
): string[] => {
  const messages: string[] = []
  switch (card.effect.type) {
    case 'add': {
      const value = card.effect.value ?? 0
      actor.score += value
      messages.push(`${actor.logPrefix} 使用 ${card.name}，分数 +${value} → ${actor.score}`)
      break
    }
    case 'multiply': {
      const value = card.effect.value ?? 1
      actor.score *= value
      messages.push(`${actor.logPrefix} 的分数乘以 ${value} → ${actor.score}`)
      break
    }
    case 'set': {
      const value = card.effect.value ?? actor.score
      actor.score = value
      messages.push(`${actor.logPrefix} 的分数直接被设置为 ${value}`)
      break
    }
    case 'reset': {
      const value = card.effect.value ?? 1
      actor.score = value
      messages.push(`${actor.logPrefix} 归零重置，当前分数 ${value}`)
      break
    }
    case 'extraDraw': {
      const value = card.effect.value ?? 1
      actor.extraDraws += value
      messages.push(`${actor.logPrefix} 获得额外抽牌 ${value} 次`)
      break
    }
    case 'transfer': {
      const value = card.effect.value ?? 0
      const feedback = applyNegativeWithShield(opponent, () => {
        opponent.score = Math.max(1, opponent.score - value)
      })
      if (feedback) {
        messages.push(feedback)
      } else {
        messages.push(`${actor.logPrefix} 让对手失去 ${value} 分 → ${opponent.score}`)
      }
      break
    }
    case 'steal': {
      const value = card.effect.value ?? 0
      const feedback = applyNegativeWithShield(opponent, () => {
        opponent.score = Math.max(1, opponent.score - value)
        actor.score += value
      })
      if (feedback) {
        messages.push(feedback)
      } else {
        messages.push(`${actor.logPrefix} 窃取 ${value} 分 → ${actor.score}`)
      }
      break
    }
    case 'victoryShard': {
      const value = card.effect.value ?? 1
      actor.victoryShards += value
      messages.push(`${actor.logPrefix} 收集到胜利碎片（${actor.victoryShards}）`)
      break
    }
    case 'levelPass': {
      const threshold = card.effect.value ?? 50
      actor.passTokens.push({ level: state.level, threshold })
      messages.push(`${actor.logPrefix} 获得层级通行证（保底 ${threshold} 分）`)
      break
    }
    case 'shield': {
      const value = card.effect.value ?? 1
      actor.shields += value
      messages.push(`${actor.logPrefix} 获得护盾 x${value}`)
      break
    }
    case 'duplicate': {
      if (actor.holdSlot) {
        const clone = cloneCardInstance(actor.holdSlot)
        messages.push(`${actor.logPrefix} 复制滞留卡 ${actor.holdSlot.name}`)
        const childMessages = applyCardTo(state, actor, opponent, clone)
        messages.push(...childMessages)
      } else {
        messages.push(`${actor.logPrefix} 尝试复制滞留卡，但槽位为空。`)
      }
      break
    }
    case 'merchantToken': {
      actor.merchantTokens += card.effect.value ?? 1
      messages.push(`${actor.logPrefix} 获得旅行商人优惠券！`)
      break
    }
    case 'wildcard': {
      if (actor.score < opponent.score) {
        const swap = actor.score
        actor.score = opponent.score
        opponent.score = swap
        messages.push(`${actor.logPrefix} 触发百变替换，分数对调！`)
      } else {
        messages.push(`${actor.logPrefix} 试图使用百变替换，但自己领先，效果落空。`)
      }
      break
    }
    case 'none':
    default:
      messages.push(`${card.name} 暂未定义明确效果。`)
  }

  const extraMessage = applyExtraDrawNotes(actor, card.effect.notes)
  if (extraMessage) {
    messages.push(extraMessage)
  }

  return messages
}

const addCardToDiscard = (state: GameState, card: CardInstance): void => {
  state.deck.discardPile.push(card)
}

export const drawCard = (sourceState: GameState): EngineOutcome<ResolveResult> => {
  const validation = ensurePhase(sourceState, 'playerTurn')
  if (validation) return validation

  if (sourceState.activeCard) {
    return {
      type: 'invalidPhase',
      message: '当前还有待处理的卡牌，请先处理后再抽。',
    }
  }

  const state = cloneState(sourceState)
  const player = state.player
  const allowed = maxDrawsFor(player)
  if (player.drawsUsed >= allowed) {
    return {
      type: 'maxDrawsReached',
      message: `已达到本层最大抽牌次数（${allowed}）。`,
    }
  }
  if (state.deck.drawPile.length === 0) {
    return {
      type: 'emptyDeck',
      message: '卡堆已经被抽空。',
    }
  }

  const card = consumeCard(state)
  if (!card) {
    return {
      type: 'emptyDeck',
      message: '卡堆已经被抽空。',
    }
  }

  player.drawsUsed += 1
  state.activeCard = card
  appendLog(state, `玩家抽到了 ${card.name}`)

  return {
    state,
    appliedCard: card,
    messages: [`抽到 ${card.name}`],
  }
}

export const playActiveCard = (sourceState: GameState): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, 'playerTurn')
  if (validation) return validation
  if (!sourceState.activeCard) {
    return {
      type: 'invalidPhase',
      message: '当前没有待结算的卡牌。',
    }
  }
  const state = cloneState(sourceState)
  const card = state.activeCard
  if (!card) {
    return {
      type: 'invalidPhase',
      message: '当前没有待结算的卡牌。',
    }
  }

  const messages = applyCardTo(state, state.player, state.ai, card)
  addCardToDiscard(state, card)
  state.activeCard = undefined
  messages.forEach((message) => appendLog(state, message))

  return {
    state,
    appliedCard: card,
    messages,
  }
}

export const stashActiveCard = (sourceState: GameState): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, 'playerTurn')
  if (validation) return validation
  if (!sourceState.activeCard) {
    return {
      type: 'invalidPhase',
      message: '没有可滞留的卡牌。',
    }
  }
  if (sourceState.player.holdSlot) {
    return {
      type: 'invalidPhase',
      message: '滞留位已被占用。',
    }
  }

  const state = cloneState(sourceState)
  const activeCard = state.activeCard!
  state.player.holdSlot = activeCard
  appendLog(state, `玩家将 ${activeCard.name} 放入滞留位。`)
  state.activeCard = undefined

  return {
    state,
    messages: ['卡牌已放入滞留位。'],
  }
}

export const discardActiveCard = (sourceState: GameState): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, 'playerTurn')
  if (validation) return validation
  if (!sourceState.activeCard) {
    return {
      type: 'invalidPhase',
      message: '没有可以丢弃的卡牌。',
    }
  }

  const state = cloneState(sourceState)
  const activeCard = state.activeCard!
  addCardToDiscard(state, activeCard)
  appendLog(state, `玩家丢弃了 ${activeCard.name}`)
  state.activeCard = undefined

  return {
    state,
    messages: ['卡牌已丢弃。'],
  }
}

export const releaseHoldCard = (sourceState: GameState): EngineOutcome<ActionResult> => {
  const validation = ensurePhase(sourceState, 'playerTurn')
  if (validation) return validation
  if (!sourceState.player.holdSlot) {
    return {
      type: 'noHoldCard',
      message: '滞留位为空。',
    }
  }
  if (sourceState.activeCard) {
    return {
      type: 'invalidPhase',
      message: '先处理当前抽到的卡牌，再释放滞留卡。',
    }
  }

  const state = cloneState(sourceState)
  const holdCard = state.player.holdSlot!
  state.player.holdSlot = undefined
  const messages = applyCardTo(state, state.player, state.ai, holdCard)
  addCardToDiscard(state, holdCard)
  messages.forEach((message) => appendLog(state, message))

  return {
    state,
    appliedCard: holdCard,
    messages,
  }
}

const resolvePassTokens = (state: GameState, actor: PlayerState): string[] => {
  const messages: string[] = []
  actor.passTokens = actor.passTokens.filter((token) => {
    if (token.level === state.level) {
      const minScore = token.threshold
      if (actor.score < minScore) {
        actor.score = minScore
        messages.push(`${actor.logPrefix} 的层级通行证生效，分数提升至 ${minScore}`)
      }
      return false
    }
    return true
  })
  return messages
}

const checkShardVictory = (state: GameState): 'Player' | 'AI' | undefined => {
  if (state.player.victoryShards >= state.config.shardsToWin) return 'Player'
  if (state.ai.victoryShards >= state.config.shardsToWin) return 'AI'
  return undefined
}

const applyLevelEnd = (state: GameState): void => {
  const playerMessages = resolvePassTokens(state, state.player)
  const aiMessages = resolvePassTokens(state, state.ai)
  playerMessages.concat(aiMessages).forEach((message) => appendLog(state, message))

  const playerScore = state.player.score
  const aiScore = state.ai.score

  if (playerScore > aiScore) {
    state.player.wins += 1
    appendLog(state, `玩家以 ${playerScore} : ${aiScore} 赢下本层！`)
  } else if (aiScore > playerScore) {
    state.ai.wins += 1
    appendLog(state, `AI 以 ${aiScore} : ${playerScore} 赢下本层。`)
  } else {
    appendLog(state, `双方战平 ${playerScore} : ${aiScore}，视为平局不计胜场。`)
  }

  const shardWinner = checkShardVictory(state)
  const bestOfFiveWinner = state.player.wins >= 3 ? 'Player' : state.ai.wins >= 3 ? 'AI' : undefined

  state.winner = shardWinner ?? bestOfFiveWinner
}

const prepareNextLevel = (state: GameState): void => {
  state.level += 1
  if (state.level > state.config.totalLevels) {
    state.phase = 'matchEnd'
    return
  }

  const rng = createSeededRng(state.rngSeed)
  const deck = buildDeckForLevel(state.level, () => rng.next())
  state.rngSeed = rng.getSeed()
  state.deck = deck

  const levelConfig = getLevelConfig(state.level)
  resetPlayerForLevel(state.player, levelConfig)
  resetPlayerForLevel(state.ai, levelConfig)

  state.activeCard = undefined
  appendLog(state, `进入层级 ${state.level} —— ${levelConfig.name}`)
}

const simulateAiTurn = (state: GameState): void => {
  const ai = state.ai
  const player = state.player
  const allowed = maxDrawsFor(ai)
  const rng = createSeededRng(state.rngSeed)

  const shouldDraw = (): boolean => {
    if (ai.drawsUsed >= allowed) return false
    if (state.deck.drawPile.length === 0) return false
    if (ai.score >= player.score && ai.drawsUsed >= DEFAULT_MAX_DRAWS) {
      return rng.next() < 0.35
    }
    return true
  }

  while (shouldDraw()) {
    const card = consumeCard(state)
    if (!card) break
    ai.drawsUsed += 1
    appendLog(state, `AI 抽到了 ${card.name}`)

    const decision = decideAiAction(card, ai, player)
    if (decision === 'hold' && !ai.holdSlot) {
      ai.holdSlot = card
      appendLog(state, 'AI 将卡牌置入滞留位。')
      continue
    }
    const messages = applyCardTo(state, ai, player, card)
    addCardToDiscard(state, card)
    messages.forEach((message) => appendLog(state, message))
  }

  if (ai.holdSlot && ai.score < player.score) {
    const holdCard = ai.holdSlot
    ai.holdSlot = undefined
    const messages = applyCardTo(state, ai, player, holdCard)
    addCardToDiscard(state, holdCard)
    messages.forEach((message) => appendLog(state, message))
  }

  state.rngSeed = rng.getSeed()
}

const decideAiAction = (card: CardInstance, ai: PlayerState, player: PlayerState): 'play' | 'hold' => {
  switch (card.effect.type) {
    case 'victoryShard':
    case 'levelPass':
    case 'shield':
    case 'extraDraw':
      return 'play'
    case 'multiply':
      if (ai.holdSlot) return 'play'
      if (ai.score < player.score) return 'play'
      return 'hold'
    case 'add':
      return 'play'
    case 'reset':
      return ai.score < player.score * 0.6 ? 'play' : 'hold'
    case 'transfer':
    case 'steal':
      return 'play'
    case 'duplicate':
      return ai.holdSlot ? 'play' : 'hold'
    case 'wildcard':
      return ai.score < player.score ? 'play' : 'hold'
    default:
      return 'play'
  }
}

export const finishPlayerTurn = (sourceState: GameState): GameState => {
  if (sourceState.phase !== 'playerTurn') {
    return sourceState
  }
  if (sourceState.activeCard) {
    return sourceState
  }

  const state = cloneState(sourceState)
  state.phase = 'aiTurn'
  appendLog(state, '玩家结束回合，轮到 AI。')

  simulateAiTurn(state)

  state.phase = 'levelEnd'
  applyLevelEnd(state)

  if (state.winner) {
    state.phase = 'matchEnd'
    appendLog(state, `比赛结束，${state.winner === 'Player' ? '玩家' : 'AI'} 获胜！`)
    return state
  }

  const transition = nextLevelOrMerchantPhase(state.level)
  if (transition === 'merchant' && state.level < state.config.totalLevels) {
    prepareMerchant(state)
    state.phase = 'merchant'
    return state
  }

  prepareNextLevel(state)
  state.phase = 'playerTurn'
  return state
}

const prepareMerchant = (state: GameState): void => {
  const rng = createSeededRng(state.rngSeed)
  const pool = getMerchantPool(state.level + 1)
  const offers: MerchantOffer[] = []
  const offerCount = 3
  for (let i = 0; i < offerCount; i += 1) {
    const def = pool[Math.floor(rng.next() * pool.length)]
    if (!def) continue
    offers.push({
      card: createWeightedCard(def, () => rng.next()),
      costType: 'score',
      costValue: 10,
    })
  }
  state.merchantOffers = offers
  state.rngSeed = rng.getSeed()
  appendLog(state, '旅行商人现身，挑选你的增益吧！')
}

export const skipMerchant = (sourceState: GameState): GameState => {
  if (sourceState.phase !== 'merchant') return sourceState
  const state = cloneState(sourceState)
  appendLog(state, '你决定无视旅行商人。')
  proceedFromMerchant(state)
  return state
}

export const acceptMerchantOffer = (sourceState: GameState, index: number): EngineOutcome<GameState> => {
  if (sourceState.phase !== 'merchant') {
    return {
      type: 'merchantUnavailable',
      message: '当前不在旅行商人阶段。',
    }
  }
  const offer = sourceState.merchantOffers[index]
  if (!offer) {
    return {
      type: 'merchantUnavailable',
      message: '该商品不存在。',
    }
  }

  const state = cloneState(sourceState)
  const chosen = state.merchantOffers[index]
  if (!chosen) {
    return {
      type: 'merchantUnavailable',
      message: '该商品不存在。',
    }
  }

  if (chosen.costType === 'score') {
    if (state.player.score <= chosen.costValue) {
      return {
        type: 'merchantUnavailable',
        message: '分数不足以购买该卡。',
      }
    }
    state.player.score -= chosen.costValue
  }

  if (!state.player.holdSlot) {
    state.player.holdSlot = chosen.card
  } else {
    state.player.backpack.push(chosen.card)
  }

  appendLog(state, `玩家购入 ${chosen.card.name}，放入${state.player.holdSlot === chosen.card ? '滞留位' : '背包'}。`)
  state.merchantOffers = []
  proceedFromMerchant(state)
  return state
}

const proceedFromMerchant = (state: GameState): void => {
  prepareNextLevel(state)
  if (state.phase !== 'matchEnd') {
    state.phase = 'playerTurn'
  }
}

export const unpackBackpack = (sourceState: GameState, index: number): EngineOutcome<GameState> => {
  if (sourceState.phase !== 'playerTurn') {
    return {
      type: 'invalidPhase',
      message: '只有在玩家回合才能使用背包。',
    }
  }
  if (sourceState.player.holdSlot) {
    return {
      type: 'invalidPhase',
      message: '请先清空滞留位，再从背包取卡。',
    }
  }
  const card = sourceState.player.backpack[index]
  if (!card) {
    return {
      type: 'invalidPhase',
      message: '该背包槽位为空。',
    }
  }

  const state = cloneState(sourceState)
  const [picked] = state.player.backpack.splice(index, 1)
  state.player.holdSlot = picked
  appendLog(state, `从背包取出 ${picked.name} 放入滞留位。`)
  return state
}
