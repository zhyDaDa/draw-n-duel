import { createCardInstance, getCardsForLevel } from "./cards";
import {
  type CardInstance,
  type DeckState,
  type LevelConfig,
  type MatchConfig,
  type SituationState,
} from "./types";

const shuffle = <T>(arr: T[], rng: () => number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const LEVEL_CONFIGS: LevelConfig[] = [
  {
    level: 1,
    name: "Entrance Trial",
    baseMaxDraws: 3,
    extraDrawProbability: 0.2,
    deckSize: 30,
    rareBonusWeight: 0.5,
    specialInjections: ["counter-shield"],
  },
  {
    level: 2,
    name: "Deepening Strategy",
    baseMaxDraws: 4,
    extraDrawProbability: 0.25,
    deckSize: 24,
    rareBonusWeight: 0.8,
    specialInjections: ["level-pass"],
  },
  {
    level: 3,
    name: "Pivot Point",
    baseMaxDraws: 4,
    extraDrawProbability: 0.3,
    deckSize: 20,
    rareBonusWeight: 1,
    specialInjections: ["triple-charge"],
  },
  {
    level: 4,
    name: "Pressure Peak",
    baseMaxDraws: 5,
    extraDrawProbability: 0.35,
    deckSize: 30,
    rareBonusWeight: 1.2,
    specialInjections: ["power-double", "risk-reset"],
  },
  {
    level: 5,
    name: "Final Verdict",
    baseMaxDraws: 5,
    extraDrawProbability: 0.4,
    deckSize: 36,
    rareBonusWeight: 1.5,
    specialInjections: ["victory-shard", "wildcard-switch"],
  },
];

export const getLevelConfig = (level: number): LevelConfig => {
  const config = LEVEL_CONFIGS.find((item) => item.level === level);
  if (!config) {
    return LEVEL_CONFIGS[LEVEL_CONFIGS.length - 1];
  }
  return config;
};

const DEFAULT_DECK_SIZE = 24;

export const buildDeckForLevel = (
  state: Omit<SituationState, "P_state">,
  rng: () => number = Math.random
): DeckState => {
  const { level, players } = state.G_state;
  const levelCards = getCardsForLevel(level);
  const baseInstances: CardInstance[] = [];

  const deckSize =
    (getLevelConfig(level).deckSize || DEFAULT_DECK_SIZE) * players.length;
  const weightSum = levelCards.reduce(
    (sum, card) => sum + card.C_baseWeight,
    0
  );
  // 要生成的数量倍率, 不可以是小数, 保证低概率卡牌一定生成
  const adjustment = Math.ceil(deckSize / weightSum);

  levelCards.forEach((definition) => {
    for (let i = 0; i < definition.C_baseWeight * adjustment; i += 1) {
      const card = createCardInstance(definition);
      card.C_effect.onCreate?.({ ...state, C_current: card });
      baseInstances.push(card);
    }
  });

  // 确保卡牌数量和要求的数量一致, shuffle + 截断
  const shuffled = shuffle(baseInstances, rng).slice(0, deckSize);

  const rareCount = shuffled.filter(
    (card) => card.C_rarity === "rare" || card.C_rarity === "legendary"
  ).length;
  const shardCount = shuffled.filter((card) =>
    card.C_keywords?.includes("shard")
  ).length;

  return {
    originalDeckSize: deckSize,
    drawPile: shuffled,
    discardPile: [],
    publicInfo: {
      remainingRare: rareCount,
      remainingShards: shardCount,
    },
  };
};

export const nextLevelOrMerchantPhase = (
  level: number
): "level" | "merchant" => {
  if (level === 2 || level === 4) {
    return "merchant";
  }
  return "level";
};

export const getBaseDrawWindow = (
  config: MatchConfig,
  levelConfig: LevelConfig
): [number, number] => {
  const maxDraws = levelConfig.baseMaxDraws;
  return [config.baseDrawMin, Math.min(config.baseDrawMax, maxDraws)];
};
