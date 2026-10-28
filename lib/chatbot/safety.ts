// 코드 레벨 위기 안전망. 프롬프트만으로는 저비용 모델이 위기 대응을 놓칠 수 있어 이중화한다.
// 외부 I/O 없음(순수). 키워드는 data/chatbot-prompts.json 의 shared.crisisProtocol.keywords.

import type { CrisisProtocol, CrisisResource } from "./types";

/** 띄어쓰기 변형("죽고 싶" / "죽고싶")을 함께 잡기 위해 공백을 모두 제거 */
function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * 사용자 메시지에서 위기 키워드를 찾는다. 감지된 키워드 목록을 반환(없으면 빈 배열).
 * 오탐을 줄이려 키워드는 자해·자살 직접 표현으로만 좁게 유지한다(넓은 판단은 모델 몫).
 */
export function detectCrisis(text: string, keywords: string[]): string[] {
  const target = normalize(text);
  return keywords.filter((kw) => target.includes(normalize(kw)));
}

/** 상담 자원 목록을 프롬프트·fallback 공용 텍스트로 만든다 */
export function formatResources(resources: CrisisResource[]): string {
  return resources
    .map((r) => {
      const meta = [r.use, r.audience, r.hours].filter(Boolean).join(", ");
      return `- ${r.name} ${r.contact}: ${meta}`;
    })
    .join("\n");
}

/** 위기 감지 + 모든 AI 제공자 실패 시 내보낼 고정 응답 */
export function buildCrisisFallback(protocol: CrisisProtocol): string {
  return `${protocol.fallbackMessage}\n\n${formatResources(protocol.resources)}`;
}
