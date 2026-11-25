/**
 * scripts/parse-junior-csv.js
 * 把项目根目录的 junior.csv 转换为 data/junior_words.json。
 *
 * CSV 约定（无表头）：
 *   第 1 列：英文单词
 *   第 2 列：双引号包裹的中文释义（内部可包含换行符与词性）
 *
 * 输出格式与高中词库 data/words.json 完全一致：
 *   { "id", "word", "phonetic", "pos", "meaning" }
 */
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(PROJECT_ROOT, "junior.csv");
const OUT_PATH = path.join(PROJECT_ROOT, "data", "junior_words.json");

// 词性提取：释义开头形如 "n. " / "vt. " / "num. " / "adj. " 的前缀
const POS_RE = /^\s*([a-zA-Z]+\.)\s*/;

function parseRow(row) {
  const word = (row[0] || "").trim();
  if (!word) return null;
  const rawMeaning = (row[1] || "").trim();
  let pos = "";
  let meaning = rawMeaning;
  const m = rawMeaning.match(POS_RE);
  if (m) {
    pos = m[1];
    meaning = rawMeaning.slice(m[0].length).trim();
  }
  return { word, phonetic: "", pos, meaning };
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`找不到源文件：${CSV_PATH}`);
    process.exit(1);
  }

  // 读为字符串并手动去掉 BOM，避免首列单词前混入 \uFEFF
  let text = fs.readFileSync(CSV_PATH, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
    quoteChar: '"',
  });

  if (result.errors && result.errors.length) {
    console.warn("解析警告（部分行）：", result.errors.slice(0, 5));
  }

  // 按单词去重（大小写不敏感），保留首次出现
  const seen = new Set();
  const words = [];
  for (const row of result.data) {
    const item = parseRow(row);
    if (!item) continue;
    const key = item.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(item);
  }

  // 生成 id：j_1, j_2, ...
  const out = words.map((w, i) => ({ id: `j_${i + 1}`, ...w }));

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`解析成功：共 ${out.length} 个单词`);
  console.log(`已写入：${path.relative(PROJECT_ROOT, OUT_PATH)}`);
  console.log("前 3 个词示例：");
  console.log(JSON.stringify(out.slice(0, 3), null, 2));
}

main();
