import CardDisplay from './CardDisplay'
import type { PlayerState } from '../game/types'

interface PlayerHUDProps {
  player: PlayerState
  isCurrent: boolean
  isHuman: boolean
  onReleaseHold?: () => void
  onUnpackBackpack?: (index: number) => void
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  player,
  isCurrent,
  isHuman,
  onReleaseHold,
  onUnpackBackpack,
}) => {
  const holdCard = player.holdSlot

  return (
    <section className={`player-hud ${isCurrent ? 'player-hud--active' : ''}`}>
      <header className="player-hud__header">
        <h2>{player.label === 'Player' ? '玩家' : 'AI 对手'}</h2>
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
          <strong>胜利碎片：</strong>
          <span>{player.victoryShards}</span>
        </div>
        <div>
          <strong>护盾：</strong>
          <span>{player.shields}</span>
        </div>
        <div>
          <strong>已抽牌：</strong>
          <span>
            {player.drawsUsed} / {player.maxDraws + player.extraDraws}
          </span>
        </div>
      </div>

      <div className="player-hud__hold">
        <h3>滞留位</h3>
        {holdCard ? (
          <CardDisplay
            card={holdCard}
            highlight
            footer={
              isHuman ? (
                <button type="button" onClick={onReleaseHold} className="btn btn--small">
                  释放滞留卡
                </button>
              ) : (
                <span>AI 可在合适时机使用</span>
              )
            }
          />
        ) : (
          <p className="player-hud__placeholder">暂无卡牌</p>
        )}
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
                        disabled={Boolean(player.holdSlot)}
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
  )
}

export default PlayerHUD
