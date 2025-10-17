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

  useEffect(() => {
    const prevIds = new Set(prevIdsRef.current);
    const nextIds = new Set(buffs.map((b) => b.id));

    // 标记退出的
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

    setItems([...staying, ...entering, ...exiting]);
    prevIdsRef.current = buffs.map((b) => b.id);
  }, [buffs]);

  return (
    <div className={`buff-list buff-list--animated buff-list--rows-${minRows}`}>
      {items.map((it) => (
        <div key={it.key} className={`buff-anim buff-anim--${it.state}`}>
          <BuffDisplay buff={it.buff} />
        </div>
      ))}
    </div>
  );
};

export default AnimatedBuffList;
