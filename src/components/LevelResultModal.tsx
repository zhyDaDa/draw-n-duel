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
  const animTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const [holdRemaining, setHoldRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    // prepare targets and reset animated scores
    // clear any previous timers
    if (animTimerRef.current !== null) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    targetScoresRef.current = players.map((p) => Math.max(0, p.score));
    setAnimatedScores(players.map(() => 0));

    const steps = Math.ceil(DURATION_MS / TICK_MS);
    let frame = 0;
    animTimerRef.current = window.setInterval(() => {
      frame += 1;
      const ratio = Math.min(1, frame / steps);
      setAnimatedScores(
        targetScoresRef.current.map((t) => Math.round(t * ratio))
      );
      if (ratio >= 1) {
        // animation finished, clear anim timer
        if (animTimerRef.current !== null) {
          clearInterval(animTimerRef.current);
          animTimerRef.current = null;
        }
        // animation finished -> start hold countdown (3s) and then auto-close
        const HOLD_MS = 3000;
        const HOLD_SECS = Math.ceil(HOLD_MS / 1000);
        setHoldRemaining(HOLD_SECS);
        // countdown display
        countdownRef.current = window.setInterval(() => {
          setHoldRemaining((v) => {
            if (v === null) return null;
            if (v <= 1) {
              // last tick, clear countdown interval
              if (countdownRef.current !== null) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
              }
              return 0;
            }
            return v - 1;
          });
        }, 1000);
        // hide after HOLD_MS
        holdTimerRef.current = window.setTimeout(() => {
          // call onClose if still open
          onClose();
        }, HOLD_MS);
      }
    }, TICK_MS);

    return () => {
      if (animTimerRef.current !== null) {
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [open, players]);

  const ranks = React.useMemo(() => {
    const pairs = players.map((p, i) => ({ i, score: p.score }));
    pairs.sort((a, b) => b.score - a.score);
    const map = new Map<number, number>();
    pairs.forEach((p, idx) => map.set(p.i, idx + 1));
    return map; // index -> rank
  }, [players]);

  // compute maximum score among players to scale bars proportionally
  const maxScore = React.useMemo(() => {
    const vals = players.map((p) => Math.max(0, p.score));
    const m = Math.max(1, ...vals);
    return m;
  }, [players]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      // we render a custom close button so set closable to false
      closable={false}
      maskClosable={true}
      width={720}
      centered
      className="level-result-modal"
    >
      {/* custom close button with countdown */}
      <div className="level-result__close-wrap">
        <button
          type="button"
          aria-label="close"
          className="level-result__close-btn"
          onClick={() => {
            // clear timers and close immediately
            if (animTimerRef.current !== null) {
              clearInterval(animTimerRef.current);
              animTimerRef.current = null;
            }
            if (holdTimerRef.current !== null) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
            if (countdownRef.current !== null) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            onClose();
          }}
        >
          ×
          {holdRemaining !== null && holdRemaining > 0
            ? ` (${holdRemaining})`
            : ""}
        </button>
      </div>
      <div className="level-result">
        <h2>层级 {level} 结算</h2>
        <div className="level-result__rows">
          {players.map((p, idx) => {
            const displayed = animatedScores[idx] ?? 0;
            // scale by global maxScore so bars have different lengths
            const percent = Math.min(100, (displayed / maxScore) * 100);
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
