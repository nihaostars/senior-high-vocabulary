import Dexie, { type Table } from "dexie";
import type { Level } from "@/lib/level";

export type WordStatus =
  | "pending_learn"
  | "learning"
  | "mastered"
  | "forgotten";

export interface WordRecord {
  id: string; // 对应词库 JSON 中的 id
  level: Level; // 词库级别：senior / junior，与 id 共同构成复合主键，防止同词跨词库冲突
  status: WordStatus;
  learnedDate: string; // 学习该词的日期，格式 YYYY-MM-DD
  reviewCount: number; // 复习次数，复习正确 +1，>=3 视为掌握
  batchId?: number; // 学习批次（每组一个，时间戳）；老数据缺省视为最旧批次
  updatedAt: number;
  // 旧版字段（不再写入，保留仅为兼容读取）
  box?: number;
  nextReview?: number;
}

type RecordKey = [Level, string];

class WordDatabase extends Dexie {
  records!: Table<WordRecord, RecordKey>;

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
    // v3：双词库隔离——复合主键 [level+id]，并给已有记录补 level（默认 senior）
    this.version(3)
      .stores({
        records: "[level+id], level, [level+status], learnedDate, batchId",
      })
      .upgrade(async (tx) => {
        const old = (await tx.table("records").toArray()) as WordRecord[];
        await tx.table("records").clear();
        for (const rec of old) {
          await tx.table("records").put({
            ...rec,
            level: rec.level ?? "senior",
          });
        }
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

async function getOrNew(id: string, level: Level): Promise<WordRecord> {
  const key: RecordKey = [level, id];
  const existing = await db.records.get(key);
  return (
    existing ?? {
      id,
      level,
      status: "learning",
      learnedDate: todayStr(),
      reviewCount: 0,
      updatedAt: Date.now(),
    }
  );
}

/** 标记为待学习（学前检测打叉，进入 /learn 学习队列） */
export async function markPendingLearn(id: string, level: Level) {
  const rec = await getOrNew(id, level);
  rec.status = "pending_learn";
  rec.learnedDate = todayStr();
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 标记为学习中（课前检测打叉 / 宝盒红色箭头） */
export async function markUnknown(id: string, level: Level) {
  const rec = await getOrNew(id, level);
  rec.status = "learning";
  rec.learnedDate = todayStr();
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 标记为刚学完、待复习（宝盒绿色箭头） */
export async function markLearning(id: string, level: Level) {
  const rec = await getOrNew(id, level);
  rec.status = "learning";
  rec.learnedDate = todayStr();
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 标记为已掌握（宝盒绿色箭头 / 学前检测打勾） */
export async function markMastered(id: string, level: Level) {
  const rec = await getOrNew(id, level);
  rec.status = "mastered";
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 复习认识：reviewCount + 1，达到 3 次则掌握 */
export async function reviewKnow(id: string, level: Level) {
  const rec = await getOrNew(id, level);
  rec.reviewCount += 1;
  if (rec.reviewCount >= 3) {
    rec.status = "mastered";
  }
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/** 复习不认识：标记遗忘，reviewCount 重置为 0 */
export async function reviewForgot(id: string, level: Level) {
  const rec = await getOrNew(id, level);
  rec.status = "forgotten";
  rec.reviewCount = 0;
  rec.updatedAt = Date.now();
  await db.records.put(rec);
}

/**
 * 生成复习池（滑动窗口）：取当前词库中最近 5 个学习批次
 * （batchId 从大到小前 5 个）里 status 为 learning 或 forgotten 的单词 id。
 * 无 batchId 的老数据按最旧批次（0）处理，会被新批次自动挤出。
 */
export async function buildReviewPoolIds(level: Level): Promise<string[]> {
  const records = await db.records.where("level").equals(level).toArray();
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

/** 清空当前词库的全部学习记录（不影响另一个词库的进度） */
export async function clearLevelRecords(level: Level) {
  await db.records.where("level").equals(level).delete();
}
