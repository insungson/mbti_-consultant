// 챗봇 진입점: 데이터 로딩 + 프롬프트 조립 + 폴백 호출을 한 번에.
// 서버 전용(파일시스템·API 키 사용). Next.js Route Handler / Server Action 에서 호출.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildMessages, getStarterQuestions } from "./buildPrompt";
import { chatWithFailover } from "./providerChain";
import { buildCrisisFallback, detectCrisis } from "./safety";
import type {
  ChatMessage,
  ChatResult,
  ChatbotPrompts,
  ProvidersFile,
  TypeProfile,
} from "./types";

/** data 디렉터리 경로. 앱 루트 기준. 환경에 따라 override 가능. */
const DATA_DIR = process.env.MBTI_DATA_DIR ?? join(process.cwd(), "data");

async function loadJson<T>(file: string): Promise<T> {
  const raw = await readFile(join(DATA_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

// 데이터는 프로세스 수명 동안 캐시(정적 JSON이므로 안전).
let _prompts: ChatbotPrompts | null = null;
let _providers: ProvidersFile | null = null;
let _profiles: Record<string, TypeProfile> | null = null;
let _compat: { matrix: Record<string, Record<string, unknown>> } | null = null;

async function getPrompts(): Promise<ChatbotPrompts> {
  return (_prompts ??= await loadJson<ChatbotPrompts>("chatbot-prompts.json"));
}
async function getProviders(): Promise<ProvidersFile> {
  return (_providers ??= await loadJson<ProvidersFile>("ai-providers.json"));
}
async function getProfiles(): Promise<Record<string, TypeProfile>> {
  if (!_profiles) {
    const file = await loadJson<{ profiles: Record<string, TypeProfile> }>("profiles.json");
    _profiles = file.profiles;
  }
  return _profiles;
}
async function getCompatibility() {
  return (_compat ??= await loadJson<{ matrix: Record<string, Record<string, unknown>> }>(
    "compatibility.json"
  ));
}

export interface GetAdviceInput {
  /** "growth" | "relationship" | "career" */
  personaId: string;
  /** 검사로 판별된 사용자 유형 코드 (예: "INTJ") */
  typeCode: string;
  /** 사용자의 이번 질문 */
  userMessage: string;
  /** 이전 대화 (system 제외) */
  history?: ChatMessage[];
  /** 관계 상담 시 상대 유형(선택) → 궁합 컨텍스트 주입 */
  partnerTypeCode?: string;
}

/**
 * 메인 진입점: 유형 프로필을 컨텍스트로 주입해 페르소나 챗봇 답변을 생성한다.
 * 무료 모델 폴백 체인을 통해 호출한다.
 * 위기 키워드가 감지되면 result.safety 로 알리고, 모든 제공자가 실패해도 고정 안내 문구를 반환한다.
 */
export async function getAdvice(input: GetAdviceInput): Promise<ChatResult> {
  const { personaId, typeCode, userMessage, history = [], partnerTypeCode } = input;

  const [prompts, providers, profiles] = await Promise.all([
    getPrompts(),
    getProviders(),
    getProfiles(),
  ]);

  const profile = profiles[typeCode];
  if (!profile) throw new Error(`알 수 없는 유형 코드: ${typeCode}`);

  const persona = prompts.personas[personaId];
  if (!persona) throw new Error(`알 수 없는 페르소나 id: ${personaId}`);

  // 관계 페르소나 + 상대 유형 지정 시 궁합 데이터를 추가 컨텍스트로.
  let extraContext: string | undefined;
  if (persona.needsCompatibility && partnerTypeCode) {
    const compat = await getCompatibility();
    const cell = compat.matrix?.[typeCode]?.[partnerTypeCode];
    if (cell) {
      extraContext = `사용자(${typeCode})와 상대(${partnerTypeCode})의 궁합 데이터:\n${JSON.stringify(
        cell,
        null,
        2
      )}`;
    }
  }

  // 코드 레벨 안전망: 프롬프트 지시와 별개로 위기 키워드를 직접 검사한다.
  const protocol = prompts.shared.crisisProtocol;
  const matched = protocol ? detectCrisis(userMessage, protocol.keywords) : [];
  const crisis = matched.length > 0;
  const safety: ChatResult["safety"] = protocol
    ? { crisis, matched, resources: crisis ? protocol.resources : [] }
    : undefined;

  const messages = buildMessages({
    prompts,
    personaId,
    profile,
    history,
    userMessage,
    extraContext,
    crisisDetected: crisis,
  });

  try {
    const result = await chatWithFailover(messages, providers);
    return { ...result, safety };
  } catch (e) {
    // 위기 상황에서는 오류로 끝내지 않고 고정 안내 문구와 상담 자원을 반드시 돌려준다.
    if (crisis && protocol) {
      return {
        content: buildCrisisFallback(protocol),
        providerId: "fallback",
        model: "none",
        attempts: [],
        safety,
      };
    }
    throw e;
  }
}

/** 페르소나 진입 시 보여줄 추천 질문 목록 */
export async function listStarterQuestions(personaId: string): Promise<string[]> {
  const prompts = await getPrompts();
  return getStarterQuestions(prompts, personaId);
}

/** 사용 가능한 페르소나 메타(이름·라벨·담당 범위·인사말) 목록 — 상담 허브·대화 헤더 구성용 */
export async function listPersonas(): Promise<
  { id: string; personaName: string; label: string; role: string; scope?: string; greeting?: string }[]
> {
  const prompts = await getPrompts();
  return Object.values(prompts.personas).map((p) => ({
    id: p.id,
    personaName: p.personaName,
    label: p.label,
    role: p.role,
    scope: p.scope,
    greeting: p.greeting,
  }));
}

export { buildMessages, chatWithFailover, detectCrisis };
export type { GetAdviceInput as _GetAdviceInput };
