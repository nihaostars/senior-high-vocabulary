import seniorRaw from "@/data/words.json";
import juniorRaw from "@/data/junior_words.json";
import type { Level } from "@/lib/level";

export interface Word {
  id: string;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
}

/** 词库结构校验：格式不对时给出友好错误，而不是让页面白屏 */
function loadWords(raw: unknown): { list: Word[]; error: string | null } {
  try {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { list: [], error: "词库加载失败，请检查 JSON 格式" };
    }
    const valid = raw.every(
      (w) => w && typeof (w as Word).id === "string" && !!(w as Word).word && !!(w as Word).meaning
    );
    if (!valid) {
      return { list: [], error: "词库加载失败，请检查 JSON 格式" };
    }
    return { list: raw as Word[], error: null };
  } catch {
    return { list: [], error: "词库加载失败，请检查 JSON 格式" };
  }
}

const senior = loadWords(seniorRaw);
const junior = loadWords(juniorRaw);

export const seniorWords: Word[] = senior.list;
export const juniorWords: Word[] = junior.list;
export const seniorWordsError: string | null = senior.error;
export const juniorWordsError: string | null = junior.error;

/** 按当前词库取单词列表 */
export function getWords(level: Level): Word[] {
  return level === "junior" ? juniorWords : seniorWords;
}

/** 按当前词库取加载错误（无错误返回 null） */
export function getWordsError(level: Level): string | null {
  return level === "junior" ? juniorWordsError : seniorWordsError;
}

const seniorMap = new Map(seniorWords.map((w) => [w.id, w]));
const juniorMap = new Map(juniorWords.map((w) => [w.id, w]));

/** 按当前词库取 id -> Word 的映射表 */
export function getWordMap(level: Level): Map<string, Word> {
  return level === "junior" ? juniorMap : seniorMap;
}

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
