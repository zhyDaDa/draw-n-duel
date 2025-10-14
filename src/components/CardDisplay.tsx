import type { CardInstance } from '../game/types'

interface CardDisplayProps {
  card: CardInstance
  highlight?: boolean
  footer?: React.ReactNode
}

const effectToText = (card: CardInstance): string => {
  const { type, value, notes } = card.effect
  switch (type) {
    case 'add':
      return `分数 +${value ?? 0}`
    case 'multiply':
      return `分数 x${value ?? 1}`
    case 'set':
      return `分数变为 ${value ?? 0}`
    case 'reset':
      return '分数重置为 1'
    case 'extraDraw':
      return `额外抽牌 ${value ?? 1} 张`
    case 'transfer':
      return `让对手失去 ${value ?? 0} 分`
    case 'steal':
      return `窃取 ${value ?? 0} 分`
    case 'victoryShard':
      return '收集 1 枚胜利碎片'
    case 'levelPass':
      return `结算保底 ${value ?? 50} 分`
    case 'shield':
      return `获得护盾 ${value ?? 1} 层`
    case 'duplicate':
      return '复制滞留卡并结算'
    case 'merchantToken':
      return '旅行商人优惠券'
    case 'wildcard':
      return '若落后则与对手交换分数'
    default:
      return notes ?? '特殊效果'
  }
}

export const CardDisplay: React.FC<CardDisplayProps> = ({ card, highlight = false, footer }) => (
  <div className={`card-display ${highlight ? 'card-display--highlight' : ''}`}>
    <div className={`card-display__rarity card-display__rarity--${card.rarity}`}>
      {card.rarity.toUpperCase()}
    </div>
    <h3 className="card-display__title">{card.name}</h3>
    <p className="card-display__effect">{effectToText(card)}</p>
    <p className="card-display__desc">{card.description}</p>
    {footer && <div className="card-display__footer">{footer}</div>}
  </div>
)

export default CardDisplay
