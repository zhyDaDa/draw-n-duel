import React from "react";
import { Modal } from "antd";

interface PhaseIntroModalProps {
  open: boolean;
  level: number;
  levelName?: string;
  onClose: () => void;
}

const PhaseIntroModal: React.FC<PhaseIntroModalProps> = ({ open, level, levelName, onClose }) => {
  // 简单缩放/淡入动画通过 CSS 完成；该组件仅负责 1s 展示
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={560}
      centered
      className="phase-intro-modal"
    >
      <div className="phase-intro">
        <h2>第 {level} 层</h2>
        {levelName && <p className="phase-intro__subtitle">{levelName}</p>}
      </div>
    </Modal>
  );
};

export default PhaseIntroModal;
