import CardDisplay from "./CardDisplay";
import { useEffect, useState } from "react";
import type { MerchantOffer } from "../game/types";

interface MerchantModalProps {
  isOpen: boolean;
  offers: MerchantOffer[];
  onAccept: (index: number) => void;
  onSkip: () => void;
}

export const MerchantModal: React.FC<MerchantModalProps> = ({
  isOpen,
  offers,
  onAccept,
  onSkip,
}) => {
  if (!isOpen) return null;

  // 当前选中的报价索引（单选）
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 打开或报价变化时重置选择
  useEffect(() => {
    if (isOpen) setSelectedIndex(null);
  }, [isOpen, offers]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const handleConfirm = () => {
    if (selectedIndex !== null) {
      onAccept(selectedIndex);
    }
  };

  const handleCancel = () => setSelectedIndex(null);

  const severityLabel: Record<MerchantOffer["cost"]["severity"], string> = {
    mild: "轻微",
    moderate: "中度",
    severe: "高危",
  };

  const severityTone: Record<
    MerchantOffer["cost"]["severity"],
    "cost-mild" | "cost-moderate" | "cost-severe"
  > = {
    mild: "cost-mild",
    moderate: "cost-moderate",
    severe: "cost-severe",
  };

  return (
    <div className="merchant-overlay">
      <div className="merchant-modal">
        <header>
          <h2>旅行商人</h2>
          <p>挑选一张卡牌强化下一阶段，或者直接离开。</p>
        </header>
        <div className="merchant-modal__offers" role="radiogroup" aria-label="选择交易">
          {offers.map((offer, index) => (
            <label
              key={offer.card.instanceId}
              className={`merchant-offer merchant-offer--${offer.card.rarity} ${selectedIndex === index ? "is-selected" : ""}`}
            >
              <input
                className="merchant-offer__radio"
                type="radio"
                name="merchant-offer"
                checked={selectedIndex === index}
                onChange={() => handleSelect(index)}
                aria-label={`选择交易：${offer.card.name}`}
              />
              <div className="merchant-offer__section merchant-offer__section--gain">
                {/* <span className="merchant-offer__tag">增益效果</span> */}
                <CardDisplay card={offer.card} variant="merchant" />
                {/* <p className="merchant-offer__summary">
                  {describeCardEffect(offer.card)}
                </p> */}
              </div>
              <div className="merchant-offer__divider" aria-hidden="true" />
              <div className="merchant-offer__section merchant-offer__section--cost">
                {/* <span className="merchant-offer__tag">付出代价</span> */}
                <CardDisplay
                  variant="cost"
                  title="付出代价"
                  effectText={`风险等级：${severityLabel[offer.cost.severity]}`}
                  descriptionText={offer.cost.description}
                  tone={severityTone[offer.cost.severity]}
                />
              </div>
            </label>
          ))}
          {offers.length === 0 && <p>商人暂时无可售卡牌。</p>}
        </div>
        <footer className="merchant-modal__footer">
          {selectedIndex === null ? (
            <button type="button" className="btn btn--ghost" onClick={onSkip}>
              离开商人
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleCancel}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn--merchant btn--glow"
                onClick={handleConfirm}
              >
                确认交易
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

export default MerchantModal;
