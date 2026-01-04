import React, { createContext, useContext } from "react";
import type { SituationState } from "../game/types";
import type { CardLaneAnimationEvent } from "../components/CardLane";

export type GameContextType = {
  situation: SituationState;
  setSituation: React.Dispatch<React.SetStateAction<SituationState>>;
  registerAnimation: (event: CardLaneAnimationEvent) => void;
  handleOutcome: (outcome: unknown) => void;
  autoAI: boolean;
  setAutoAI: (v: boolean) => void;
  interactionLocked: boolean;
  currentPlayerIndex: number;
  activeCard?: unknown;
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGameContext = (): GameContextType => {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error("useGameContext must be used within GameContext.Provider");
  }
  return ctx;
};

export default GameContext;