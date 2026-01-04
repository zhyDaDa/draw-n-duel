import type { CardDefinition } from "./types"; // 假设 Card 类型定义在这里

// =================================================================
// 自动注册逻辑
// =================================================================

// 1. 使用 Vite 的 import.meta.glob 抓取 ./cards 目录下所有 .ts 文件
// eager: true 表示直接打包编译，而不是懒加载（因为我们需要构建初始牌库）
const modules = import.meta.glob("./cards/*.ts", { eager: true });

// 2. 遍历所有模块，提取导出的卡牌对象
export const CARD_LIBRARY: CardDefinition[] = Object.values(modules).map(
  (mod: any) => {
    // 因为我们在卡牌文件中使用的是 export const Name = ... (命名导出)
    // 所以我们需要取出模块中的第一个导出对象
    // 如果你以后改用 export default，这里就改成 return mod.default;
    const exportedKeys = Object.keys(mod);
    if (exportedKeys.length === 0) {
      throw new Error(`卡牌文件未导出任何内容`);
    }
    // 默认取第一个导出项作为卡牌对象
    return mod[exportedKeys[0]] as CardDefinition;
  }
);

console.log(`[System] 已自动加载 ${CARD_LIBRARY.length} 张卡牌`);
