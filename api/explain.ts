const PROMPT_TEMPLATE = `あなたは音楽理論の専門家で、ギタリスト向けに解説するメンターです。

コード進行: {progression}

以下を日本語400字以内で解説してください：
1. キー（調）の推定
2. 各コードの機能（T=トニック / SD=サブドミナント / D=ドミナント）
3. この進行が心地よい理由
4. 有名な使用例（曲名・アーティスト名）
5. 発展形の提案

専門用語は括弧内で必ず説明すること。`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { progression } = req.body ?? {};
  if (!progression) {
    return res.status(400).json({ error: "progression is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: PROMPT_TEMPLATE.replace("{progression}", progression),
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: `Anthropic API error: ${text}` });
    }

    const data = await response.json();
    const explanation: string = data.content[0].text;
    return res.status(200).json({ explanation });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}
