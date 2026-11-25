"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { db, markLearning, reviewForgot } from "@/lib/db";
import { getWordMap, getWordsError, type Word } from "@/lib/words";
import { playAudio } from "@/lib/speech";
import { useLevel } from "@/components/useLevel";

const GROUP_SIZE = 5;

type View = "learn" | "test";
type TestMark = "know" | "unknown";

export default function LearnPage() {
  const router = useRouter();
  const { level } = useLevel();
  const [view, setView] = useState<View>("learn");
  const [groupIndex, setGroupIndex] = useState(0);
  const [clickStates, setClickStates] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [testMarks, setTestMarks] = useState<Record<string, TestMark>>({});
  const [isFinalTest, setIsFinalTest] = useState(false); // 是否处于终极宝盒
  const [batchId, setBatchId] = useState(0); // 当前组的学习批次
  const [soundOn, setSoundOn] = useState(true);
  const [studyWords, setStudyWords] = useState<Word[] | null>(null);

  // 只读取当前词库中 status === 'pending_learn' 的单词（快照）
  // 每次最多取 20 个待学词，避免一次性加载过多
  useEffect(() => {
    (async () => {
      const records = await db.records.where("level").equals(level).toArray();
      const map = getWordMap(level);
      const list = records
        .filter((r) => r.status === "pending_learn")
        .slice(0, 20)
        .map((r) => map.get(r.id))
        .filter((w): w is Word => Boolean(w));
      // 切换词库时重置所有视图状态
      setGroupIndex(0);
      setClickStates({});
      setActiveId(null);
      setTestMarks({});
      setIsFinalTest(false);
      setView("learn");
      setStudyWords(list);
    })();
  }, [level]);

  const groups = useMemo(() => {
    if (!studyWords) return [];
    const result: Word[][] = [];
    for (let i = 0; i < studyWords.length; i += GROUP_SIZE) {
      result.push(studyWords.slice(i, i + GROUP_SIZE));
    }
    return result;
  }, [studyWords]);

  const wordsError = getWordsError(level);

  if (wordsError) {
    return (
      <p className="py-20 text-center text-xl font-bold text-red-500">
        {wordsError}
      </p>
    );
  }

  if (studyWords === null) {
    return <p className="py-20 text-center text-xl text-slate-400">加载中…</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 py-20 text-center">
        <p className="text-2xl font-bold text-slate-600">
          暂无待学习的单词，请先前往学前检测
        </p>
        <button
          onClick={() => router.push("/pretest")}
          className="rounded-2xl bg-amber-500 px-8 py-4 text-2xl font-bold text-white shadow hover:bg-amber-600"
        >
          前往学前检测
        </button>
      </div>
    );
  }

  const safeGroupIndex = Math.min(groupIndex, groups.length - 1);
  const currentGroup = groups[safeGroupIndex];
  const isLastGroup = safeGroupIndex === groups.length - 1;
  const currentGroupNum = safeGroupIndex + 1; // 组号从 1 开始
  const totalGroups = groups.length;

  // ---------- 测试矩阵 ----------
  // 终极宝盒：最后一组测试提交后触发，词池 = 今日全部单词
  // 偶数组（2、4、6...，含最后一组为偶数时）：上一组 + 当前组（10 个）
  // 奇数组（1、3、5...，含最后一组为奇数时）：仅当前组（5 个）
  let testPool: Word[];
  let testTitle: string;
  if (isFinalTest) {
    testPool = groups.flat();
    testTitle = "终极宝盒 全体词汇挑战";
  } else if (currentGroupNum % 2 === 0) {
    testPool = [...groups[safeGroupIndex - 1], ...currentGroup];
    testTitle = `闯关宝盒 第${currentGroupNum - 1}-${currentGroupNum}组混合`;
  } else {
    testPool = currentGroup;
    testTitle = `闯关宝盒 第${currentGroupNum}组`;
  }

  // ---------- 学习视图 ----------
  // 四态循环：0 仅英文 -> 1 仅英文+发音 -> 2 英文+释义+发音 -> 3 空白 -> 0
  const handleCardClick = (word: Word) => {
    const next = ((clickStates[word.id] ?? 0) + 1) % 4;
    setClickStates((prev) => ({ ...prev, [word.id]: next }));
    setActiveId(word.id); // 点击的卡片成为当前焦点
    if (soundOn && (next === 1 || next === 2)) {
      playAudio(word.word); // 在线真人发音，内部已做防重叠
    }
  };

  // ---------- 检测视图 ----------
  const allMarked =
    testPool.length > 0 &&
    testPool.every((w) => testMarks[w.id] !== undefined);

  const handleArrow = async (word: Word, mark: TestMark) => {
    if (testMarks[word.id] !== undefined) return; // 已点击过，忽略
    setTestMarks((prev) => ({ ...prev, [word.id]: mark }));
    if (soundOn) {
      playAudio(word.word);
    }
    if (mark === "know") {
      await markLearning(word.id, level); // pending_learn -> learning -> 进复习池
    } else {
      await reviewForgot(word.id, level); // pending_learn -> forgotten -> 进复习池
    }
    // 当前组的新词赋予本组批次号（混合测试中的旧组词保留原批次）
    if (currentGroup.some((w) => w.id === word.id)) {
      await db.records.update([level, word.id], { batchId });
    }
  };

  const handleContinue = () => {
    if (isLastGroup) {
      // 最后一组测试提交后：立刻进入终极宝盒（停留在 test 视图）
      setTestMarks({});
      setIsFinalTest(true);
    } else {
      // 普通测试提交后：回 /learn 继续下一组
      setGroupIndex(safeGroupIndex + 1);
      setClickStates({});
      setActiveId(null);
      setTestMarks({});
      setView("learn");
    }
  };

  const soundToggle = (
    <button
      onClick={() => setSoundOn(!soundOn)}
      className="shrink-0 text-base text-slate-400 hover:text-blue-500"
    >
      {soundOn ? "系统声音开启 🔊" : "系统声音关闭 🔇"}
    </button>
  );

  // ========== 闯关宝盒（阶段性检测）==========
  if (view === "test") {
    return (
      <div className="-mx-4 -my-8 min-h-screen bg-teal-100 px-4 py-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div className="flex items-start justify-between">
            <h1 className="flex-1 text-center text-3xl font-bold">
              {testTitle}
            </h1>
            {soundToggle}
          </div>

          <div className="flex flex-col gap-4">
            {testPool.map((word) => {
              const mark = testMarks[word.id];
              const answered = mark !== undefined;
              return (
                <div
                  key={word.id}
                  className={`flex items-center justify-between rounded-xl bg-white px-6 py-5 shadow transition-opacity ${
                    answered ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <span className="text-3xl font-bold text-slate-800">
                    {word.word}
                  </span>
                  <span className="flex gap-3">
                    <button
                      onClick={() => handleArrow(word, "know")}
                      aria-label="会"
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                    >
                      <ArrowLeft size={26} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => handleArrow(word, "unknown")}
                      aria-label="不会"
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200"
                    >
                      <ArrowRight size={26} strokeWidth={2.5} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {allMarked && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
            <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-white p-10 text-center shadow-xl">
              {isFinalTest ? (
                <>
                  <p className="text-3xl font-bold text-emerald-600">
                    今日学习任务全部完成！
                  </p>
                  <button
                    onClick={() => router.push("/review")}
                    className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-bold text-white hover:bg-emerald-700"
                  >
                    去复习
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="w-full rounded-2xl bg-white py-4 text-2xl font-bold text-emerald-600 ring-2 ring-emerald-600 hover:bg-emerald-50"
                  >
                    回首页
                  </button>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-emerald-600">
                    {isLastGroup ? "本组通关！接下来是终极宝盒" : "本组通关！"}
                  </p>
                  <button
                    onClick={handleContinue}
                    className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-bold text-white hover:bg-emerald-700"
                  >
                    继续
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== 学习视图 ==========
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">今日单词识记</h1>
          <p className="mt-2 text-lg text-slate-400">
            今日单词识记 {currentGroupNum}/{totalGroups}组
          </p>
        </div>
        {soundToggle}
      </div>

      <div className="flex flex-col gap-4">
        {currentGroup.map((word) => {
          const state = clickStates[word.id] ?? 0;
          const isActive = activeId === word.id;
          return (
            <button
              key={word.id}
              onClick={() => handleCardClick(word)}
              className={`flex h-28 w-full items-stretch overflow-hidden rounded-xl border text-left transition-colors ${
                state === 2
                  ? "border-teal-200 bg-teal-50"
                  : state === 3
                    ? "border-slate-200 bg-white"
                    : "border-transparent bg-gray-100"
              }`}
            >
              <span className="flex w-6 shrink-0 items-center justify-center">
                {isActive && (
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                )}
              </span>
              <span className="flex flex-1 flex-col justify-center pr-5">
                {(state === 0 || state === 1) && (
                  <span className="text-3xl font-bold text-slate-800">
                    {word.word}
                  </span>
                )}
                {state === 2 && (
                  <>
                    <span className="text-3xl font-bold text-slate-800">
                      {word.word}
                    </span>
                    <span className="mt-1 text-lg text-slate-600">
                      {word.meaning}
                    </span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => {
          setActiveId(null);
          setBatchId(Date.now()); // 进入宝盒时为当前组生成批次号
          setView("test");
        }}
        className="rounded-2xl bg-blue-600 py-4 text-2xl font-bold text-white shadow hover:bg-blue-700"
      >
        {isLastGroup ? "学完这组" : "下一组"}
      </button>
    </div>
  );
}
