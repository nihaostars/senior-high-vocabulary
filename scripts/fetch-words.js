/**
 * 抓取 3500 词纯文本并转换为 data/words.json
 * 用法: node scripts/fetch-words.js
 * 数据源: GitHub raw（失败时回退到本地下载的 3500.txt）
 */
const fs = require("fs");
const path = require("path");

const REMOTE_URL =
  "https://raw.githubusercontent.com/pluto0x0/word3500/master/3500.txt";
const LOCAL_FALLBACK = "C:/Users/yueha/Downloads/3500.txt";
const OUT_FILE = path.join(__dirname, "..", "data", "words.json");

async function getText() {
  try {
    const res = await fetch(REMOTE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`已从远程获取: ${REMOTE_URL}`);
    return await res.text();
  } catch (e) {
    console.warn(`远程获取失败（${e.message}），使用本地文件: ${LOCAL_FALLBACK}`);
    return fs.readFileSync(LOCAL_FALLBACK, "utf8");
  }
}

/** 清理单词字段：去括号内容、等号注释、首尾空白 */
function cleanWord(s) {
  return s
    .replace(/[（(].*?[)）]/g, "")
    .replace(/=.*$/, "")
    .trim();
}

/** 从「词性 + 释义」混合文本中拆出 pos 和 meaning */
function splitPosMeaning(s) {
  const m = s.match(/^\s*((?:[a-zA-Z]+\.\s*(?:[&、]\s*)?)+)\s*(.*)$/);
  if (m) return { pos: m[1].trim(), meaning: m[2].trim() };
  return { pos: "", meaning: s.trim() };
}

function parse(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const words = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i++;

    // 特殊行：单词和释义挤在一行（如 "sideroad (AmE sidewalk) n.人行道"）
    const inline = line.match(
      /^(.+?)\s+((?:[a-zA-Z]+\.\s*)+[一-龥（(].*)$/
    );
    if (inline && !line.startsWith("[")) {
      const { pos, meaning } = splitPosMeaning(inline[2]);
      const word = cleanWord(inline[1]);
      if (word && meaning) {
        words.push({ id: "", word, phonetic: "", pos, meaning });
      }
      continue;
    }

    // 常规条目：单词行 -> 音标行（[...]）-> 释义行
    const word = cleanWord(line);
    let phonetic = "";
    if (i < lines.length && /^\[.*\]$/.test(lines[i])) {
      phonetic = lines[i].replace(/[[\]]/g, "").trim();
      i++;
    }
    const meaningLine = i < lines.length ? lines[i] : "";
    i++;
    const { pos, meaning } = splitPosMeaning(meaningLine);

    if (!word || !meaning || word.startsWith("[")) continue; // 跳过残缺条目
    words.push({ id: "", word, phonetic, pos, meaning });
  }

  // 源文件已知的几处数据瑕疵，手动修正
  for (const w of words) {
    if (w.word === "sofa") w.phonetic = "ˈsəʊfə";
    if (w.word.startsWith("soft ") && w.pos === "a.") {
      w.word = "soft";
      w.phonetic = "sɔft; (US) sɔːft";
    }
    if (w.word === "software") w.phonetic = "ˈsɔftweə(r)";
  }

  // 统一生成递增 id
  words.forEach((w, idx) => (w.id = String(idx + 1)));
  return words;
}

(async () => {
  const text = await getText();
  const words = parse(text);
  fs.writeFileSync(OUT_FILE, JSON.stringify(words, null, 2), "utf8");
  console.log(`共提取 ${words.length} 个单词，已写入 ${OUT_FILE}`);
  console.log("前 3 个单词：");
  console.log(JSON.stringify(words.slice(0, 3), null, 2));
})();
