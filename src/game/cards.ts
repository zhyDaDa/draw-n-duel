import { CARD_LIBRARY } from './CARD_LIBRARY'
import {
  type CardDefinition,
  type CardEffect,
  type CardInstance,
  type Rarity,
} from './types'

let instanceCounter = 0

const withRandomValue = (effect: CardEffect, rng: () => number): CardEffect => {
  if (effect.minValue !== undefined && effect.maxValue !== undefined) {
    const span = effect.maxValue - effect.minValue
    const value = effect.minValue + Math.round(rng() * span)
    return { ...effect, value }
  }
  return effect
}

const createInstance = (definition: CardDefinition, rng: () => number): CardInstance => ({
  instanceId: `${definition.id}-${Date.now()}-${instanceCounter++}`,
  definitionId: definition.id,
  name: definition.name,
  description: definition.description,
  keywords: definition.keywords ?? [],
  rarity: definition.rarity,
  effect: withRandomValue(definition.effect, rng),
  tags: definition.tags ?? [],
  color: definition.color,
  logic: definition.logic,
  interactionTemplate: definition.interactionTemplate,
})

const MERCHANT_ONLY_TAG = 'merchant-only'

export const MERCHANT_EXCLUSIVE: CardDefinition[] = [
  {
    id: 'merchant-jackpot',
    name: '商人大奖',
    description: '立即增加 12 分并获得一张额外抽卡券。',
    keywords: ['商人强化', '额外抽牌'],
    rarity: 'rare',
    levelRange: [1, 5],
    baseWeight: 1,
    effect: {
      type: 'add',
      target: 'self',
      value: 12,
      notes: 'gain-extra-draw-1',
    },
    tags: [MERCHANT_ONLY_TAG],
  },
  {
    id: 'merchant-shield',
    name: '秘制护甲',
    description: '获得 2 次护盾。',
    keywords: ['防御', '护盾'],
    rarity: 'rare',
    levelRange: [1, 5],
    baseWeight: 1,
    effect: {
      type: 'shield',
      target: 'self',
      value: 2,
      carryOver: true,
    },
    tags: [MERCHANT_ONLY_TAG, 'defense'],
  },
  {
    id: 'merchant-pass',
    name: '全球通行证',
    description: '任意层结算时保底 60 分，可跨层存放。',
    keywords: ['保底', '通行证'],
    rarity: 'legendary',
    levelRange: [1, 5],
    baseWeight: 0.6,
    effect: {
      type: 'levelPass',
      target: 'self',
      value: 60,
      carryOver: true,
    },
    tags: [MERCHANT_ONLY_TAG, 'pass'],
  },
]

export const getCardsForLevel = (level: number): CardDefinition[] =>
  CARD_LIBRARY.filter((card) => level >= card.levelRange[0] && level <= card.levelRange[1])

export const getMerchantPool = (level: number): CardDefinition[] =>
  MERCHANT_EXCLUSIVE.filter((card) => level >= card.levelRange[0] && level <= card.levelRange[1])

export const createCardInstances = (
  definitions: CardDefinition[],
  rng: () => number = Math.random,
): CardInstance[] => definitions.map((definition) => createInstance(definition, rng))

export const createWeightedCard = (
  definition: CardDefinition,
  rng: () => number = Math.random,
): CardInstance => createInstance(definition, rng)

export const weightByRarity: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.6,
  rare: 2.4,
  legendary: 3.2,
}

export const cloneCardInstance = (card: CardInstance): CardInstance => ({
  ...card,
  instanceId: `${card.definitionId}-${Date.now()}-${instanceCounter++}`,
  effect: { ...card.effect },
  tags: [...card.tags],
  color: card.color,
  logic: card.logic,
  interactionTemplate: card.interactionTemplate,
})
