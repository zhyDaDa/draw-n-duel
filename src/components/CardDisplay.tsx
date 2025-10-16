import type { ReactNode } from 'react'
import type { CardInstance, Rarity } from '../game/types'

type CardTone = Rarity | 'cost-mild' | 'cost-moderate' | 'cost-severe'

interface CardDisplayProps {
  card?: CardInstance
  title?: string
  effectText?: string
  descriptionText?: string
  tone?: CardTone
  highlight?: boolean
  footer?: ReactNode
  variant?: 'default' | 'merchant' | 'cost'
  size?: 'md' | 'sm'
  className?: string
}

export const describeCardEffect = (card: CardInstance): string => {
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

const toneLabel: Record<CardTone, string> = {
  common: '普通',
  uncommon: '罕见',
  rare: '稀有',
  legendary: '传说',
  'cost-mild': '轻微代价',
  'cost-moderate': '中度代价',
  'cost-severe': '高危代价',
}

export const CardDisplay: React.FC<CardDisplayProps> = ({
  card,
  title,
  effectText,
  descriptionText,
  tone,
  highlight = false,
  footer,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const resolvedTone: CardTone = tone ?? card?.rarity ?? 'common'
  const displayName = title ?? card?.name ?? '未命名卡牌'
  const displayEffect = effectText ?? (card ? describeCardEffect(card) : '')
  const displayDescription = descriptionText ?? card?.description ?? ''

  const classes = [
    'card-display',
    `card-display--${variant}`,
    `card-display--${size}`,
    highlight ? 'card-display--highlight' : '',
    className,
  ].filter(Boolean)

  return (
    <div className={classes.join(' ')} data-tone={resolvedTone}>
      <div className="card-display__rarity-bar">
        <span>{toneLabel[resolvedTone]}</span>
      </div>
      <header className="card-display__header">
        <span className="card-display__name" title={displayName}>
          {displayName}
        </span>
      </header>
      <div className="card-display__body">
        {displayEffect ? (
          <p className="card-display__effect" title={displayEffect}>
            {displayEffect}
          </p>
        ) : null}
        {displayDescription ? (
          <p className="card-display__desc" title={displayDescription}>
            {displayDescription}
          </p>
        ) : null}
      </div>
      {footer && <div className="card-display__footer">{footer}</div>}
    </div>
  )
}

export default CardDisplay
