"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, todayStr, type WordRecord, type WordStatus } from "@/lib/db";
import { words, wordMap, type Word } from "@/lib/words";
import { playAudio } from "@/lib/speech";
import { ChevronDown, ChevronUp } from "lucide-react";

interface BatchGroup {
  batchId: number; // 0 表示历史学习（老数据无批次）
  records: WordRecord[];
  mastered: number;
}

/** 状态徽标 */
function StatusBadge({ status, reviewCount }: { status: WordStatus; reviewCount: number }) {
  let text = "待学习";
  let cls = "bg-slate-200 text-slate-600";
  if (status === "mastered") {
    text = "已掌握";
    cls = "bg-emerald-100 text-emerald-700";
  } else if (status === "forgotten") {
    text = "未记住";
    cls = "bg-red-100 text-red-600";
  } else if (status === "learning" && reviewCount === 0) {
    text = "刚学完";
    cls = "bg-amber-100 text-amber-700";
  } else if (status === "learning" && reviewCount > 0) {
    text = "复习中";
    cls = "bg-blue-100 text-blue-700";
  }
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${cls}`}>
      {text}
    </span>
  );
}

function WordRow({ record }: { record: WordRecord }) {
  const word: Word | undefined = wordMap.get(record.id);
  if (!word) return null;
  return (
    <div className="flex items-center gap-4 rounded-lg bg-slate-50 px-4 py-3">
      <button
        onClick={() => playAudio(word.word)}
        className="min-w-0 flex-1 text-left"
        title="点击发音"
      >
        <span className="text-xl font-bold text-slate-800">{word.word}</span>
        <span className="ml-3 text-base text-slate-500">
          {word.pos} {word.meaning}
        </span>
      </button>
      <StatusBadge status={record.status} reviewCount={record.reviewCount} />
    </div>
  );
}

export default function ProgressPage() {
  const [openBatch, setOpenBatch] = useState<number | null>(null);

  // 实时读取 IndexedDB，聚合看板数据 + 按 batchId 分组
  const data = useLiveQuery(async () => {
    const records = await db.records.toArray();
    const today = todayStr();
    const stats = {
      total: words.length, // 总词数（目标）
      learned: records.length, // 累计已学
      todayLearned: records.filter((r) => r.learnedDate === today).length, // 今日已学
      needReview: records.filter(
        (r) => r.status === "learning" || r.status === "forgotten"
      ).length, // 需复习
    };
    const map = new Map<number, WordRecord[]>();
    for (const r of records) {
      const key = r.batchId ?? 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const list: BatchGroup[] = [...map.entries()].map(([batchId, recs]) => ({
      batchId,
      records: recs,
      mastered: recs.filter((r) => r.status === "mastered").length,
    }));
    // 批次按时间倒序（最新的最前），历史学习（0）永远垫底
    list.sort((a, b) => b.batchId - a.batchId);
    return { stats, groups: list };
  }, []);

  const handleReset = async () => {
    if (!window.confirm("确定要清空所有学习记录吗？此操作不可恢复。")) return;
    await db.records.clear();
    localStorage.clear();
    window.location.reload();
  };

  const groups = data?.groups;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <h1 className="text-3xl font-bold">学习进度</h1>

      {/* 顶部数据看板 */}
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow">
        <div className="text-center">
          <p className="text-5xl font-extrabold text-slate-800">
            {data?.stats.total ?? "…"}
            <span className="ml-1 text-lg font-normal text-slate-400">词</span>
          </p>
          <p className="mt-1 text-base text-slate-500">总词数（目标）</p>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-center">
          <div>
            <p className="text-3xl font-extrabold text-blue-600">
              {data?.stats.learned ?? "…"}
            </p>
            <p className="mt-1 text-sm text-slate-500">累计已学</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-emerald-600">
              {data?.stats.todayLearned ?? "…"}
            </p>
            <p className="mt-1 text-sm text-slate-500">今日已学</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-amber-500">
              {data?.stats.needReview ?? "…"}
            </p>
            <p className="mt-1 text-sm text-slate-500">需复习</p>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-700">详细学习档案</h2>

      {groups === undefined && (
        <p className="py-16 text-center text-xl text-slate-400">加载中…</p>
      )}

      {groups?.length === 0 && (
        <p className="py-16 text-center text-xl text-slate-400">
          还没有学习记录，先去学前检测吧
        </p>
      )}

      {groups?.map((g, i) => {
        const isOpen = openBatch === g.batchId;
        const title = g.batchId === 0 ? "历史学习" : `第 ${i + 1} 次学习`;
        return (
          <div key={g.batchId} className="overflow-hidden rounded-2xl bg-white shadow">
            <button
              onClick={() => setOpenBatch(isOpen ? null : g.batchId)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold text-slate-800">{title}</p>
                <p className="mt-1 text-base text-slate-500">
                  本组共 {g.records.length} 词，已掌握 {g.mastered} 词
                </p>
              </div>
              {isOpen ? (
                <ChevronUp className="h-6 w-6 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-6 w-6 shrink-0 text-slate-400" />
              )}
            </button>
            {isOpen && (
              <div className="flex flex-col gap-2 border-t border-slate-100 p-4">
                {g.records.map((r) => (
                  <WordRow key={r.id} record={r} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 重置数据 */}
      <button
        onClick={handleReset}
        className="mt-4 rounded-2xl bg-red-500 py-3 text-xl font-bold text-white hover:bg-red-600"
      >
        清空所有学习记录
      </button>
    </div>
  );
}
