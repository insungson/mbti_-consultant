// 성격 유형 챗봇 - 공통 타입 정의
// 프레임워크 무관. 앱(Next.js) 도입 후 API 라우트/서버 액션에서 그대로 import.

/** OpenAI 호환 채팅 메시지 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 응답 구조(인정 → 탐색 → 격려 → 안전)의 한 단계 */
export interface ResponseStep {
  id: string;
  label: string;
  rule: string;
}

/** 위기 시 안내하는 상담 자원 */
export interface CrisisResource {
  name: string;
  contact: string;
  use: string;
  audience?: string;
  hours?: string;
  /** UI에서 바로 연결할 링크 정보 (tel:/sms:). 프롬프트에는 contact 문자열만 쓴다 */
  actions?: { type: "tel" | "sms"; value: string; label: string }[];
}

/** data/chatbot-prompts.json 의 shared.crisisProtocol */
export interface CrisisProtocol {
  levels: { id: string; label: string; signals: string; response: string }[];
  responseRules: string[];
  /** 코드 레벨 안전망용 키워드 (오탐을 줄이려 좁게 유지) */
  keywords: string[];
  resources: CrisisResource[];
  /** 위기 감지 + 모든 AI 제공자 실패 시 내보내는 고정 문구 */
  fallbackMessage: string;
}

/** 캐릭터별 말투 */
export interface SpeechStyle {
  traits: string[];
  signaturePhrases: string[];
  emoji: string;
  /** 캐릭터별 답변 길이 (outputStyle.length 보다 우선) */
  length?: string;
}

/** 말투·구조 참고용 예시 대화 */
export interface ExampleDialogue {
  /** 예시에 쓴 유형 코드 (실제 사용자 유형과 혼동하지 않도록 프롬프트에 명시) */
  exampleType: string;
  user: string;
  assistant: string;
  /** 이어지는 대화 예시 (두 번째 답변부터의 반응을 보여 준다) */
  followUp?: { user: string; assistant: string }[];
}

/** data/chatbot-prompts.json 의 personas[*] 한 개 */
export interface Persona {
  id: string;
  label: string;
  personaName: string;
  role: string;
  tone: string;
  systemPrompt: string;
  /** profiles.json 프로필에서 컨텍스트로 주입할 필드 키들 */
  injectFields: string[];
  /** true면 관계 답변 시 compatibility.json 도 참조 */
  needsCompatibility?: boolean;
  starterQuestions: string[];
  /** 대화 화면 첫 말풍선용 정적 인사말. UI 전용이며 모델에 보내지 않는다. {nickname} 치환 */
  greeting?: string;
  /** 담당 범위. 다른 페르소나의 [다른 상담사 연결] 안내에도 쓰인다 */
  scope?: string;
  speechStyle?: SpeechStyle;
  /** 캐릭터 금지선 */
  forbidden?: string[];
  exampleDialogue?: ExampleDialogue[];
}

/** data/chatbot-prompts.json 전체 */
export interface ChatbotPrompts {
  _meta: Record<string, unknown>;
  shared: {
    guardrails: string[];
    outputStyle: Record<string, string>;
    contextTemplate: string;
    disclaimer: string;
    /** 규칙 충돌 시 우선순위 */
    rulePriority?: string;
    responseStructure?: { steps: ResponseStep[]; antiPatterns: string[] };
    /** 두 번째 답변부터의 대화 규칙 (거절·반박·반복 대응) */
    conversationFlow?: string[];
    /** 공통 높임·호칭 규칙 */
    speechBase?: Record<string, string>;
    crisisProtocol?: CrisisProtocol;
  };
  personas: Record<string, Persona>;
}

/** profiles.json 의 한 유형 프로필 (필요한 필드만 느슨하게 타이핑) */
export interface TypeProfile {
  typeCode: string;
  nickname: string;
  group?: string;
  groupLabel?: string;
  cognitiveStack?: string[];
  coreTraits?: string[];
  // injectFields 로 참조되는 가변 섹션들 (growthAdvice, relationships, careers, strengths, weaknesses ...)
  [key: string]: unknown;
}

/** data/ai-providers.json 의 providers[*] 한 개 */
export interface ProviderConfig {
  id: string;
  label: string;
  priority: number;
  enabled: boolean;
  model: string;
  baseURL: string;
  apiKeyEnv: string;
  format: "openai-compatible";
  extraHeaders?: Record<string, string>;
}

/** data/ai-providers.json 전체 */
export interface ProvidersFile {
  _meta: Record<string, unknown>;
  strategy: "failover";
  request: {
    path: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
  failoverOn: {
    statusCodes: number[];
    errorKeywords: string[];
  };
  providers: ProviderConfig[];
}

/** 폴백 호출 결과 */
export interface ChatResult {
  content: string;
  /** 실제 응답을 만든 제공자 id */
  providerId: string;
  model: string;
  /** 시도했지만 실패/건너뛴 제공자 기록 (디버깅용) */
  attempts: { providerId: string; skipped?: boolean; error?: string }[];
  /** 답변을 만든 프롬프트 버전 (chatbot-prompts.json _meta.version). 평가 결과·운영 신호를 버전별로 묶는 데 쓴다 */
  promptVersion?: string;
  /** 코드 레벨 위기 감지 결과. UI는 crisis=true면 모델 응답과 별개로 고정 위기 안내를 띄운다 */
  safety?: {
    crisis: boolean;
    /** 감지된 키워드 */
    matched: string[];
    /** crisis=true일 때만 채워진다 */
    resources: CrisisResource[];
  };
}
