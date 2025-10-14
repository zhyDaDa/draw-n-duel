import CardDisplay from './CardDisplay'
import type { MerchantOffer } from '../game/types'

interface MerchantModalProps {
  isOpen: boolean
  offers: MerchantOffer[]
  onAccept: (index: number) => void
  onSkip: () => void
}

export const MerchantModal: React.FC<MerchantModalProps> = ({ isOpen, offers, onAccept, onSkip }) => {
  if (!isOpen) return null

  return (
    <div className="merchant-overlay">
      <div className="merchant-modal">
        <header>
          <h2>旅行商人</h2>
          <p>挑选一张卡牌强化下一阶段，或者直接离开。</p>
        </header>
        <div className="merchant-modal__offers">
          {offers.map((offer, index) => (
            <CardDisplay
              key={offer.card.instanceId}
              card={offer.card}
              footer={
                <button type="button" className="btn" onClick={() => onAccept(index)}>
                  花费 {offer.costValue} 分 购入
                </button>
              }
            />
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
