import { Button, Modal, Space, Typography } from "antd";
import type { InteractionRequest } from "../game/types";

interface InteractionModalProps {
  interaction: InteractionRequest | null;
  visible: boolean;
  ownerLabel?: string;
  onSelect: (optionId: string) => void;
  onCancel?: () => void;
}

const intentButtonType = (
  intent: InteractionRequest["options"][number]["intent"]
): "primary" | "default" | "dashed" => {
  switch (intent) {
    case "positive":
      return "primary";
    case "negative":
      return "dashed";
    default:
      return "default";
  }
};

const InteractionModal: React.FC<InteractionModalProps> = ({
  interaction,
  visible,
  ownerLabel = "该玩家",
  onSelect,
  onCancel,
}) => {
  if (!interaction) return null;

  const closable = Boolean(interaction.allowCancel && onCancel);

  return (
    <Modal
      open={visible}
      title={`${interaction.title} ｜ ${ownerLabel}`}
      footer={null}
      className="interaction-modal"
      destroyOnClose
      centered
      closable={closable}
      maskClosable={false}
      onCancel={closable ? onCancel : undefined}
    >
      <Typography.Paragraph type="secondary">
        {interaction.message}
      </Typography.Paragraph>
      <Space direction="vertical" className="interaction-modal__options">
        {interaction.options.map((option) => (
          <Button
            key={option.id}
            block
            size="large"
            type={intentButtonType(option.intent)}
            className={`interaction-modal__option interaction-modal__option--${
              option.intent ?? "neutral"
            }`}
            onClick={() => onSelect(option.id)}
          >
            <div className="interaction-modal__option-content">
              <div className="interaction-modal__option-text">
                <strong>{option.label}</strong>
                {option.description ? (
                  <span className="interaction-modal__option-desc">
                    {option.description}
                  </span>
                ) : null}
              </div>
              {option.costDescription ? (
                <span className="interaction-modal__option-cost">
                  {option.costDescription}
                </span>
              ) : null}
            </div>
          </Button>
        ))}
      </Space>
    </Modal>
  );
};

export default InteractionModal;
