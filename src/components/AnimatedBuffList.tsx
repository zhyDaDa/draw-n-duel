import React, { useEffect, useRef, useState } from "react";
import type { PlayerBuff } from "../game/types";
import BuffDisplay from "./BuffDisplay";

interface AnimatedBuffListProps {
  buffs: PlayerBuff[];
  // 用于固定容器高度，避免从无到有布局跳动
  minRows?: number;
}

// 简易入场（由大到正常）与出场（淡出）动画：由 CSS 类控制
type ItemState = "enter" | "exit";
type BuffItem = { key: string; buff: PlayerBuff; state: ItemState };

const AnimatedBuffList: React.FC<AnimatedBuffListProps> = ({ buffs, minRows = 1 }) => {
  const [items, setItems] = useState<BuffItem[]>(() =>
    buffs.map((b) => ({ key: b.id, buff: b, state: "enter" }))
  );
  const prevIdsRef = useRef<string[]>(buffs.map((b) => b.id));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prevIds = new Set(prevIdsRef.current);
    const nextIds = new Set(buffs.map((b) => b.id));

    // 标记退出的（保留以播放退出动画）
    const exiting: BuffItem[] = items
      .filter((it) => !nextIds.has(it.key))
      .map((it) => ({ ...it, state: "exit" }));

    // 保留还存在的（并更新实例/堆叠数）
    const staying: BuffItem[] = items
      .filter((it) => nextIds.has(it.key))
      .map((it) => {
        const nb = buffs.find((b) => b.id === it.key)!;
        return { key: it.key, buff: nb, state: "enter" };
      });

    // 新增的
    const entering: BuffItem[] = buffs
      .filter((b) => !prevIds.has(b.id))
      .map((b) => ({ key: b.id, buff: b, state: "enter" }));

    const nextItems = [...staying, ...entering, ...exiting];
    setItems(nextItems);
    prevIdsRef.current = buffs.map((b) => b.id);

    // 清理：把处于 exit 的项在动画结束后移除（防止 DOM 永远存在）
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    // 动画时长略大于 CSS 中的 260ms
    exitTimerRef.current = window.setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.state !== "exit"));
      exitTimerRef.current = null;
    }, 380);
  }, [buffs]);

  // 将鼠标垂直滚轮映射为横向滚动（仅当溢出时）
  const onWheel = (e: React.WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const canScrollH = el.scrollWidth > el.clientWidth + 1;
    if (!canScrollH) return; // 无需横向滚动

    // 若有水平滚动量直接使用，否则将垂直转为水平滚动
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 0) {
      e.preventDefault();
      el.scrollLeft += delta;
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      className={`buff-list buff-list--animated buff-list--rows-${minRows}`}
    >
      {items.map((it) => (
        <div key={it.key} className={`buff-anim buff-anim--${it.state}`}>
          <BuffDisplay buff={it.buff} />
        </div>
      ))}
    </div>
  );
};

export default AnimatedBuffList;
