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
})

export const CARD_LIBRARY: CardDefinition[] = [
  {
    id: 'linear-boost',
    name: '连锁加法',
    description: '增加 2-6 分，可与滞留位组合成连击。',
    keywords: ['加分', '连击', '风险低'],
    rarity: 'common',
    levelRange: [1, 5],
    baseWeight: 6,
    effect: {
      type: 'add',
      target: 'self',
      minValue: 2,
      maxValue: 6,
    },
    tags: ['combo'],
  },
  {
    id: 'precise-subtract',
    name: '精准扣减',
    description: '减少对手 1-4 分，若对方有护盾则先消耗护盾。',
    keywords: ['干扰', '护盾克制'],
    rarity: 'common',
    levelRange: [2, 5],
    baseWeight: 4,
    effect: {
      type: 'transfer',
      target: 'opponent',
      minValue: 1,
      maxValue: 4,
    },
    tags: ['aggressive'],
  },
  {
    id: 'risk-reset',
    name: '归零试胆',
    description: '将自身分数重置为 1，并获得 2 次额外抽牌机会。',
    keywords: ['风险', '额外抽牌'],
    rarity: 'uncommon',
    levelRange: [1, 5],
    baseWeight: 2,
    effect: {
      type: 'reset',
      target: 'self',
      value: 1,
      notes: 'gain-extra-draw-2',
    },
    tags: ['risk'],
  },
  {
    id: 'power-double',
    name: '暴击倍增',
    description: '将当前分数乘以 2。',
    keywords: ['倍增', '高收益'],
    rarity: 'uncommon',
    levelRange: [2, 5],
    baseWeight: 3,
    effect: {
      type: 'multiply',
      target: 'self',
      value: 2,
    },
    tags: ['multiplier'],
  },
  {
    id: 'triple-charge',
    name: '三连击倒计时',
    description: '增加 4-8 分并获得 1 次额外抽牌机会。',
    keywords: ['加分', '额外抽牌', '连击'],
    rarity: 'uncommon',
    levelRange: [3, 5],
    baseWeight: 2,
    effect: {
      type: 'add',
      target: 'self',
      minValue: 4,
      maxValue: 8,
      notes: 'gain-extra-draw-1',
    },
    tags: ['combo'],
  },
  {
    id: 'victory-shard',
    name: '命运碎片',
    description: '收集 3 枚立即获得整场胜利，可携带至下一层。',
    keywords: ['胜利碎片', '收藏'],
    rarity: 'rare',
    levelRange: [1, 5],
    baseWeight: 1,
    maxCopies: 1,
    effect: {
      type: 'victoryShard',
      target: 'self',
      value: 1,
      carryOver: true,
    },
    tags: ['collectible'],
  },
  {
    id: 'level-pass',
    name: '层级通行证',
    description: '判分时触发，将该层分数提升至至少 50。可留至下一层。',
    keywords: ['保底', '层级通行证'],
    rarity: 'rare',
    levelRange: [2, 5],
    baseWeight: 1,
    effect: {
      type: 'levelPass',
      target: 'self',
      value: 50,
      carryOver: true,
    },
    tags: ['pass'],
  },
  {
    id: 'hold-amplifier',
    name: '滞留增幅器',
    description: '若滞留位已有卡牌，则复制一份并立即结算其中一张。',
    keywords: ['滞留位', '复制'],
    rarity: 'rare',
    levelRange: [3, 5],
    baseWeight: 1,
    effect: {
      type: 'duplicate',
      target: 'self',
    },
    tags: ['combo'],
  },
  {
    id: 'merchant-token',
    name: '旅行商人推荐函',
    description: '下一次旅行商人阶段提供额外优惠并可免费获取一张卡。',
    keywords: ['商人', '优惠'],
    rarity: 'legendary',
    levelRange: [2, 4],
    baseWeight: 0.3,
    effect: {
      type: 'merchantToken',
      target: 'self',
      value: 1,
      carryOver: true,
    },
    tags: ['merchant'],
  },
  {
    id: 'counter-shield',
    name: '反制护盾',
    description: '获得 1 次护盾，可抵挡一次负向效果。',
    keywords: ['护盾', '防御'],
    rarity: 'uncommon',
    levelRange: [1, 5],
    baseWeight: 2,
    effect: {
      type: 'shield',
      target: 'self',
      value: 1,
      carryOver: true,
    },
    tags: ['defense'],
  },
  {
    id: 'wildcard-switch',
    name: '百变替换',
    description: '选择双方之一，将双方分数互换；若自身领先则无事发生。',
    keywords: ['翻盘', '交换分数'],
    rarity: 'legendary',
    levelRange: [4, 5],
    baseWeight: 0.5,
    effect: {
      type: 'wildcard',
      target: 'both',
    },
    tags: ['swing'],
  },
]

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
})
