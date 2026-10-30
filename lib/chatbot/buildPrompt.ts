// 페르소나 + 유형 프로필 + 대화 이력 → OpenAI 호환 메시지 배열로 조립하는 순수 함수.
// 외부 I/O 없음(순수). 테스트하기 쉽도록 데이터를 인자로 받는다.
// 조립 순서·규칙의 근거: docs/plan/chatbot_spec.md §8

import { formatResources } from "./safety";
import type { ChatMessage, ChatbotPrompts, CrisisProtocol, Persona, TypeProfile } from "./types";

/** injectFields 에 쓰이는 필드 키 → 사람이 읽을 한글 라벨 */
const FIELD_LABELS: Record<string, string> = {
  growthAdvice: "성장 조언",
  weaknesses: "보완하면 좋은 점(약점)",
  strengths: "강점",
  careers: "직업 적합성",
  socialTips: "사회생활 팁",
  relationships: "대인관계 성향",
  coreTraits: "핵심 특성",
  cognitiveStack: "인지기능 스택",
};

/** 코드 안전망이 위기를 감지했을 때 system 프롬프트 맨 끝에 붙이는 지시 (recency 보강) */
const CRISIS_NOTICE =
  "[이번 메시지 주의]\n위기 신호가 감지되었다. 다른 모든 규칙보다 위기 대응 규칙을 먼저 적용하라.";

/** 이전 대화가 있을 때 system 프롬프트 끝(위기 알림 앞)에 붙이는 지시 (recency 보강) */
const FOLLOW_UP_NOTICE =
  "[이어지는 대화]\n앞에서 들은 사실을 이어 받는다. 인사와 유형 설명을 되풀이하지 않고, 질문은 하나만 하되 한 가지만 묻는다.";

/** 한 섹션 값을 프롬프트에 넣기 좋은 텍스트로 직렬화 */
function serializeSection(value: unknown): string {
  if (value == null) return "(정보 없음)";
  if (typeof value === "string") return value;
  // 배열/객체는 JSON으로 그대로 전달 (모델이 충분히 해석 가능)
  return JSON.stringify(value, null, 2);
}

/** 문자열 목록 → "- " 불릿 텍스트 */
function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/** persona.injectFields 에 해당하는 프로필 섹션들을 컨텍스트 텍스트로 만든다 */
function buildInjectedSections(persona: Persona, profile: TypeProfile): string {
  const blocks: string[] = [];
  for (const field of persona.injectFields) {
    // cognitiveStack/coreTraits 는 contextTemplate 상단에서 이미 다루지만,
    // injectFields 에 포함되면 명시적으로 한 번 더 강조해도 무방하므로 그대로 둔다.
    const label = FIELD_LABELS[field] ?? field;
    blocks.push(`[${label}]\n${serializeSection(profile[field])}`);
  }
  return blocks.join("\n\n");
}

/** contextTemplate 의 {placeholder} 치환 */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? vars[key] : `{${key}}`
  );
}

/** [응답 구조] 인정 → 탐색 → 격려 → 안전 + 하지 말 것 */
function buildResponseStructure(shared: ChatbotPrompts["shared"]): string | null {
  const structure = shared.responseStructure;
  if (!structure) return null;
  const flow = structure.steps.map((s) => s.label).join(" → ");
  const steps = structure.steps.map((s, i) => `${i + 1}. ${s.label}: ${s.rule}`).join("\n");
  return `[응답 구조 — ${flow}]\n${steps}\n하지 말 것:\n${bullets(structure.antiPatterns)}`;
}

/** [대화 이어 가기] 두 번째 답변부터의 규칙 */
function buildConversationFlow(shared: ChatbotPrompts["shared"]): string | null {
  if (!shared.conversationFlow?.length) return null;
  return `[대화 이어 가기]\n${bullets(shared.conversationFlow)}`;
}

/** [말투] 공통 높임·호칭 + 캐릭터 말투 */
function buildSpeech(shared: ChatbotPrompts["shared"], persona: Persona): string {
  const lines: string[] = [...Object.values(shared.speechBase ?? {}), `어조: ${persona.tone}`];
  const style = persona.speechStyle;
  if (style) {
    lines.push(...style.traits);
    const phrases = style.signaturePhrases.map((p) => `'${p}'`).join(", ");
    lines.push(`자주 쓰는 표현(매번 쓸 필요는 없음): ${phrases}`);
    lines.push(`이모지: ${style.emoji}`);
    if (style.length) lines.push(`길이: ${style.length}`);
  }
  return `[말투]\n${bullets(lines)}`;
}

/** [공통 원칙] 가드레일 + [캐릭터 금지선] */
function buildForbidden(shared: ChatbotPrompts["shared"], persona: Persona): string {
  const parts = [`[공통 원칙 — 반드시 지킬 것]\n${bullets(shared.guardrails)}`];
  if (persona.forbidden?.length) {
    parts.push(`[${persona.personaName}의 금지선]\n${bullets(persona.forbidden)}`);
  }
  return parts.join("\n\n");
}

