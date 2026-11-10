"use client";

import { useEffect, useState } from "react";
import {
  buildReviewPoolIds,
  reviewKnow,
  reviewForgot,
} from "@/lib/db";
import { wordMap, type Word } from "@/lib/words";
import { playAudio } from "@/lib/speech";

type Mark = "know" | "unknown";

/** Fisher-Yates 洗牌，返回新数组 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ReviewPage() {
  const [queue, setQueue] = useState<Word[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [soundOn, setSoundOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  // 进入页面时读取复习池并打乱（快照）
  useEffect(() => {
    (async () => {
      const ids = await buildReviewPoolIds();
      const pool = ids
        .map((id) => wordMap.get(id))
        .filter((w): w is Word => Boolean(w));
      setQueue(shuffle(pool));
    })();
  }, []);

  if (queue === null) {
    return <p className="py-20 text-center text-xl text-slate-400">加载中…</p>;
  }

  if (queue.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-2xl font-bold text-slate-600">复习池是空的</p>
        <p className="mt-3 text-lg text-slate-400">
          可以先去“学前检测”或“学习”中添加生词
        </p>
      </div>
    );
  }

  const correctCount = Object.values(marks).filter((m) => m === "know").length;
  const wrongCount = Object.values(marks).filter((m) => m === "unknown").length;

  const handleMark = (word: Word, mark: Mark) => {
    if (marks[word.id] !== undefined) return; // 已标记，忽略
    setMarks((prev) => ({ ...prev, [word.id]: mark }));
  };

  /** 点击已标记的行：反悔，清除选择 */
  const handleRowClick = (word: Word) => {
    if (marks[word.id] === undefined) {
      if (soundOn) playAudio(word.word);
      return;
    }
    setMarks((prev) => {
      const next = { ...prev };
      delete next[word.id];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    for (const word of queue) {
      const mark = marks[word.id];
      if (mark === "know") {
        await reviewKnow(word.id); // +1，达到 3 次自动 mastered
      } else if (mark === "unknown") {
        await reviewForgot(word.id); // forgotten，reviewCount 归零
      }
      // 未选择的词保持原样，继续留在复习池
    }
    setFinished(true);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6 pb-28">
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold">复习</h1>
        <button
          onClick={() => setSoundOn(!soundOn)}
          className="shrink-0 text-base text-slate-400 hover:text-blue-500"
        >
          {soundOn ? "系统声音开启 🔊" : "系统声音关闭 🔇"}
        </button>
      </div>

      <p className="text-xl">
        正确 <span className="font-bold text-emerald-600">{correctCount}</span>
        {"　"}
        错误 <span className="font-bold text-red-500">{wrongCount}</span>
      </p>

      <div className="flex flex-col gap-3">
        {queue.map((word, i) => {
          const mark = marks[word.id];
          const marked = mark !== undefined;
          return (
            <div
              key={word.id}
              onClick={() => handleRowClick(word)}
              className={`flex cursor-pointer items-center gap-4 rounded-xl px-5 py-4 shadow transition-colors ${
                mark === "know"
                  ? "bg-emerald-100"
                  : mark === "unknown"
                    ? "bg-red-100"
                    : "bg-white"
              }`}
            >
              <span className="w-8 shrink-0 text-right text-lg text-slate-400">
                {i + 1}
              </span>
              <span className="flex-1 text-2xl font-bold text-slate-800">
                {word.word}
              </span>
              {!marked && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMark(word, "know");
                    }}
                    aria-label="认识"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xl font-bold text-slate-500 hover:bg-emerald-200 hover:text-emerald-600"
                  >
                    ✓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMark(word, "unknown");
                    }}
                    aria-label="不认识"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xl font-bold text-slate-500 hover:bg-red-200 hover:text-red-500"
                  >
                    ✗
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部固定提交按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 p-4 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "提交中…" : "提交"}
          </button>
        </div>
      </div>

      {/* 完成弹窗 */}
      {finished && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-white p-10 text-center shadow-xl">
            <p className="text-3xl font-bold text-emerald-600">复习完成</p>
            <p className="text-lg text-slate-500">
              正确 {correctCount} 个 · 错误 {wrongCount} 个
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-bold text-white hover:bg-emerald-700"
            >
              继续复习
            </button>
            <a
              href="/progress"
              className="text-lg text-blue-600 hover:underline"
            >
              查看学习进度
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
