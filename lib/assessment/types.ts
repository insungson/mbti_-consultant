// 성격 유형 검사 - 공통 타입 정의
// 프레임워크 무관. 검사 화면(브라우저)과 서버 어디서든 import. 데이터는 인자로 받는다.

export type AxisKey = "EI" | "SN" | "TF" | "JP";
export type Pole = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";

/** 문항 id → 응답 값(1~7) */
export type Answers = Record<string, number>;

/** 동점 축 → 추가 질문에서 고른 극 */
export type TieBreakAnswers = Partial<Record<AxisKey, Pole>>;

/** data/questions.json 의 questions[*] 한 개 */
export interface Question {
  id: string;
  axis: AxisKey;
  /** 동의할수록 기우는 극. reverseScored 가 true면 반대 극으로 센다 */
  direction: Pole;
  type?: string;
  text_ko: string;
  category?: string;
  reverseScored: boolean;
}

/** 동점 해소용 2지선다 문항 (data/questions.json 의 tieBreakers[*]) */
export interface TieBreaker {
  id: string;
  axis: AxisKey;
  text_ko: string;
  /** [첫 번째 극, 두 번째 극] 순서로 고정 */
  options: { pole: Pole; text_ko: string }[];
}

/** data/questions.json 전체 (필요한 필드만) */
export interface QuestionsFile {
  _meta: { version: string; [key: string]: unknown };
  instructions: { text_ko: string; scale: { value: number; label: string }[] };
  /** 화면 표시 순서. order 를 perPage 개씩 끊어 한 페이지로 쓴다 */
  presentation: { perPage: number; rule: string; order: string[] };
  questions: Question[];
  tieBreakers?: TieBreaker[];
}

/** data/scoring.json 전체 (필요한 필드만) */
export interface ScoringFile {
  _meta: { version: string; [key: string]: unknown };
  centerValue: number;
  axes: Record<AxisKey, { poles: [Pole, Pole]; questionIds: string[]; maxScore: number }>;
  /** 강도가 maxPercentage 미만이면 경계(borderline)로 표시 */
  borderline?: { maxPercentage: number };
}

/** 한 축의 판정 결과 */
export interface AxisResult {
  pole: Pole;
  /** 중심화 합계 (-maxScore ~ +maxScore). 양수면 첫 번째 극 */
  score: number;
  /** 강도 0~100 (|score| ÷ maxScore × 100, 반올림) */
  percentage: number;
  /** 강도가 경계 기준 미만이면 true → "두 성향이 비슷하게 섞여 있어요" */
  borderline: boolean;
  /** 합계 0이라 추가 질문으로 정했으면 true */
  tieBroken: boolean;
}

/** 기기에 저장하는 검사 결과 (docs/plan/user_flow_spec.md §6.4) */
export interface AssessmentResult {
  typeCode: string;
  /** test: 검사로 판정 / self: 유형 직접 선택 */
  source: "test" | "self";
  /** 판정에 쓴 scoring.json 버전 */
  scoringVersion: string;
  /** source 가 test 일 때만 있다 */
  axes?: Record<AxisKey, AxisResult>;
  completedAt: string;
}
