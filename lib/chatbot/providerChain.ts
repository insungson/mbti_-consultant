// 무료 AI 모델 폴백 체인 클라이언트.
// priority 순서대로 OpenAI 호환 /chat/completions 를 호출하고,
// failoverOn 에 해당하는 오류면 다음 제공자로 넘어간다.
// 의존성 없음: 전역 fetch(Node 18+/엣지/브라우저 서버런타임) 사용.

import type {
  ChatMessage,
  ChatResult,
  ProviderConfig,
  ProvidersFile,
} from "./types";

/** 환경변수에서 API 키를 읽는다. 런타임에 process.env 가 없으면 빈 값. */
function readApiKey(envName: string): string {
  // Next.js 서버/Node 환경 가정. 브라우저에 노출 금지(서버에서만 호출할 것).
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[envName]?.trim() ?? "";
}

/** 이 오류가 폴백 대상인지 판단 */
function shouldFailover(
  config: ProvidersFile["failoverOn"],
  status: number | null,
  message: string
): boolean {
  if (status != null && config.statusCodes.includes(status)) return true;
  const lower = message.toLowerCase();
  return config.errorKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** 단일 제공자 호출. 성공 시 응답 텍스트 반환, 실패 시 throw. */
async function callProvider(
  provider: ProviderConfig,
  apiKey: string,
  messages: ChatMessage[],
  request: ProvidersFile["request"]
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const res = await fetch(`${provider.baseURL}${request.path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        // stream 확장점: 스트리밍이 필요하면 stream:true 로 바꾸고
        // 호출부에서 ReadableStream 을 파싱하도록 별도 함수를 추가한다.
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("빈 응답(choices 없음)");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 폴백 체인 실행. enabled && 키 보유 제공자를 priority 순으로 시도.
 * - 키 없는 제공자: skip
 * - failoverOn 해당 오류: 다음 제공자로
 * - 그 외 오류: 그래도 다음 제공자로 시도하되 attempts 에 기록(견고성 우선)
 * 모두 실패하면 마지막 오류와 함께 throw.
 */
export async function chatWithFailover(
  messages: ChatMessage[],
  providersFile: ProvidersFile
): Promise<ChatResult> {
  const ordered = [...providersFile.providers]
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  const attempts: ChatResult["attempts"] = [];
  let lastError = "";

  for (const provider of ordered) {
    const apiKey = readApiKey(provider.apiKeyEnv);
    if (!apiKey) {
      attempts.push({ providerId: provider.id, skipped: true, error: `${provider.apiKeyEnv} 미설정` });
      continue;
    }

    try {
      const content = await callProvider(provider, apiKey, messages, providersFile.request);
      attempts.push({ providerId: provider.id });
      return { content, providerId: provider.id, model: provider.model, attempts };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number }).status ?? null;
      lastError = message;
      attempts.push({ providerId: provider.id, error: message });
      // 폴백 대상이면 조용히 다음으로. 아니면 로깅 후에도 다음 제공자를 시도(가용성 우선).
      if (!shouldFailover(providersFile.failoverOn, status, message)) {
        // 비폴백 오류도 일단 다음 제공자로 넘어가되, 마지막에 종합 보고.
        continue;
      }
      continue;
    }
  }

  throw new Error(
    `모든 AI 제공자 호출 실패. 마지막 오류: ${lastError || "사용 가능한 제공자 없음(키 미설정)"}. ` +
      `시도: ${JSON.stringify(attempts)}`
  );
}
