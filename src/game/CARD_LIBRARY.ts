import { randomInt } from "../utils";
import { createCard, type CardEffect, type TargetType } from "./types";

const DEFAULT_LEVEL_RANGE: [number, number] = [1, 5];

export const CARD_LIBRARY = [
  createCard({
    C_id: "basic-add",
    C_name: "基础加分",
    C_rarity: 1 as const,
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
        return `+ ${score.modified ?? score.base} 分`;
      },
      onCreate: (state) => {
        const delta = (state.G_state.level + 1) ** 2;
        const score = delta + 1 + randomInt(-delta, delta);
        state.C_current.C_effect.valueDict.score.base = score;
      },
      onPlay(state) {
        const score = state.C_current.C_effect.valueDict.score;
        state.P_state.score += score.modified ?? score.base;
      },
    } as CardEffect,
  }),
  createCard({
    C_id: "basic-multiply",
    C_name: "基础乘法",
    C_rarity: 1 as const,
    C_baseWeight: 4,
    C_levelRange: DEFAULT_LEVEL_RANGE,
    C_effect: {
      type: "math",
      target: "self" as TargetType,
      valueDict: {
        score: {
          type: ["score", "math", "multiply"],
          base: 2,
        },
      },
      notes: (state) => {
        const score = state.C_current.C_effect.valueDict.score;
        return `x ${score.base}${
          score.modified !== undefined ? ` (modified: ${score.modified})` : ""
        } 分`;
      },
      onCreate: (state) => {
        const delta = (state.G_state.level + 1) * 2;
        const score = delta * 0.5 + 1 + randomInt(-delta, delta) * 0.5;
        state.C_current.C_effect.valueDict.score.base = score;
      },
      onPlay(state) {
        const score = state.C_current.C_effect.valueDict.score;
        state.P_state.score *= score.modified ?? score.base;
      },
    } as CardEffect,
  }),
];
