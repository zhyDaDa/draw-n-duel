import { randomInt, shuffleString } from "../../utils";
import {
  addBuffToPlayer,
  createBuff,
  createCard,
  type CardEffect,
  type Rarity,
  type TargetType,
} from "../types";
import { DEFAULT_LEVEL_RANGE } from "../constants";
import IconShard from "../../assets/svg/拼图_puzzle.svg";

// 自动使用文件名作为变量名
export const CollectionVictoryShard = createCard({
  C_id: "collection-victory-shard",
  C_name: "胜利碎片",
  C_rarity: "rare" as Rarity,
  C_baseWeight: 10.5, // 加法的权重是10
  C_levelRange: DEFAULT_LEVEL_RANGE,
  C_effect: {
    type: "V-shard",
    target: "self" as TargetType,
    valueDict: {
      val: {
        type: ["V-shard", "collection"],
        base: 1,
      },
    },
    notes: (state) => {
      const { val, cost } = state.C_current.C_effect.valueDict;
      const figureStr = val.modified
        ? `${val.modified}(${val.base})`
        : `${val.base}`;
      return `获得${figureStr}个胜利碎片`;
    },
    onCreate: (state) => {
      state.card.C_effect.valueDict.val.base = randomInt(1, 2);
    },
    onPlay(state) {
      const def = createBuff({
        B_definitionId: "victoryShard",
        B_name: () => shuffleString("胜利碎片"),
        B_description: (self) => "胜利碎片, 集满10个直接胜利",
        B_icon: IconShard,
        B_isPermanent: true,
        B_category: ["collection", "V-shard"],
        B_valueDict: {
          base: 1,
        },
        B_onCreate: (self, state) => {
          // 初始化数值
          if (!state.C_current) return;
          const { val } = state.C_current.C_effect.valueDict;
          self.count = val.modified ?? val.base;
        },
        count: 1,
        canCombine: true,
      });
      const buff = def.createInstance(state);
      buff.B_valueDict.base = randomInt(1, 3) * (state.G_state.level + 1);
      addBuffToPlayer(state, state.P_state, buff);
    },
  } as CardEffect,
});
