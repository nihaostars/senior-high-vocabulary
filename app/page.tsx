import Link from "next/link";
import { words } from "@/lib/words";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center gap-10 py-10 text-center">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">高中英语单词学习</h1>
        <p className="mt-4 text-xl text-slate-500">
          词库共 <span className="font-bold text-blue-600">{words.length}</span> 个单词
        </p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-4">
        <Link
          href="/pretest"
          className="rounded-2xl bg-amber-500 px-6 py-5 text-2xl font-bold text-white shadow hover:bg-amber-600"
        >
          开始课前检测
        </Link>
        <Link
          href="/learn"
          className="rounded-2xl bg-blue-600 px-6 py-5 text-2xl font-bold text-white shadow hover:bg-blue-700"
        >
          开始学习
        </Link>
        <Link
          href="/review"
          className="rounded-2xl bg-emerald-600 px-6 py-5 text-2xl font-bold text-white shadow hover:bg-emerald-700"
        >
          开始复习
        </Link>
      </div>
    </div>
  );
}
