// OpenAI 챗 완성 헬퍼 — 코파일럿/브리핑이 ANTHROPIC 대신 OPENAI_API_KEY 를 쓴다(/api/chat 패턴).
// 키가 없거나 실패하면 null 반환(호출측 폴백).
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';

export async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
