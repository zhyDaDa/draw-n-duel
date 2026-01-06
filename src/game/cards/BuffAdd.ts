import { randomInt } from "../../utils";
import {
  createCard,
  createBuff,
  type CardEffect,
  type Rarity,
  type TargetType,
} from "../types";
import { DEFAULT_LEVEL_RANGE } from "../constants";
import IconAdd from "../../assets/svg/加_plus.svg";

// 自动使用文件名作为变量名
export const BuffAdd = createCard({
  C_id: "buff-add",
  C_name: "加法增幅器·初",
  C_rarity: "uncommon" as Rarity,
  C_baseWeight: 11.5, // 加法的权重是10
  C_levelRange: DEFAULT_LEVEL_RANGE,
  C_effect: {
    type: "mathBuff",
    target: "self" as TargetType,
    valueDict: {
      val: {
        type: ["score", "mathBuff", "add"],
        base: 5,
      },
    },
    notes: (state) => {
      const val = state.C_current.C_effect.valueDict.val;
      return `之后的[基础加法](basic-add)都会额外增加${
        val.modified ?? val.base
      }分`;
    },
    onCreate: (state) => {
      // 初始化数值
      const val = state.card.C_effect.valueDict.val;
      // (4~6)*level
      val.base = randomInt(4, 6) * (state.G_state.level + 1);
    },
    onPlay(state) {
      // 出牌逻辑, 给当前玩家上buff
      const val = state.C_current.C_effect.valueDict.val;
      const def = createBuff({
        B_definitionId: "buffadd_base",
        B_name: () => state.C_current.C_name,
        B_description: () => `加法都会额外增加${val.modified ?? val.base}分`,
        B_icon: IconAdd,
        B_isPermanent: true,
        B_category: ["buff", "math"],
        B_valueDict: {
          base: val.modified ?? val.base,
        },
        B_onAfterDraw: (self, s) => {
          console.log("BuffAdd Buff - onAfterDraw, self: ", self);
          const drawnCard = s.C_current;
          if (!drawnCard) return;
          if (drawnCard.definitionId === "basic-add") {
            const targetValDict = drawnCard?.C_effect.valueDict;
            if (targetValDict?.score) {
              targetValDict.score.modified =
                (targetValDict.score.modified ?? targetValDict.score.base) +
                (self.B_valueDict.modified ?? self.B_valueDict.base);
              console.log(
                `%c加法增幅器生效! modified = ${targetValDict.score.modified}`,
                "color: orange;"
              );
            }
          }
        },
      });

      const buff = def.createInstance(state);
      state.P_state.buffs.push(buff);
    },
  } as CardEffect,
});
