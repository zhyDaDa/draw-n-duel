import type {
  CardInstance,
  CardSituationState,
  GameState,
  PlayerState,
  SituationState,
} from "./types";

type SituationParams = {
  state: GameState;
  player: PlayerState;
  opponent?: PlayerState;
};

export const buildSituationState = (
  params: SituationParams
): SituationState => ({
  G_state: params.state,
  P_state: params.player,
  OP_state: params.opponent,
});

type CardSituationParams = SituationParams & {
  card: CardInstance;
};

export const buildCardSituationState = (
  params: CardSituationParams
): CardSituationState => ({
  ...buildSituationState(params),
  C_current: params.card,
});
