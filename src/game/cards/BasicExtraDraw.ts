import { randomInt } from "../../utils";
import {
  createCard,
  type CardEffect,
  type Rarity,
  type TargetType,
} from "../types";
import { DEFAULT_LEVEL_RANGE } from "../constants";

// 自动使用文件名作为变量名
export const BasicExtraDraw = createCard({
  C_id: "basicextradraw",
  C_name: "额外抽卡",
  C_rarity: 1 as Rarity,
  C_baseWeight: 2, // 加法的权重是10
  C_levelRange: DEFAULT_LEVEL_RANGE,
  C_effect: {
    type: "extraDraw",
    target: "self" as TargetType,
    valueDict: {
      val: {
        type: ["extraDraw"],
        base: 1,
      },
      cost: {
        type: ["scoreCost"],
        base: 5,
      },
    },
    notes: (state) => {
      const val = state.C_current.C_effect.valueDict.val;
      const cost = state.C_current.C_effect.valueDict.cost;
      return `支付 ${cost.modified ?? cost.base} 分，获得 ${
        val.modified ?? val.base
      } 次额外抽卡`;
    },
    onCreate: (state) => {
      // 初始化数值
      state.card.C_effect.valueDict.val.base = 1;
      state.card.C_effect.valueDict.cost.base =
        state.G_state.level * randomInt(5, 10);
    },
    onPlay(state) {
      // 出牌逻辑
      const val = state.C_current.C_effect.valueDict.val;
      state.P_state.extraDraws += val.base;
      state.P_state.score -= state.C_current.C_effect.valueDict.cost.base;
    },
  } as CardEffect,
});
