import rawWords from "@/data/words.json";

export interface Word {
  id: string;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
}

/** 词库结构校验：格式不对时给出友好错误，而不是让页面白屏 */
function loadWords(): { list: Word[]; error: string | null } {
  try {
    if (!Array.isArray(rawWords) || rawWords.length === 0) {
      return { list: [], error: "词库加载失败，请检查 JSON 格式" };
    }
    const valid = rawWords.every(
      (w) => w && typeof w.id === "string" && !!w.word && !!w.meaning
    );
    if (!valid) {
      return { list: [], error: "词库加载失败，请检查 JSON 格式" };
    }
    return { list: rawWords as Word[], error: null };
  } catch {
    return { list: [], error: "词库加载失败，请检查 JSON 格式" };
  }
}

const loaded = loadWords();
export const words: Word[] = loaded.list;
export const wordsError: string | null = loaded.error;

export const wordMap = new Map(words.map((w) => [w.id, w]));

/** Fisher-Yates 洗牌，返回新数组 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 高效随机抽样：部分 Fisher-Yates，只洗前 n 个位置。
 * 适合从数千个词中抽几十个，不需要全量打乱。
 */
export function sampleRandom<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  const m = Math.min(n, a.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, m);
}
