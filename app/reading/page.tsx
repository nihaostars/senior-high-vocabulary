"use client";

import { useEffect, useMemo, useState } from "react";
import { db, type WordRecord } from "@/lib/db";
import { getWordMap, type Word } from "@/lib/words";
import { useLevel } from "@/components/useLevel";

interface Question {
  id?: number;
  type?: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface Result {
  article: string;
  genre?: string;
  questions: Question[];
}

/** 统计英文词数 */
const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** 导出 HTML 前转义，避免文章里的 < & 破坏结构 */
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 把文章里出现的生词包成高亮 */
function renderArticle(article: string, words: string[]) {
  if (words.length === 0) return article;
  const escaped = words
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  // split 带捕获组时，奇数下标即为匹配到的生词
  const parts = article.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-amber-200 px-0.5 font-semibold text-slate-800">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function ReadingPage() {
  const { level } = useLevel();
  const [words, setWords] = useState<Word[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // 存 word.id
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showAnswers, setShowAnswers] = useState(false);

  // 读取当前词库今天学过的词（learning / forgotten），为空则退化为所有学过的词
  useEffect(() => {
    (async () => {
      const records = await db.records.where("level").equals(level).toArray();
      const map = getWordMap(level);
      const pick = (list: WordRecord[]) =>
        list.map((r) => map.get(r.id)).filter((w): w is Word => Boolean(w));
      const active = records.filter(
        (r) => r.status === "learning" || r.status === "forgotten"
      );
      const list = active.length > 0 ? pick(active) : pick(records);
      // 切换词库时清空旧结果
      setResult(null);
      setError(null);
      setAnswers({});
      setShowAnswers(false);
      setWords(list);
      setSelected(new Set(list.map((w) => w.id))); // 默认全选，最省操作
    })();
  }, [level]);

  const selectedWords = useMemo(
    () => (words ?? []).filter((w) => selected.has(w.id)),
    [words, selected]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = (words?.length ?? 0) > 0 && selected.size === words?.length;

  const handleGenerate = async () => {
    if (selectedWords.length === 0) {
      setError("请至少勾选一个单词");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    setAnswers({});
    setShowAnswers(false);
    try {
      const res = await fetch("/api/generate-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: selectedWords.map((w) => w.word) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "生成失败，请稍后重试");
      } else {
        setResult(data as Result);
      }
    } catch (e) {
      setError(`网络请求失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  /** 导出 Word：拼 HTML 字符串，用 Blob 生成 .doc */
  const handleExportWord = () => {
    if (!result) return;
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate()
    ).padStart(2, "0")}`;
    const genre = result.genre ?? "—";
    const wordCount = countWords(result.article);

    const paragraphs = result.article
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");

    const questionsHtml = result.questions
      .map((q, i) => {
        const title = q.type ? `${i + 1}. [${q.type}] ${q.question}` : `${i + 1}. ${q.question}`;
        return `<p class="q">${escapeHtml(title)}</p>
${q.options.map((o) => `<p class="opt">${escapeHtml(o)}</p>`).join("\n")}`;
      })
      .join("\n");

    const answersHtml = result.questions
      .map(
        (q, i) =>
          `<p class="qa"><b>${i + 1}. ${escapeHtml(q.answer.trim().toUpperCase())}</b>${
            q.type ? `　[${escapeHtml(q.type)}]` : ""
          }　${escapeHtml(q.explanation ?? "")}</p>`
      )
      .join("\n");

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>英语阅读理解练习</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: "Times New Roman", "SimSun", serif; font-size: 12pt; line-height: 1.8; color: #000; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 6pt 0; }
  .meta { text-align: center; color: #555; font-size: 10.5pt; margin: 0 0 18pt 0; }
  .section { font-size: 13pt; font-weight: bold; margin: 16pt 0 8pt 0; }
  p { margin: 0 0 8pt 0; }
  .q { margin-top: 12pt; font-weight: bold; }
  .opt { margin-left: 18pt; }
  .qa { margin: 0 0 10pt 0; }
</style>
</head>
<body>
<h1>英语阅读理解练习</h1>
<p class="meta">体裁：${escapeHtml(genre)} ｜ 词数：约 ${wordCount} 词 ｜ 生成日期：${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}</p>
<p class="section">一、阅读文章</p>
${paragraphs}
<p class="section">二、阅读理解</p>
${questionsHtml}
<p class="section">三、答案与解析</p>
${answersHtml}
</body>
</html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `阅读理解_${stamp}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6 pb-32">
      <div className="no-print">
        <h1 className="text-3xl font-bold">语境阅读</h1>
        <p className="mt-2 text-lg text-slate-400">
          勾选单词，一键生成今日语境短文与理解题
        </p>
      </div>

      {/* 结果展示区 */}
      {error && (
        <p className="no-print rounded-xl bg-red-50 px-5 py-4 text-lg font-bold text-red-600">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-6 shadow print:shadow-none">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-700">今日短文</h2>
                <p className="mt-1 text-base text-slate-400">
                  {result.genre ?? "—"} ｜ 约 {countWords(result.article)} 词
                </p>
              </div>
              <div className="no-print flex gap-2">
                <button
                  onClick={handleExportWord}
                  className="rounded-xl border border-emerald-600 px-3 py-2 text-base font-bold text-emerald-700 hover:bg-emerald-50"
                >
                  导出 Word
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-base font-bold text-slate-600 hover:bg-slate-50"
                >
                  打印/存为PDF
                </button>
              </div>
            </div>
            <p className="text-lg leading-8 text-slate-800">
              {renderArticle(
                result.article,
                selectedWords.map((w) => w.word)
              )}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {result.questions.map((q, qi) => {
              const chosen = answers[qi];
              return (
                <div key={qi} className="rounded-2xl bg-white p-6 shadow print:shadow-none">
                  <p className="mb-4 text-xl font-bold text-slate-800">
                    {qi + 1}. {q.type ? `[${q.type}] ` : ""}
                    {q.question}
                  </p>
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt) => {
                      const isChosen = chosen === opt;
                      const cls = isChosen
                        ? "border-blue-400 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white hover:bg-slate-50";
                      return (
                        <button
                          key={opt}
                          onClick={() => setAnswers((prev) => ({ ...prev, [qi]: opt }))}
                          className={`rounded-xl border px-4 py-3 text-left text-lg transition-colors ${cls}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 统一答案与解析区（默认隐藏） */}
          {!showAnswers ? (
            <button
              onClick={() => setShowAnswers(true)}
              className="no-print rounded-2xl bg-slate-800 py-4 text-xl font-bold text-white shadow hover:bg-slate-700"
            >
              查看答案与解析
            </button>
          ) : (
            <div className="rounded-2xl bg-white p-6 shadow print:shadow-none">
              <h2 className="mb-3 text-xl font-bold text-slate-700">答案与解析</h2>
              <p className="mb-4 text-lg font-bold text-emerald-700">
                {result.questions
                  .map((q, i) => `${i + 1}. ${q.answer.trim().toUpperCase()}`)
                  .join("　　")}
              </p>
              <div className="flex flex-col gap-3">
                {result.questions.map((q, i) => (
                  <p key={i} className="text-base leading-7 text-slate-600">
                    <span className="font-bold text-slate-800">
                      {i + 1}. {q.answer.trim().toUpperCase()}
                    </span>
                    {q.type && <span className="ml-2 text-slate-400">[{q.type}]</span>}
                    {q.explanation && <span className="mt-1 block">解析：{q.explanation}</span>}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 单词勾选区 */}
      <div className="no-print rounded-2xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-700">
            选择单词（已选 {selected.size} / {words?.length ?? 0}）
          </h2>
          <button
            onClick={() =>
              setSelected(
                allSelected
                  ? new Set()
                  : new Set((words ?? []).map((w) => w.id))
              )
            }
            className="text-base font-bold text-blue-600 hover:underline"
          >
            {allSelected ? "取消全选" : "全选"}
          </button>
        </div>

        {words === null && <p className="text-lg text-slate-400">加载中…</p>}
        {words?.length === 0 && (
          <p className="text-lg text-slate-400">
            还没有学过的单词，先去学习或检测吧
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {words?.map((w) => (
            <label
              key={w.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-lg ${
                selected.has(w.id) ? "bg-teal-50 text-teal-800" : "bg-slate-50 text-slate-600"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(w.id)}
                onChange={() => toggle(w.id)}
                className="h-5 w-5 accent-teal-600"
              />
              <span className="truncate font-semibold">{w.word}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 底部悬浮按钮 */}
      <div className="no-print fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "生成中…请稍候" : "生成今日语境阅读"}
          </button>
        </div>
      </div>
    </div>
  );
}
