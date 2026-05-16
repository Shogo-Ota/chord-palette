export async function explainChords(progression: string): Promise<{ explanation: string }> {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progression }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error ?? "解説の取得に失敗しました");
  }

  return { explanation: data.explanation };
}
