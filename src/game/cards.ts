import { CARD_LIBRARY } from "./CARD_LIBRARY";
import {
  CardDefinition,
  type CardInstance,
  createCard,
  cloneCardEffect,
  cloneCardInstance as deepCloneCardInstance,
} from "./types";

let instanceCounter = 1;

export const createCardInstance = (
  definition: CardDefinition
): CardInstance => {
  const instance = definition?.createInstance(instanceCounter++);
  if (instance?.C_effect) {
    instance.C_effect = cloneCardEffect(instance.C_effect);
  }
  return instance;
};

export const MERCHANT_EXCLUSIVE: CardDefinition[] = [
  createCard({
    C_id: "merchant-jackpot",
    C_name: "商人大奖",
    C_description: "立即增加 12 分并获得一张额外抽卡券。",
    C_keywords: ["商人强化", "额外抽牌"],
    C_rarity: "rare",
    C_levelRange: [1, 5],
    C_baseWeight: 1,
    C_effect: {
      type: "math",
      target: "self",
      valueDict: {
        score: {
          type: ["score", "math", "add"],
          base: 12,
        },
      },
      notes: "gain-extra-draw-1",
    },
  }),
  createCard({
    C_id: "merchant-shield",
    C_name: "秘制护甲",
    C_description: "获得 2 次护盾。",
    C_keywords: ["防御", "护盾"],
    C_rarity: "rare",
    C_levelRange: [1, 5],
    C_baseWeight: 1,
    C_effect: {
      type: "shield",
      target: "self",
      valueDict: {
        shield: {
          type: ["shield"],
          base: 2,
        },
      },
    },
  }),
  createCard({
    C_id: "merchant-pass",
    C_name: "全球通行证",
    C_description: "任意层结算时保底 60 分，可跨层存放。",
    C_keywords: ["保底", "通行证"],
    C_rarity: "legendary",
    C_levelRange: [1, 5],
    C_baseWeight: 0.6,
    C_effect: {
      type: "levelPass",
      target: "self",
      valueDict: {
        minScore: {
          type: ["score", "levelPass"],
          base: 60,
        },
      },
    },
  }),
];

export const getCardsForLevel = (level: number): CardDefinition[] =>
  CARD_LIBRARY.filter(
    (card) => level >= card.C_levelRange[0] && level <= card.C_levelRange[1]
  );

export const getMerchantPool = (level: number): CardDefinition[] =>
  MERCHANT_EXCLUSIVE.filter(
    (card) => level >= card.C_levelRange[0] && level <= card.C_levelRange[1]
  );

/**
 * 深拷贝一个卡牌实例并分配新的实例 ID
 * 用于需要创建独立副本的场景（如复制卡牌效果）
 */
export const cloneCardInstance = (card: CardInstance): CardInstance => {
  const cloned = deepCloneCardInstance(card);
  cloned.instanceId = instanceCounter++;
  return cloned;
};