/** [위기 대응] 단계 구분 + 위기 단계 응답 규칙 + 상담 자원 */
function buildCrisisSection(protocol: CrisisProtocol | undefined): string | null {
  if (!protocol) return null;
  const levels = protocol.levels.map((l) => `- ${l.label}: ${l.signals} → ${l.response}`).join("\n");
  return [
    `[위기 대응]\n${levels}`,
    `위기 단계 응답 규칙:\n${bullets(protocol.responseRules)}`,
    `상담 자원:\n${formatResources(protocol.resources)}`,
  ].join("\n\n");
}

/** [다른 상담사 연결] 다른 페르소나의 담당 범위(scope)로 안내 목록을 만든다 */
function buildDirectory(prompts: ChatbotPrompts, persona: Persona): string | null {
  const others = Object.values(prompts.personas).filter((p) => p.id !== persona.id && p.scope);
  if (others.length === 0) return null;
  const list = others.map((p) => `- ${p.personaName}(${p.label}): ${p.scope}`).join("\n");
  const own = persona.scope ? `나의 담당: ${persona.scope}\n` : "";
  return (
    `[다른 상담사 연결]\n${own}` +
    "담당 범위 안이면 그대로 답한다. 명백히 범위 밖일 때만 짧게 공감한 뒤 맞는 상담사를 안내한다.\n" +
    list
  );
}

/** [응답 예시] 말투·구조 참고용 예시 대화 */
function buildExamples(persona: Persona): string | null {
  const examples = persona.exampleDialogue;
  if (!examples?.length) return null;
  const body = examples
    .map((e) => {
      const turns = [{ user: e.user, assistant: e.assistant }, ...(e.followUp ?? [])];
      const lines = turns.map((t) => `사용자: ${t.user}\n${persona.personaName}: ${t.assistant}`);
      return `(예시 유형: ${e.exampleType})\n${lines.join("\n")}`;
    })
    .join("\n\n");
  return (
    "[응답 예시 — 말투·구조 참고용]\n" +
    "예시의 유형이 아니라 위 [사용자 성격 유형 정보]를 근거로 답한다. 예시 문장을 그대로 베끼지 않는다.\n\n" +
    body
  );
}

export interface BuildMessagesInput {
  prompts: ChatbotPrompts;
  personaId: string;
  profile: TypeProfile;
  /** 이전 대화 (system 제외). 가장 오래된 → 최신 순 */
  history?: ChatMessage[];
  userMessage: string;
  /** 관계 페르소나에서 상대 유형 궁합 정보 등 추가 컨텍스트(선택) */
  extraContext?: string;
  /** 코드 안전망(detectCrisis)이 이번 메시지에서 위기를 감지했는지 */
  crisisDetected?: boolean;
}

/**
 * 챗봇 요청용 OpenAI 호환 메시지 배열을 만든다.
 * 구조: [system(페르소나+규칙+유형컨텍스트+예시), ...history, user]
 * 안전 관련 지시는 앞(금지선·위기 대응)과 맨 끝(위기 감지 시 주의)에 함께 둔다.
 * 이전 대화가 있으면 위기 알림 바로 앞에 [이어지는 대화] 알림을 붙인다.
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const { prompts, personaId, profile, history = [], userMessage, extraContext, crisisDetected } = input;

  const persona = prompts.personas[personaId];
  if (!persona) {
    throw new Error(`알 수 없는 페르소나 id: ${personaId}`);
  }

  const { shared } = prompts;

  const injectedSections = buildInjectedSections(persona, profile);
  const typeContext = fillTemplate(shared.contextTemplate, {
    typeCode: profile.typeCode,
    nickname: profile.nickname,
    groupLabel: profile.groupLabel ?? "",
    cognitiveStack: (profile.cognitiveStack ?? []).join(", "),
    coreTraits: (profile.coreTraits ?? []).join(", "),
    injectedSections,
  });

  const styleText = Object.entries(shared.outputStyle)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const systemContent = [
    persona.systemPrompt,
    shared.rulePriority ? `[규칙 우선순위]\n${shared.rulePriority}` : null,
    buildResponseStructure(shared),
    buildConversationFlow(shared),
    buildSpeech(shared, persona),
    buildForbidden(shared, persona),
    buildCrisisSection(shared.crisisProtocol),
    buildDirectory(prompts, persona),
    `[출력 스타일]\n${styleText}`,
    typeContext,
    extraContext ? `[추가 참고 정보]\n${extraContext}` : null,
    buildExamples(persona),
    `[면책 — 화면에 고정 표시되므로 답변마다 반복하지 않는다]\n${shared.disclaimer}`,
    history.length > 0 ? FOLLOW_UP_NOTICE : null,
    crisisDetected ? CRISIS_NOTICE : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: systemContent },
    ...history,
    { role: "user", content: userMessage },
  ];
}

/** 페르소나의 추천 질문을 노출하기 위한 헬퍼 */
export function getStarterQuestions(prompts: ChatbotPrompts, personaId: string): string[] {
  return prompts.personas[personaId]?.starterQuestions ?? [];
}
