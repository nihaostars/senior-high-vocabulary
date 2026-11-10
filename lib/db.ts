import Dexie, { type Table } from "dexie";

export type WordStatus =
  | "pending_learn"
  | "learning"
  | "mastered"
  | "forgotten";

export interface WordRecord {
  id: string; // 对应 words.json 中的 id
  status: WordStatus;
  learnedDate: string; // 学习该词的日期，格式 YYYY-MM-DD
  reviewCount: number; // 复习次数，复习正确 +1，>=3 视为掌握
  batchId?: number; // 学习批次（每组一个，时间戳）；老数据缺省视为最旧批次
  updatedAt: number;
  // 旧版字段（不再写入，保留仅为兼容 /progress 页面的读取）
  box?: number;
  nextReview?: number;
}

class WordDatabase extends Dexie {
  records!: Table<WordRecord, string>;

  constructor() {
    super("word-learning");
    this.version(1).stores({
      records: "id, status, nextReview",
    });
    // v2：5 天周期滚动复习结构
    this.version(2)
      .stores({
        records: "id, status, learnedDate",
      })
      .upgrade(async (tx) => {
        await tx
          .table("records")
          .toCollection()
          .modify((rec: Record<string, unknown>) => {
            if (rec.status === "unknown") rec.status = "learning";
            rec.learnedDate = (rec.learnedDate as string) ?? todayStr();
            rec.reviewCount = (rec.reviewCount as number) ?? 0;
          });
      });
  }
}

export const db = new WordDatabase();

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 旧版 Leitner 间隔常量，/progress 页面仍在使用 */
export const BOX_INTERVALS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 15,
};

/** 今天的日期字符串 YYYY-MM-DD（本地时区） */
export function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function getOrNew(id: string): Promise<WordRecord> {
  const existing = await db.records.get(id);
  return (
    existing ?? {
      id,
      status: "learning",
      learnedDate: todayStr(),
      reviewCount: 0,
      updatedAt: Date.now(),
    }
  );
}

/** 标记为待学习（学前检测打叉，进入 /learn 学习队列） */
export async function markPendingLearn(id: string) {
  const rec = await getOrNew(id);
  rec.status = "pending_learn";
  rec.learnedDate = todayStr();
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 标记为学习中（课前检测打叉 / 宝盒红色箭头） */
export async function markUnknown(id: string) {
  const rec = await getOrNew(id);
  rec.status = "learning";
  rec.learnedDate = todayStr();
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 标记为刚学完、待复习（宝盒绿色箭头） */
export async function markLearning(id: string) {
  const rec = await getOrNew(id);
  rec.status = "learning";
  rec.learnedDate = todayStr();
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 标记为已掌握（宝盒绿色箭头） */
export async function markMastered(id: string) {
  const rec = await getOrNew(id);
  rec.status = "mastered";
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 复习认识：reviewCount + 1，达到 3 次则掌握 */
export async function reviewKnow(id: string) {
  const rec = await getOrNew(id);
  rec.reviewCount += 1;
  if (rec.reviewCount >= 3) {
    rec.status = "mastered";
  }
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 复习不认识：标记遗忘，reviewCount 重置为 0 */
export async function reviewForgot(id: string) {
  const rec = await getOrNew(id);
  rec.status = "forgotten";
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/**
 * 生成复习池（滑动窗口）：
 * 取最近 5 个学习批次（batchId 从大到小前 5 个）中
 * status 为 learning 或 forgotten 的单词 id。
 * 无 batchId 的老数据按最旧批次（0）处理，会被新批次自动挤出。
 */
export async function buildReviewPoolIds(): Promise<string[]> {
  const records = await db.records.toArray();
  const recentBatches = new Set(
    [...new Set(records.map((r) => r.batchId ?? 0))]
      .sort((a, b) => b - a)
      .slice(0, 5)
  );
  return records
    .filter(
      (r) =>
        recentBatches.has(r.batchId ?? 0) &&
        (r.status === "learning" || r.status === "forgotten")
    )
    .map((r) => r.id);
}
