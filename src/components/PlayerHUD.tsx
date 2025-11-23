import CardDisplay from "./CardDisplay";
import AnimatedBuffList from "./AnimatedBuffList";
import {
  DEFAULT_MAX_HOLD_SLOTS,
  type PlayerState,
  type PlayerBuff,
} from "../game/types";
import "../components/BuffDisplay.css";

interface PlayerHUDProps {
  player: PlayerState;
  isCurrent: boolean;
  isHuman: boolean;
  onUnpackBackpack?: (index: number) => void;
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  player,
  isCurrent,
  isHuman,
  onUnpackBackpack,
}) => {
  // 转换现有数据到 Buff 系统
  const buffs: PlayerBuff[] = [];
  const extraHoldSlots = Math.max(0, player.MAX_HOLD_SLOTS - DEFAULT_MAX_HOLD_SLOTS);

  if (extraHoldSlots > 0) {
    buffs.push({
      id: "hold-slot-upgrade",
      name: "滞留扩容",
      description: `滞留位上限提升 ${extraHoldSlots}，当前共有 ${player.MAX_HOLD_SLOTS} 个滞留槽。`,
      icon: "/src/assets/svg/双右_double-right.svg",
      effect: { type: "duplicate" },
      isPermanent: true,
      count: extraHoldSlots,
    });
  }

  // 胜利碎片 Buff —— 按颜色展示，每种颜色单独计数
  if (player.victoryShards && Object.keys(player.victoryShards).length > 0) {
    Object.entries(player.victoryShards).forEach(([color, cnt]) => {
      if (cnt <= 0) return;
      buffs.push({
        id: `victory-shard-${color}`,
        name: `${color} 碎片`,
        description: `已收集 ${cnt} 枚 ${color} 碎片。收集 ${3} 枚相同颜色碎片即可直接获胜！`,
        icon: "/src/assets/svg/拼图_puzzle.svg",
        effect: { type: "victoryShard" },
        isPermanent: true,
        count: cnt,
      });
    });
  }

  // 防御盾 Buff
  if (player.shields > 0) {
    buffs.push({
      id: "shield",
      name: "防御盾",
      description: `拥有 ${player.shields} 层防御盾，可以抵挡负面效果。`,
      icon: "/src/assets/svg/安全增加_shield-add.svg",
      effect: { type: "shield" },
      isPermanent: true,
      count: player.shields,
    });
  }

  // 额外抽卡 Buff (临时)
  if (player.extraDraws > 0) {
    buffs.push({
      id: "extra-draw",
      name: "额外抽卡",
      description: `本回合可额外抽取 ${player.extraDraws} 张卡牌。`,
      icon: "/src/assets/svg/加_plus.svg",
      effect: { type: "extraDraw", value: player.extraDraws },
      isPermanent: false,
      count: player.extraDraws,
    });
  }

  // 层通行证 Buff
  player.passTokens.forEach((token, index) => {
    buffs.push({
      id: `pass-token-${index}`,
      name: `第${token.level}层通行证`,
      description: `在第${token.level}层结算时，分数保底为 ${token.threshold} 分。`,
      icon: "/src/assets/svg/皇冠_crown-two.svg",
      effect: { type: "levelPass" },
      isPermanent: true,
      count: 1,
    });
  });

  // 商人代币 Buff
  if (player.merchantTokens > 0) {
    buffs.push({
      id: "merchant-token",
      name: "商人代币",
      description: `拥有 ${player.merchantTokens} 枚商人代币，可在旅行商人处使用。`,
      icon: "/src/assets/svg/钻石_diamonds.svg",
      effect: { type: "merchantToken" },
      isPermanent: true,
      count: player.merchantTokens,
    });
  }

  // 待处理效果 Buff (临时)
  player.pendingEffects.forEach((effect, index) => {
    if (effect.type === "nextDrawPenalty") {
      buffs.push({
        id: `pending-${index}`,
        name: "抽卡惩罚",
        description: `下次抽卡数量减少 ${effect.value} 张。`,
        icon: "/src/assets/svg/减_minus.svg",
        effect: { type: "extraDraw", value: -effect.value },
        isPermanent: false,
        count: effect.value,
      });
    } else if (effect.type === "startScorePenalty") {
      buffs.push({
        id: `pending-${index}`,
        name: "分数惩罚",
        description: `下一层起始分数降低 ${effect.value} 分。`,
        icon: "/src/assets/svg/双下_double-down.svg",
        effect: { type: "add", value: -effect.value },
        isPermanent: false,
        count: effect.value,
      });
    }
  });

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
          <span>{player.score.toString()}</span>
        </div>
        <div>
          <strong>胜场：</strong>
          <span>{player.wins}</span>
        </div>
        <div>
          <strong>已抽牌：</strong>
          <span>
            {player.drawsUsed} / {player.maxDraws + player.extraDraws}
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
            {player.backpack.map((card, index) => (
              <li key={card.instanceId}>
                <CardDisplay
                  card={card}
                  footer={
                    isHuman ? (
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => onUnpackBackpack?.(index)}
                        disabled={player.holdSlots.length >= 2}
                      >
                        放入滞留位
                      </button>
                    ) : (
                      <span>AI 收藏中</span>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PlayerHUD;
