import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Question {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export async function POST(req: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === "sk-xxxxxx") {
    return NextResponse.json(
      { error: "服务端未配置 DEEPSEEK_API_KEY，请在 .env.local 中填写后重启开发服务器" },
      { status: 500 }
    );
  }

  // 接收前端传来的单词数组
  let words: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.words)) {
      words = body.words.filter(
        (w: unknown): w is string => typeof w === "string" && w.trim().length > 0
      );
    }
  } catch {
    return NextResponse.json({ error: "请求格式错误，需要 JSON body" }, { status: 400 });
  }
  if (words.length === 0) {
    return NextResponse.json({ error: "请至少勾选一个单词" }, { status: 400 });
  }

  const systemPrompt = `你是一位资深高中英语教研员。请用以下单词写一篇英语阅读文章。要求：

1. 词数严格控制在 200 到 400 词之间。
2. 体裁请从[记叙文, 说明文, 议论文]中随机选择一种。
3. 文章难度为高考英语中等水平，尽量自然地融入所有提供的生词。
4. 根据文章内容自然生成 4 道单项选择题。题型请尽可能模仿真实的高中英语阅读理解（随机包含细节理解、推理判断、主旨大意、词义猜测等，不要刻意凑题型种类，以文章内容设问为准）。
5. 题目和选项的难度要符合高考命题逻辑，避免常识性送分题。
6. 返回结果必须严格遵循以下 JSON 格式，不要包含任何 Markdown 标记：
{
  "article": "英文文章内容",
  "genre": "记叙文/说明文/议论文",
  "questions": [
    {
      "id": 1,
      "type": "自适应的题型（如：细节理解/推理判断/主旨大意/词义猜测）",
      "question": "题干",
      "options": ["A. xxx", "B. xxx", "C. xxx", "D. xxx"],
      "answer": "A",
      "explanation": "中文详细解析"
    }
  ]
}

需要融入的生词列表：${words.join(", ")}`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `请围绕这些单词生成：${words.join(", ")}` },
        ],
        temperature: 1.0,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `大模型接口返回错误（${res.status}）：${detail.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";

    // 去掉可能残留的 markdown 代码块标记后再解析
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    let parsed: { article?: string; questions?: Question[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "模型返回的内容不是合法 JSON", raw: cleaned.slice(0, 500) },
        { status: 502 }
      );
    }

    if (!parsed.article || !Array.isArray(parsed.questions)) {
      return NextResponse.json(
        { error: "模型返回的 JSON 缺少 article 或 questions 字段", raw: cleaned.slice(0, 500) },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: `调用大模型失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
