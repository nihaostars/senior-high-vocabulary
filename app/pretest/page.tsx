"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, markPendingLearn, markMastered } from "@/lib/db";
import { getWords, getWordsError, sampleRandom, type Word } from "@/lib/words";
import { playAudio } from "@/lib/speech";
import { useLevel } from "@/components/useLevel";

const SAMPLE_COUNT = 50;

type Mark = "know" | "unknown" | null;

export default function PretestPage() {
  const router = useRouter();
  const { level } = useLevel();
  const [list, setList] = useState<Word[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  // 每个单词的三态：0 仅英文 -> 1 仅英文+发音 -> 2 英文+释义+发音 -> 0
  const [clickStates, setClickStates] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // 词汇池：仅取当前词库中 IndexedDB 完全没有记录的新词，随机抽 50 个
  useEffect(() => {
    (async () => {
      const records = await db.records.where("level").equals(level).toArray();
      const hasRecord = new Set(records.map((r) => r.id));
      const fresh = getWords(level).filter((w) => !hasRecord.has(w.id));
      // 切换词库时清空旧选择
      setMarks({});
      setClickStates({});
      // 部分洗牌抽样：只随机取 50 个，不全量打乱、不全量渲染
      setList(sampleRandom(fresh, SAMPLE_COUNT));
    })();
  }, [level]);

  const handleMark = (word: Word, mark: Exclude<Mark, null>) => {
    // 只改 UI 状态，不写 IndexedDB；再次点击同一按钮取消标记
    setMarks((prev) => ({
      ...prev,
      [word.id]: prev[word.id] === mark ? null : mark,
    }));
  };

  // 提交时批量写入：打叉 -> pending_learn，打勾 -> mastered
  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    for (const word of list ?? []) {
      const mark = marks[word.id];
      if (mark === "unknown") {
        await markPendingLearn(word.id, level);
      } else if (mark === "know") {
        await markMastered(word.id, level);
      }
    }
    router.push("/learn");
  };

  const wordsError = getWordsError(level);

  if (wordsError) {
    return (
      <p className="py-20 text-center text-xl font-bold text-red-500">
        {wordsError}
      </p>
    );
  }

  if (list === null) {
    return <p className="py-20 text-center text-xl text-slate-400">加载中…</p>;
  }

  if (list.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-2xl font-bold text-emerald-600">
          词库里的单词都已检测过啦
        </p>
        <button
          onClick={() => router.push("/learn")}
          className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-xl font-bold text-white hover:bg-blue-700"
        >
          去学习
        </button>
      </div>
    );
  }

  const unknownCount = Object.values(marks).filter((m) => m === "unknown").length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6 pb-28">
      <div>
        <h1 className="text-3xl font-bold">学前检测</h1>
        <p className="mt-2 text-lg text-slate-400">
          为你准备了 {list.length} 个新词，点击单词听发音，再点显示释义。打叉的单词会进入学习计划。
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {list.map((word, i) => {
          const mark = marks[word.id] ?? null;
          return (
            <div
              key={word.id}
              className={`flex items-center gap-4 rounded-xl px-5 py-4 shadow transition-colors ${
                mark === "unknown"
                  ? "bg-red-100"
                  : mark === "know"
                    ? "bg-white opacity-50"
                    : "bg-white"
              }`}
            >
              <span className="w-8 shrink-0 text-right text-lg text-slate-400">
                {i + 1}
              </span>
              <button
                onClick={() => {
                  const next = ((clickStates[word.id] ?? 0) + 1) % 3;
                  setClickStates((prev) => ({ ...prev, [word.id]: next }));
                  if (next === 1 || next === 2) {
                    playAudio(word.word); // 内部已做防重叠
                  }
                }}
                className="flex-1 text-left"
                title="点击听发音，再点显示释义"
              >
                <span className="block text-2xl font-bold text-slate-800 hover:text-blue-600">
                  {word.word}
                </span>
                {(clickStates[word.id] ?? 0) === 2 && (
                  <span className="mt-1 block text-base text-slate-500">
                    {word.pos} {word.meaning}
                  </span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMark(word, "know");
                }}
                aria-label="认识"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold transition-colors ${
                  mark === "know"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                }`}
              >
                ✓
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMark(word, "unknown");
                }}
                aria-label="不认识"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold transition-colors ${
                  mark === "unknown"
                    ? "bg-red-500 text-white"
                    : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                }`}
              >
                ✗
              </button>
            </div>
          );
        })}
      </div>

      {/* 底部固定提交按钮 */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting
              ? "保存中…"
              : `完成检测，开始学习${unknownCount > 0 ? `（${unknownCount} 个生词）` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
