import { randomInt } from "../utils";
import {
  createCard,
  type CardDefinition,
  type CardEffect,
  type TargetType,
} from "./types";

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
        return `+ ${state.self.C_effect.valueDict.score} 分`;
      },
      onCreate: (state) => {
        const delta = (state.G_state.level + 1) ** 2;
        const score = delta + 1 + randomInt(-delta, delta);
        state.self.C_effect.valueDict.score.base = score;
      },
      onPlay(state) {
        const score = state.self.C_effect.valueDict.score;
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
        return `+ ${state.self.C_effect.valueDict.score} 分`;
      },
      onCreate: (state) => {
        const delta = (state.G_state.level + 1) * 2;
        const score = delta * 0.5 + 1 + randomInt(-delta, delta) * 0.5;
        state.self.C_effect.valueDict.score.base = score;
      },
      onPlay(state) {
        const score = state.self.C_effect.valueDict.score;
        state.P_state.score *= score.modified ?? score.base;
      },
    } as CardEffect,
  }),
];
