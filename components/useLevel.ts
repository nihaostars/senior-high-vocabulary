"use client";

import { useCallback, useEffect, useState } from "react";
import { getLevel, setLevel as persistLevel, type Level } from "@/lib/level";

/**
 * 读取/切换当前词库（localStorage 持久化，默认高中）。
 * 切换时刷新整页，保证各页面数据按新词库重新加载。
 */
export function useLevel() {
  const [level, setLevelState] = useState<Level>("senior");

  // 首屏用默认值避免 SSR 与 hydration 不一致，挂载后同步真实选择
  useEffect(() => {
    setLevelState(getLevel());
  }, []);

  const change = useCallback((l: Level) => {
    persistLevel(l);
    setLevelState(l);
    window.location.reload();
  }, []);

  return { level, setLevel: change };
}
