import CardDisplay, { describeCardEffect } from './CardDisplay'
import type { MerchantOffer } from '../game/types'

interface MerchantModalProps {
  isOpen: boolean
  offers: MerchantOffer[]
  onAccept: (index: number) => void
  onSkip: () => void
}

export const MerchantModal: React.FC<MerchantModalProps> = ({ isOpen, offers, onAccept, onSkip }) => {
  if (!isOpen) return null

  const severityLabel: Record<MerchantOffer['cost']['severity'], string> = {
    mild: '轻微',
    moderate: '中度',
    severe: '高危',
  }

  const severityTone: Record<MerchantOffer['cost']['severity'], 'cost-mild' | 'cost-moderate' | 'cost-severe'> = {
    mild: 'cost-mild',
    moderate: 'cost-moderate',
    severe: 'cost-severe',
  }

  return (
    <div className="merchant-overlay">
      <div className="merchant-modal">
        <header>
          <h2>旅行商人</h2>
          <p>挑选一张卡牌强化下一阶段，或者直接离开。</p>
        </header>
        <div className="merchant-modal__offers">
          {offers.map((offer, index) => (
            <div key={offer.card.instanceId} className={`merchant-offer merchant-offer--${offer.card.rarity}`}>
              <div className="merchant-offer__section merchant-offer__section--gain">
                <span className="merchant-offer__tag">增益效果</span>
                <CardDisplay card={offer.card} variant="merchant" />
                <p className="merchant-offer__summary">{describeCardEffect(offer.card)}</p>
              </div>
              <div className="merchant-offer__divider" aria-hidden="true" />
              <div className="merchant-offer__section merchant-offer__section--cost">
                <span className="merchant-offer__tag">付出代价</span>
                <CardDisplay
                  variant="cost"
                  title="付出代价"
                  effectText={`风险等级：${severityLabel[offer.cost.severity]}`}
                  descriptionText={offer.cost.description}
                  tone={severityTone[offer.cost.severity]}
                />
              </div>
              <button type="button" className="btn btn--merchant" onClick={() => onAccept(index)}>
                接受交易
              </button>
            </div>
          ))}
          {offers.length === 0 && <p>商人暂时无可售卡牌。</p>}
        </div>
        <footer className="merchant-modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            离开商人
          </button>
        </footer>
      </div>
    </div>
  )
}

export default MerchantModal
