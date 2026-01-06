import { randomInt } from "../../utils";
import { createCard, type CardEffect, type TargetType } from "../types";
import { DEFAULT_LEVEL_RANGE } from "../constants.ts";

export const BasicAdd = createCard({
  C_id: "basic-add",
  C_name: "基础加分",
  C_rarity: "common" as const,
  C_baseWeight: 10,
  C_levelRange: DEFAULT_LEVEL_RANGE,
  C_effect: {
    type: "math",
    target: "self" as TargetType,
    valueDict: {
      score: {
        type: ["score", "math", "add"],
        base: 5,
      },
    },
    notes: (state) => {
      const score = state.C_current.C_effect.valueDict.score;
      if (score.modified) {
        return `获得 ${score.modified}(${score.base}) 分`;
      } else {
        return `获得 ${score.base} 分`;
      }
    },
    onCreate: (state) => {
      const delta = (state.G_state.level + 1) ** 2;
      const score = delta + 1 + randomInt(-delta, delta);
      state.card.C_effect.valueDict.score.base = score;
    },
    onPlay(state) {
      const score = state.C_current.C_effect.valueDict.score;
      state.P_state.score += score.modified ?? score.base;
    },
  } as CardEffect,
});
