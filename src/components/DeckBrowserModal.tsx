import { Modal, Empty } from "antd";
import CardDisplay from "./CardDisplay";
import type { CardSituationState } from "../game/types";

interface DeckBrowserModalProps {
  open: boolean;
  onClose: () => void;
  cards: CardSituationState[];
}

const DeckBrowserModal: React.FC<DeckBrowserModalProps> = ({
  open,
  onClose,
  cards,
}) => {
  const title = `剩余牌堆（${cards.length} 张）`;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width="80vw"
      className="deck-browser-modal"
      style={{ maxHeight: "80vh", overflowY: "auto" }}
    >
      {cards.length === 0 ? (
        <Empty description="牌堆已空" />
      ) : (
        <div className="deck-browser-modal__grid">
          {cards.map((state) => (
            <CardDisplay
              key={state.C_current.instanceId}
              state={state}
              size="sm"
              className="deck-browser-modal__card"
            />
          ))}
        </div>
      )}
    </Modal>
  );
};

export default DeckBrowserModal;
