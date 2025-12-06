import {
  SituationState,
  type CardInstance,
  type CardSituationState,
  type GameState,
  type PlayerState,
} from "./types";

type SituationParams = {
  state: GameState;
  player?: PlayerState;
  playerIndex?: number;
  opponent?: PlayerState;
  card?: CardInstance;
};

export const buildSituationState = (
  params: SituationParams
): SituationState => {
  const playerIndex = params.playerIndex ?? 
    (params.player ? params.state.players.indexOf(params.player) : params.state.currentPlayerIndex);
  
  return new SituationState({
    gameState: params.state,
    currentPlayerIndex: playerIndex,
    currentCard: params.card,
  });
};

type CardSituationParams = SituationParams & {
  card: CardInstance;
};

/**
 * 构建包含当前卡牌的情境状态
 * 返回的状态确保 C_current 非空
 */
export const buildCardSituationState = (
  params: CardSituationParams
): CardSituationState => {
  const situation = buildSituationState(params);
  // 类型断言:由于我们传入了 card,C_current 一定存在
  return situation as CardSituationState;
};
