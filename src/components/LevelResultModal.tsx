import React, { useEffect, useRef, useState } from "react";
import { Modal, Progress } from "antd";
import type { PlayerState } from "../game/types";

interface LevelResultModalProps {
  open: boolean;
  level: number;
  players: PlayerState[];
  onClose: () => void;
}

// 简单的逐帧柱状增长动画（2~3 秒内完成）
const DURATION_MS = 2000; // 2s
const TICK_MS = 32;

const LevelResultModal: React.FC<LevelResultModalProps> = ({
  open,
  level,
  players,
  onClose,
}) => {
  const [animatedScores, setAnimatedScores] = useState<number[]>(
    players.map(() => 0)
  );
  const targetScoresRef = useRef<number[]>([]);

  useEffect(() => {
    if (!open) return;
    targetScoresRef.current = players.map((p) => Math.max(0, p.score));
    setAnimatedScores(players.map(() => 0));

    const steps = Math.ceil(DURATION_MS / TICK_MS);
    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      const ratio = Math.min(1, frame / steps);
      setAnimatedScores(
        targetScoresRef.current.map((t) => Math.round(t * ratio))
      );
      if (ratio >= 1) {
        clearInterval(timer);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [open, players]);

  const ranks = React.useMemo(() => {
    const pairs = players.map((p, i) => ({ i, score: p.score }));
    pairs.sort((a, b) => b.score - a.score);
    const map = new Map<number, number>();
    pairs.forEach((p, idx) => map.set(p.i, idx + 1));
    return map; // index -> rank
  }, [players]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={720}
      centered
      className="level-result-modal"
    >
      <div className="level-result">
        <h2>层级 {level} 结算</h2>
        <div className="level-result__rows">
          {players.map((p, idx) => {
            const displayed = animatedScores[idx] ?? 0;
            const percent = Math.min(
              100,
              p.score === 0 ? 0 : (displayed / Math.max(1, p.score)) * 100
            );
            const rank = ranks.get(idx) ?? 0;
            return (
              <div key={p.label + idx} className="level-result__row">
                <div className="level-result__label">
                  <span className="level-result__name">
                    {p.label === "Player" ? "玩家" : p.label}
                  </span>
                  <span
                    className={`level-result__rank level-result__rank--r${rank}`}
                  >
                    #{rank}
                  </span>
                </div>
                <div className="level-result__bar">
                  <Progress
                    percent={percent}
                    showInfo={false}
                    strokeColor={rank === 1 ? "#22c55e" : "#6366f1"}
                  />
                </div>
                <div className="level-result__score">{displayed}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

export default LevelResultModal;
