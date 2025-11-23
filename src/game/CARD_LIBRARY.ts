import type { CardDefinition, CardEffect, TargetType } from "./types";

const DEFAULT_LEVEL_RANGE: [number, number] = [1, 5];

type LegacyOptions = {
  rarity?: CardDefinition["rarity"];
  baseWeight?: number;
  levelRange?: [number, number];
  tags?: string[];
  color?: CardDefinition["color"];
  keywords?: string[];
  target?: TargetType;
  effectOverrides?: Partial<CardEffect>;
};

type InteractiveOptions = LegacyOptions & {
  interactionTemplate: NonNullable<CardDefinition["interactionTemplate"]>;
  interactionId?: string;
};

type NoteEntryValue = string | number | boolean | undefined;

const buildNotes = (entries: Array<[string, string | number | undefined]>): string | undefined => {
  const parts = entries
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`);
  return parts.length > 0 ? parts.join("|") : undefined;
};

const buildNotesFromObject = (params?: Record<string, NoteEntryValue>): string | undefined => {
  if (!params) return undefined;
  const entries = Object.entries(params).map<[string, string | number]>(
    ([key, value]) => [key, typeof value === "boolean" ? (value ? "true" : "false") : (value ?? "")] as [
      string,
      string | number
    ]
  );
  return buildNotes(entries);
};

const scriptCard = (
  config: {
    id: string;
    name: string;
    description: string;
    scriptId: string;
  } & LegacyOptions
): CardDefinition => ({
  id: config.id,
  name: config.name,
  description: config.description,
  keywords: config.keywords ?? [],
  rarity: config.rarity ?? "rare",
  levelRange: config.levelRange ?? DEFAULT_LEVEL_RANGE,
  baseWeight: config.baseWeight ?? 1,
  tags: config.tags ?? [],
  color: config.color,
  effect: {
    type: "script",
    target: config.target ?? "self",
    script: config.scriptId,
    ...config.effectOverrides,
  },
});

type MathOperation =
  | "add"
  | "multiply"
  | "divide"
  | "ansSixCycle"
  | "abs"
  | "squareRootChain"
  | "randomZeroClamp";

type MathCardOptions = LegacyOptions & {
  operation: MathOperation;
  params?: Record<string, NoteEntryValue>;
};

const mathCard = (
  config: {
    id: string;
    name: string;
    description: string;
  } & MathCardOptions
): CardDefinition => ({
  id: config.id,
  name: config.name,
  description: config.description,
  keywords: config.keywords ?? [],
  rarity: config.rarity ?? "rare",
  levelRange: config.levelRange ?? DEFAULT_LEVEL_RANGE,
  baseWeight: config.baseWeight ?? 1,
  tags: config.tags ?? [],
  color: config.color,
  effect: {
    type: "script",
    target: config.target ?? "self",
    script: `math.${config.operation}`,
    notes: buildNotesFromObject(config.params),
    ...config.effectOverrides,
  },
});

const noneCard = (
  config: {
    id: string;
    name: string;
    description: string;
  } & LegacyOptions
): CardDefinition => ({
  id: config.id,
  name: config.name,
  description: config.description,
  keywords: config.keywords ?? [],
  rarity: config.rarity ?? "common",
  levelRange: config.levelRange ?? DEFAULT_LEVEL_RANGE,
  baseWeight: config.baseWeight ?? 3,
  tags: config.tags ?? [],
  color: config.color,
  effect: {
    type: "none",
    target: config.target ?? "self",
  },
});

const interactiveCard = (
  config: {
    id: string;
    name: string;
    description: string;
  } & InteractiveOptions
): CardDefinition => ({
  id: config.id,
  name: config.name,
  description: config.description,
  keywords: config.keywords ?? [],
  rarity: config.rarity ?? "rare",
  levelRange: config.levelRange ?? DEFAULT_LEVEL_RANGE,
  baseWeight: config.baseWeight ?? 1,
  tags: config.tags ?? [],
  color: config.color,
  interactionTemplate: config.interactionTemplate,
  effect: {
    type: "interactive",
    target: config.target ?? "self",
    interactionId: config.interactionId ?? config.id,
  },
});

type WordCardOptions = LegacyOptions & {
  char: string;
  icon?: string;
};

const wordCard = (
  config: {
    id: string;
    name: string;
    description: string;
  } & WordCardOptions
): CardDefinition => {
  const baseTags = config.tags ?? [];
  const notes = buildNotes([
    ["char", config.char],
    ["icon", config.icon],
  ]);
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    keywords: config.keywords ?? [],
    rarity: config.rarity ?? "uncommon",
    levelRange: config.levelRange ?? DEFAULT_LEVEL_RANGE,
    baseWeight: config.baseWeight ?? 1.5,
    tags: baseTags.includes("collectible")
      ? baseTags
      : [...baseTags, "collectible"],
    color: config.color,
    effect: {
      type: "script",
      target: config.target ?? "self",
      script: "collection.addChar",
      notes,
    },
  };
};

type VictoryCardOptions = LegacyOptions & {
  amount: number;
  shardColor?: string;
  scriptId?: string;
};

const victoryCard = (
  config: {
    id: string;
    name: string;
    description: string;
  } & VictoryCardOptions
): CardDefinition => {
  const notes = buildNotes([["color", config.shardColor]]);
  const baseTags = config.tags ?? [];
  const tags = baseTags.includes("collectible")
    ? baseTags
    : [...baseTags, "collectible"];
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    keywords: config.keywords ?? [],
    rarity: config.rarity ?? "rare",
    levelRange: config.levelRange ?? DEFAULT_LEVEL_RANGE,
    baseWeight: config.baseWeight ?? 1.2,
    tags,
    color: config.color,
    effect: {
      type: "victoryShard",
      target: config.target ?? "self",
      value: config.amount,
      notes,
      script: config.scriptId,
    },
  };
};

export const CARD_LIBRARY: CardDefinition[] = [
  noneCard({
    id: "pi-nothing",
    name: "屁",
    description: "啥也没有效果",
    rarity: "common",
    baseWeight: 6,
  }),
  scriptCard({
    id: "wenzi-collection",
    name: "文字收藏",
    description:
      "每一个字可以满足你的一个愿望:\n  - 取模 *10\n  - 一把简单钥匙\n  - 胜利点+0.3",
    scriptId: "legacy.wenziCollection",
    rarity: "legendary",
    tags: ["collectible"],
    baseWeight: 0.5,
  }),
  interactiveCard({
    id: "friends-deal",
    name: "FRIEND'S DEAL",
    description: "支付100分, 结束时加100分; 或反之",
    interactionId: "friends-deal",
    interactionTemplate: {
      type: "choice",
      title: "FRIEND'S DEAL",
      message: "支付100分, 结束时加100分; 或反之",
      options: [
        {
          id: "pay-now",
          label: "支付100分, 结束时加100分",
          resultScript: "legacy.friendsDeal.payNow",
        },
        {
          id: "pay-later",
          label: "结束时支付100分, 现在加100分",
          resultScript: "legacy.friendsDeal.payLater",
        },
      ],
    },
  }),
  scriptCard({
    id: "dao-ling-ji",
    name: "刂零彐",
    description: "归零",
    scriptId: "legacy.daoLingReset",
    rarity: "rare",
    baseWeight: 0.9,
  }),
  scriptCard({
    id: "ac-reset",
    name: "AC",
    description: "归零",
    scriptId: "legacy.acReset",
    rarity: "rare",
    baseWeight: 0.9,
  }),
  scriptCard({
    id: "unstable-formula",
    name: "不稳定配方",
    description:
      "之后的每个操作之后生效:\n  1. +100\n  2. -50\n  3. *4\n  4. /10\n  5. +25\n  6. 开根",
    scriptId: "legacy.unstableRecipe",
    rarity: "legendary",
    baseWeight: 0.4,
  }),
  scriptCard({
    id: "clone-quarter",
    name: "克隆卡(¼)",
    description: "只要再抽到一张直接win",
    scriptId: "legacy.cloneQuarter",
    rarity: "legendary",
    baseWeight: 0.4,
  }),
  scriptCard({
    id: "middle-finger-key",
    name: "中指钥匙",
    description: "-=|=----0",
    scriptId: "legacy.middleFingerKey",
    rarity: "rare",
    baseWeight: 0.7,
    tags: ["collectible"],
  }),
  scriptCard({
    id: "limit-sprint",
    name: "极限冲刺",
    description:
      "无视之前的分数但不包括buff,双方以十为基数, 连抽三张，谁大谁赢。注意: 只比较数字的大小。",
    scriptId: "legacy.limitSprint",
    rarity: "legendary",
    baseWeight: 0.5,
  }),
  mathCard({
    id: "basic-ops",
    name: "基本的一些运算",
    description: "*3",
    operation: "multiply",
    params: { factor: 3 },
    rarity: "common",
    baseWeight: 3,
  }),
  scriptCard({
    id: "palette",
    name: "调色盘",
    description: "任意控制所有人的颜色",
    scriptId: "legacy.palette",
    target: "both",
    rarity: "legendary",
    baseWeight: 0.8,
  }),
  scriptCard({
    id: "treasure-map",
    name: "藏宝图",
    description: "3回合后变换成一把罕见钥匙",
    scriptId: "legacy.treasureMap",
    rarity: "rare",
    tags: ["collectible"],
  }),
  interactiveCard({
    id: "score-shop",
    name: "分数商店",
    description:
      "可以将一把钥匙变换成一个乘以二; 每 1/4个任意碎片(不可为负数), 可以兑换成25分",
    interactionTemplate: {
      type: "choice",
      title: "分数商店",
      message:
        "可以将一把钥匙变换成一个乘以二; 每 1/4个任意碎片(不可为负数), 可以兑换成25分",
      options: [
        {
          id: "key-to-double",
          label: "将一把钥匙变换成一个乘以二",
          resultScript: "legacy.scoreShop.key",
        },
        {
          id: "shard-to-score",
          label: "每 1/4个任意碎片兑换成25分",
          resultScript: "legacy.scoreShop.shard",
        },
      ],
    },
  }),
  scriptCard({
    id: "evil-elixir",
    name: "邪恶灵药",
    description: "对手从此每个回合乘以二",
    scriptId: "legacy.evilElixir",
    target: "opponent",
    rarity: "legendary",
  }),
  scriptCard({
    id: "battery-key",
    name: "电池钥匙",
    description: "0=|▮|▮|▮---",
    scriptId: "legacy.batteryKey",
    rarity: "rare",
    tags: ["collectible"],
  }),
  scriptCard({
    id: "swap-recent-card",
    name: "与对方刚抽到的一张牌交换。这张卡。当然换完之后就不生效了。",
    description: "与对方刚抽到的一张牌交换。这张卡。当然换完之后就不生效了。",
    scriptId: "legacy.swapRecent",
    target: "both",
    rarity: "legendary",
  }),
  scriptCard({
    id: "digit-product",
    name: "将当前的数字取模并截掉小数点后的位, 然后将各位数码相乘",
    description: "将当前的数字取模并截掉小数点后的位, 然后将各位数码相乘",
    scriptId: "legacy.modProduct",
    rarity: "rare",
  }),
  victoryCard({
    id: "fragment-0-7",
    name: "碎禾月刂生片",
    description: "胜利点+0.7",
    amount: 0.7,
    shardColor: "碎禾月刂生片",
    rarity: "rare",
  }),
  scriptCard({
    id: "revive-negative",
    name: "复死",
    description: "以-1000重开一局",
    scriptId: "legacy.reviveNegative",
    rarity: "legendary",
    baseWeight: 0.6,
  }),
  wordCard({
    id: "collect-char-a-1",
    name: '可以被收集的汉字: "啊"',
    description: '可以被收集的汉字: "啊"',
    char: "啊",
    rarity: "uncommon",
  }),
  wordCard({
    id: "collect-char-a-2",
    name: '可以被收集的汉字: "啊"',
    description: '可以被收集的汉字: "啊"',
    char: "啊",
    rarity: "uncommon",
  }),
  wordCard({
    id: "collect-char-wo",
    name: '可以被收集的汉字: "我"',
    description: '可以被收集的汉字: "我"',
    char: "我",
    rarity: "uncommon",
  }),
  wordCard({
    id: "collect-char-kong",
    name: '可以被收集的汉字: "空"',
    description: '可以被收集的汉字: "空"',
    char: "空",
    rarity: "uncommon",
  }),
  scriptCard({
    id: "mirror",
    name: "镜像",
    description: "自己本回合之后不再抽卡, 自己之后会受到对方抽到的效果影响",
    scriptId: "legacy.mirror",
    rarity: "legendary",
  }),
  victoryCard({
    id: "fragment-0-8",
    name: "利胜片碎",
    description: "胜利点+0.8",
    amount: 0.8,
    shardColor: "利胜片碎",
    rarity: "rare",
  }),
  mathCard({
    id: "plus-100",
    name: "+100",
    description: "+100",
    operation: "add",
    params: { value: 100 },
    rarity: "common",
    baseWeight: 2.4,
  }),
  scriptCard({
    id: "ans-times-two-minus-one",
    name: "Ans*2 - 1",
    description: "Ans*2 - 1",
    scriptId: "legacy.ansTimesTwoMinusOne",
    rarity: "rare",
  }),
  interactiveCard({
    id: "fragment-trade",
    name: "碎片交易",
    description:
      "0.5个胜利点换30分, 或者也可以支付50换0.2个胜利点(二选一, 也可以选择不交易)",
    interactionTemplate: {
      type: "choice",
      title: "碎片交易",
      message:
        "0.5个胜利点换30分, 或者也可以支付50换0.2个胜利点(二选一, 也可以选择不交易)",
      allowCancel: true,
      options: [
        {
          id: "shard-to-score",
          label: "0.5个胜利点换30分",
          resultScript: "legacy.fragmentTrade.toScore",
        },
        {
          id: "score-to-shard",
          label: "支付50换0.2个胜利点",
          resultScript: "legacy.fragmentTrade.toShard",
        },
      ],
    },
  }),
  scriptCard({
    id: "fourth-draw-boost",
    name: "如果是在本回合的第四次或第五次抽到了这张牌。那么乘以十。否则除以十。",
    description:
      "如果是在本回合的第四次或第五次抽到了这张牌。那么乘以十。否则除以十。",
    scriptId: "legacy.drawTimingBoost",
    rarity: "rare",
  }),
  wordCard({
    id: "collect-char-ri",
    name: '可以收集到汉字:"日"',
    description: '可以收集到汉字:"日"',
    char: "日",
    rarity: "uncommon",
  }),
  scriptCard({
    id: "life-lock",
    name: "保命锁",
    description:
      "分数不允许再下降。即, 如果一次连锁操作之后得到的结果小于原本的分数。那么分数不变。",
    scriptId: "legacy.lifeLock",
    rarity: "legendary",
  }),
  scriptCard({
    id: "power-two",
    name: "^2",
    description: "^2",
    scriptId: "math.power",
    rarity: "common",
    effectOverrides: { value: 2 },
  }),
  scriptCard({
    id: "repeat-last",
    name: "重复上一个操作(如有)",
    description: "重复上一个操作(如有)",
    scriptId: "legacy.repeatLast",
    rarity: "rare",
  }),
  scriptCard({
    id: "coin-flip",
    name: "抛COIN: 正面向上乘以十封面向上除以十",
    description: "抛COIN: 正面向上乘以十封面向上除以十",
    scriptId: "legacy.coinFlip",
    rarity: "rare",
  }),
  scriptCard({
    id: "draw-two-choose",
    name: "再抽两张牌并选择其中一个的效果",
    description: "再抽两张牌并选择其中一个的效果",
    scriptId: "legacy.drawTwoChoose",
    rarity: "rare",
  }),
  mathCard({
    id: "ran-zero",
    name: "如果是正的, Ran(0, Ans) 否则 Ran(Ans, 0)",
    description: "如果是正的, Ran(0, Ans) 否则 Ran(Ans, 0)",
    operation: "randomZeroClamp",
    rarity: "rare",
  }),
  victoryCard({
    id: "victory-fragment-seventh",
    name: "胜利碎片: 1/7个胜利点",
    description: "胜利碎片: 1/7个胜利点",
    amount: 1 / 7,
    shardColor: "胜利碎片",
    rarity: "rare",
  }),
  interactiveCard({
    id: "insurance",
    name: "保险",
    description:
      "你可以通过选择支付一定的分数来左右下一次的数值;\n  - 如果支付十分, 下一次的数值可以选择加减10%\n  - 支付25分则加减20%\n  - 如果支付五十分可以加减40%",
    interactionTemplate: {
      type: "choice",
      title: "保险",
      message:
        "你可以通过选择支付一定的分数来左右下一次的数值;\n  - 如果支付十分, 下一次的数值可以选择加减10%\n  - 支付25分则加减20%\n  - 如果支付五十分可以加减40%",
      options: [
        {
          id: "pay-10",
          label: "支付十分, 下一次的数值可以选择加减10%",
          resultScript: "legacy.insurance.ten",
        },
        {
          id: "pay-25",
          label: "支付25分则加减20%",
          resultScript: "legacy.insurance.twenty",
        },
        {
          id: "pay-50",
          label: "支付五十分可以加减40%",
          resultScript: "legacy.insurance.forty",
        },
      ],
    },
  }),
  scriptCard({
    id: "power-three",
    name: "^3",
    description: "^3",
    scriptId: "math.power",
    rarity: "rare",
    effectOverrides: { value: 3 },
  }),
  scriptCard({
    id: "fragment-inflate",
    name: "膨胀碎片",
    description: "胜利点*125%",
    scriptId: "legacy.fragmentInflate",
    rarity: "rare",
    tags: ["collectible"],
  }),
  scriptCard({
    id: "one-cut",
    name: "一刀",
    description: "-999,999,999",
    scriptId: "legacy.oneCut",
    rarity: "legendary",
  }),
  mathCard({
    id: "times-negative-one",
    name: "*(-1)",
    description: "*(-1)",
    operation: "multiply",
    params: { factor: -1 },
    rarity: "uncommon",
  }),
  scriptCard({
    id: "five-elements-runic",
    name: '一个写有"金木水火土"的正五角形符文(视为5个可收集的汉字)',
    description: '一个写有"金木水火土"的正五角形符文(视为5个可收集的汉字)',
    scriptId: "legacy.fiveElementsRune",
    rarity: "legendary",
    tags: ["collectible"],
  }),
  scriptCard({
    id: "blue-sprint",
    name: "蓝色冲刺",
    description: "持续抽卡直到下一张蓝色的牌",
    scriptId: "legacy.blueSprint",
    color: "blue",
    rarity: "legendary",
  }),
  scriptCard({
    id: "color-record-sequence",
    name: "根据本回合中你的抽牌记录, 从第一张开始执行",
    description:
      "根据本回合中你的抽牌记录, 从第一张开始执行\n  - 黑色: +10\n  - 蓝色: *1.5\n  - 红色: ^2\n  - 汉字/其他颜色: *0",
    scriptId: "legacy.recordSequence",
    rarity: "legendary",
  }),
  scriptCard({
    id: "wu-xing-blue",
    name: "五行字[蓝色]",
    description:
      "根据你现在拥有的汉字数量:\n  - 1: +0.6胜利点\n  - 2: 胜利点*3\n  - 3: (胜利点+0.1) * 6\n  - 4: (|胜利点|+0.4) *2\n  - 5: 直接胜利",
    scriptId: "legacy.wuXingBlue",
    color: "blue",
    rarity: "legendary",
  }),
  scriptCard({
    id: "dice-roll",
    name: "投一个DICE",
    description:
      "投一个DICE:\n  - 1: -100\n  - 2: *2\n  - 3: /3\n  - 4: ^4\n  - 5: 重投\n  - 6: 向下取整后, Ans! (负仍为负)",
    scriptId: "legacy.diceRoll",
    rarity: "rare",
  }),
  victoryCard({
    id: "victory-fragment-0999",
    name: "胜利碎片: 0.999胜利点",
    description: "胜利碎片: 0.999胜利点",
    amount: 0.999,
    shardColor: "胜利碎片",
    rarity: "legendary",
    baseWeight: 0.2,
  }),
  scriptCard({
    id: "blue-chain-draw",
    name: "[蓝色]: 立刻连抽三张并执行",
    description: "[蓝色]: 立刻连抽三张并执行",
    scriptId: "legacy.blueChainDraw",
    color: "blue",
    rarity: "rare",
  }),
  mathCard({
    id: "plus-2022",
    name: "+2022",
    description: "+2022",
    operation: "add",
    params: { value: 2022 },
    rarity: "legendary",
    baseWeight: 0.3,
  }),
  scriptCard({
    id: "ceil-factorial",
    name: "⌈Ans⌉!",
    description: "⌈Ans⌉!",
    scriptId: "legacy.ceilFactorial",
    rarity: "legendary",
  }),
  mathCard({
    id: "ans-six-cycle",
    name: "(((Ans-6)*6)+6)/6",
    description: "(((Ans-6)*6)+6)/6",
    operation: "ansSixCycle",
    rarity: "rare",
  }),
  scriptCard({
    id: "blue-english-key",
    name: "[蓝色]英语钥匙: 0=K=E=Y=-",
    description: "[蓝色]英语钥匙: 0=K=E=Y=-",
    scriptId: "legacy.blueEnglishKey",
    color: "blue",
    rarity: "rare",
    tags: ["collectible"],
  }),
  scriptCard({
    id: "color-echo",
    name: "所有卡颜色均视为上一张卡的颜色, 之后抽到的卡也只能抽那个颜色,如果抽不到的话就再抽,如果没有上一张卡的话就用黑色",
    description:
      "所有卡颜色均视为上一张卡的颜色, 之后抽到的卡也只能抽那个颜色,如果抽不到的话就再抽,如果没有上一张卡的话就用黑色",
    scriptId: "legacy.colorEcho",
    rarity: "legendary",
  }),
  mathCard({
    id: "plus-10",
    name: "+10",
    description: "+10",
    operation: "add",
    params: { value: 10 },
    rarity: "common",
    baseWeight: 3.5,
  }),
  scriptCard({
    id: "two-power-ans",
    name: "2^Ans",
    description: "2^Ans",
    scriptId: "legacy.twoPowerAns",
    rarity: "legendary",
  }),
  scriptCard({
    id: "ans-plus-666",
    name: "(Ans+666)^(-6)",
    description: "(Ans+666)^(-6)",
    scriptId: "legacy.ansPlus666",
    rarity: "legendary",
  }),
  interactiveCard({
    id: "make-a-choice",
    name: "MAKE A CHOICE",
    description: "MAKE A CHOICE:\n  - |Ans|\n  - 先平方后开根",
    interactionTemplate: {
      type: "choice",
      title: "MAKE A CHOICE",
      message: "MAKE A CHOICE:\n  - |Ans|\n  - 先平方后开根",
      options: [
        {
          id: "abs",
          label: "|Ans|",
          resultScript: "math.abs",
        },
        {
          id: "square-root",
          label: "先平方后开根",
          resultScript: "math.squareRootChain",
        },
      ],
    },
  }),
  mathCard({
    id: "plus-25",
    name: "+25",
    description: "+25",
    operation: "add",
    params: { value: 25 },
    rarity: "common",
    baseWeight: 2.8,
  }),
  scriptCard({
    id: "break-time",
    name: "BREAK TIME: TAKE A REST",
    description: "BREAK TIME: TAKE A REST",
    scriptId: "legacy.breakTime",
    rarity: "rare",
  }),
];
