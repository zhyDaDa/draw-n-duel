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
              key={offer.buff.id}
              className={`merchant-offer ${selectedIndex === index ? "is-selected" : ""}`}
            >
              <input
                className="merchant-offer__radio"
                type="radio"
                name="merchant-offer"
                checked={selectedIndex === index}
                onChange={() => handleSelect(index)}
                aria-label={`选择交易：${offer.buff.name}`}
              />
              <div className="merchant-offer__section merchant-offer__section--gain">
                <article className="merchant-offer__card">
                  <header>
                    <strong>
                      {typeof offer.buff.name === "string"
                        ? offer.buff.name
                        : "神秘增益"}
                    </strong>
                    <span>增益</span>
                  </header>
                  <p>
                    {typeof offer.buff.description === "string"
                      ? offer.buff.description
                      : "可在获得后查看详情"}
                  </p>
                </article>
              </div>
              <div className="merchant-offer__divider" aria-hidden="true" />
              <div className="merchant-offer__section merchant-offer__section--cost">
                <article className="merchant-offer__card merchant-offer__card--cost">
                  <header>
                    <strong>付出代价</strong>
                  </header>
                  <p>{offer.cost}</p>
                </article>
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
