export type Level = "senior" | "junior";

export const LEVELS: { value: Level; label: string }[] = [
  { value: "senior", label: "高中词汇" },
  { value: "junior", label: "初中词汇" },
];

const STORAGE_KEY = "vocab-level";
const DEFAULT_LEVEL: Level = "senior";

/** 读取当前词库（用户已选优先，默认兜底为高中），SSR 下返回默认值 */
export function getLevel(): Level {
  if (typeof window === "undefined") return DEFAULT_LEVEL;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "senior" || saved === "junior" ? saved : DEFAULT_LEVEL;
}

/** 持久化当前词库选择 */
export function setLevel(level: Level): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, level);
}
