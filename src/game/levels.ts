import { CARD_LIBRARY, createWeightedCard, getCardsForLevel, weightByRarity } from './cards'
import {
  type CardInstance,
  type DeckState,
  type LevelConfig,
  type MatchConfig,
} from './types'

const shuffle = <T>(arr: T[], rng: () => number): T[] => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const LEVEL_CONFIGS: LevelConfig[] = [
  {
    level: 1,
    name: 'Entrance Trial',
    baseMaxDraws: 3,
    extraDrawProbability: 0.2,
    rareBonusWeight: 0.5,
    specialInjections: ['counter-shield'],
  },
  {
    level: 2,
    name: 'Deepening Strategy',
    baseMaxDraws: 4,
    extraDrawProbability: 0.25,
    rareBonusWeight: 0.8,
    specialInjections: ['level-pass'],
  },
  {
    level: 3,
    name: 'Pivot Point',
    baseMaxDraws: 4,
    extraDrawProbability: 0.3,
    rareBonusWeight: 1,
    specialInjections: ['triple-charge'],
  },
  {
    level: 4,
    name: 'Pressure Peak',
    baseMaxDraws: 5,
    extraDrawProbability: 0.35,
    rareBonusWeight: 1.2,
    specialInjections: ['power-double', 'risk-reset'],
  },
  {
    level: 5,
    name: 'Final Verdict',
    baseMaxDraws: 5,
    extraDrawProbability: 0.4,
    rareBonusWeight: 1.5,
    specialInjections: ['victory-shard', 'wildcard-switch'],
  },
]

export const getLevelConfig = (level: number): LevelConfig => {
  const config = LEVEL_CONFIGS.find((item) => item.level === level)
  if (!config) {
    return LEVEL_CONFIGS[LEVEL_CONFIGS.length - 1]
  }
  return config
}

const DEFAULT_DECK_SIZE = 22

const computeCopies = (definitionId: string, rarity: string, baseWeight: number): number => {
  const rarityWeight = weightByRarity[rarity as keyof typeof weightByRarity] ?? 1
  const desired = baseWeight * rarityWeight
  const copies = Math.max(1, Math.round(desired))
  if (definitionId === 'victory-shard') {
    return 1
  }
  return copies
}

export const buildDeckForLevel = (
  level: number,
  rng: () => number = Math.random,
): DeckState => {
  const levelCards = getCardsForLevel(level)
  const baseInstances: CardInstance[] = []

  levelCards.forEach((definition) => {
    const copies = computeCopies(definition.id, definition.rarity, definition.baseWeight)
    const maxCopies = definition.maxCopies ?? copies
    const totalCopies = Math.min(copies, maxCopies)
    for (let i = 0; i < totalCopies; i += 1) {
      baseInstances.push(createWeightedCard(definition, rng))
    }
  })

  // Ensure deck size by topping up with shuffled commons if needed.
  let instances = baseInstances
  if (instances.length < DEFAULT_DECK_SIZE) {
    const commons = CARD_LIBRARY.filter((card) => card.rarity === 'common' && level >= card.levelRange[0])
    while (instances.length < DEFAULT_DECK_SIZE) {
      const pick = commons[Math.floor(rng() * commons.length)]
      instances.push(createWeightedCard(pick, rng))
    }
  }

  const shuffled = shuffle(instances, rng)
  const rareCount = shuffled.filter((card) => card.rarity === 'rare' || card.rarity === 'legendary').length
  const shardCount = shuffled.filter((card) => card.effect.type === 'victoryShard').length

  return {
    drawPile: shuffled,
    discardPile: [],
    publicInfo: {
      remainingRare: rareCount,
      remainingShards: shardCount,
    },
  }
}

export const nextLevelOrMerchantPhase = (level: number): 'level' | 'merchant' => {
  if (level === 2 || level === 4) {
    return 'merchant'
  }
  return 'level'
}

export const getBaseDrawWindow = (config: MatchConfig, levelConfig: LevelConfig): [number, number] => {
  const maxDraws = levelConfig.baseMaxDraws
  return [config.baseDrawMin, Math.min(config.baseDrawMax, maxDraws)]
}
