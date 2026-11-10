"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/pretest", label: "课前检测" },
  { href: "/learn", label: "学习" },
  { href: "/review", label: "课后复习" },
  { href: "/progress", label: "学习进度" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
        <span className="mr-2 text-lg font-bold text-blue-600">单词学习</span>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-base sm:text-lg ${
                active
                  ? "bg-blue-600 font-semibold text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
