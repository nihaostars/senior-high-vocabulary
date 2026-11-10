import type { Metadata } from "next";
import "./globals.css";
import SiteNav from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "高中英语单词学习",
  description: "高中英语 3500 词学习网站",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteNav />
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
