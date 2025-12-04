import CardDisplay from "./CardDisplay";
import AnimatedBuffList from "./AnimatedBuffList";
import { buildCardSituationState } from "../game/situations";
import {
  DEFAULT_MAX_HOLD_SLOTS,
  type GameState,
  type PlayerBuff,
} from "../game/types";
import "../components/BuffDisplay.css";

interface PlayerHUDProps {
  gameState: GameState;
  playerIndex: number;
  isCurrent: boolean;
  onUnpackBackpack?: (index: number) => void;
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  gameState,
  playerIndex,
  isCurrent,
  onUnpackBackpack,
}) => {
  const player = gameState.players[playerIndex];
  if (!player) return null;
  const opponent = gameState.players.find((_, idx) => idx !== playerIndex);
  const isHuman = !player.isAI;
  // 转换现有数据到 Buff 系统
  let syntheticBuffId = 1;
  const makeBuffId = () => syntheticBuffId++;
  const buffs: PlayerBuff[] = [];
  const extraHoldSlots = Math.max(0, player.MAX_HOLD_SLOTS - DEFAULT_MAX_HOLD_SLOTS);

  if (extraHoldSlots > 0) {
    buffs.push({
      id: makeBuffId(),
      name: "滞留扩容",
      description: `滞留位上限提升 ${extraHoldSlots}，当前共有 ${player.MAX_HOLD_SLOTS} 个滞留槽。`,
      icon: "/src/assets/svg/双右_double-right.svg",
      isPermanent: true,
      count: extraHoldSlots,
    });
  }

  // 胜利碎片 Buff —— 按颜色展示，每种颜色单独计数
  if (player.victoryShards && Object.keys(player.victoryShards).length > 0) {
    Object.entries(player.victoryShards).forEach(([color, cnt]) => {
      if (cnt <= 0) return;
      buffs.push({
        id: makeBuffId(),
        name: `${color} 碎片`,
        description: `已收集 ${cnt} 枚 ${color} 碎片。收集 ${3} 枚相同颜色碎片即可直接获胜！`,
        icon: "/src/assets/svg/拼图_puzzle.svg",
        isPermanent: true,
        count: cnt,
      });
    });
  }

  // 防御盾 Buff
  if (player.shields > 0) {
    buffs.push({
      id: makeBuffId(),
      name: "防御盾",
      description: `拥有 ${player.shields} 层防御盾，可以抵挡负面效果。`,
      icon: "/src/assets/svg/安全增加_shield-add.svg",
      isPermanent: true,
      count: player.shields,
    });
  }

  // 额外抽卡 Buff (临时)
  if (player.extraDraws > 0) {
    buffs.push({
      id: makeBuffId(),
      name: "额外抽卡",
      description: `本回合可额外抽取 ${player.extraDraws} 张卡牌。`,
      icon: "/src/assets/svg/加_plus.svg",
      isPermanent: false,
      count: player.extraDraws,
    });
  }

  // 层通行证 Buff
  player.passTokens.forEach((token) => {
    buffs.push({
      id: makeBuffId(),
      name: `第${token.level}层通行证`,
      description: `在第${token.level}层结算时，分数保底为 ${token.threshold} 分。`,
      icon: "/src/assets/svg/皇冠_crown-two.svg",
      isPermanent: true,
      count: 1,
    });
  });

  // 商人代币 Buff
  if (player.merchantTokens > 0) {
    buffs.push({
      id: makeBuffId(),
      name: "商人代币",
      description: `拥有 ${player.merchantTokens} 枚商人代币，可在旅行商人处使用。`,
      icon: "/src/assets/svg/钻石_diamonds.svg",
      isPermanent: true,
      count: player.merchantTokens,
    });
  }

  const allBuffs = [...(player.buffs ?? []), ...buffs];

  return (
    <section className={`player-hud ${isCurrent ? "player-hud--active" : ""}`}>
      <header className="player-hud__header">
        <h2>{player.label === "Player" ? "玩家" : "AI 对手"}</h2>
        {isCurrent && <span className="player-hud__badge">当前回合</span>}
      </header>
      <div className="player-hud__stats">
        <div>
          <strong>分数：</strong>
          <span>{player.score}</span>
        </div>
        <div>
          <strong>胜场：</strong>
          <span>{player.wins}</span>
        </div>
        <div>
          <strong>已抽牌：</strong>
          <span>
            {player.drawsUsed} / {player.baseDraws + player.extraDraws}
          </span>
        </div>
      </div>

      <div className="player-hud__buffs">
        <AnimatedBuffList buffs={allBuffs} minRows={1} />
      </div>

      {player.backpack.length > 0 && (
        <div className="player-hud__backpack">
          <h3>背包</h3>
          <ul>
            {player.backpack.map((card, index) => {
              const state = buildCardSituationState({
                state: gameState,
                player,
                opponent,
                card,
              });
              return (
                <li key={card.instanceId}>
                  <CardDisplay
                    state={state}
                    footer={
                      isHuman ? (
                        <button
                          type="button"
                          className="btn btn--small"
                          onClick={() => onUnpackBackpack?.(index)}
                          disabled={
                            player.holdSlots.length >= player.MAX_HOLD_SLOTS
                          }
                        >
                          放入滞留位
                        </button>
                      ) : (
                        <span>AI 收藏中</span>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PlayerHUD;
