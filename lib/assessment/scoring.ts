// 검사 채점: 축 합계 → 동점 확인 → 유형 판정. 순수 함수.
// 규칙의 근거: data/scoring.json, docs/plan/user_flow_spec.md §6

import type {
  Answers,
  AssessmentResult,
  AxisKey,
  AxisResult,
  QuestionsFile,
  ScoringFile,
  TieBreakAnswers,
  TieBreaker,
} from "./types";

/** 유형 코드의 글자 순서 */
const AXIS_ORDER: AxisKey[] = ["EI", "SN", "TF", "JP"];
const SCALE_MIN = 1;
const SCALE_MAX = 7;
/** scoring.json 에 borderline 이 없을 때의 경계 기준(%) */
const DEFAULT_BORDERLINE_PERCENTAGE = 10;

/**
 * 축별 중심화 합계를 낸다. 양수면 첫 번째 극(E·S·T·J), 음수면 두 번째 극.
 * 응답이 빠졌거나 1~7 정수가 아니면 throw.
 */
export function scoreAxes(
  answers: Answers,
  questionsFile: QuestionsFile,
  scoringFile: ScoringFile
): Record<AxisKey, number> {
  const byId = new Map(questionsFile.questions.map((q) => [q.id, q]));
  const sums = {} as Record<AxisKey, number>;

  for (const axis of AXIS_ORDER) {
    const { poles, questionIds } = scoringFile.axes[axis];
    let sum = 0;
    for (const id of questionIds) {
      const q = byId.get(id);
      if (!q) throw new Error(`scoring.json 의 문항이 questions.json 에 없음: ${id}`);
      if (!poles.includes(q.direction)) {
        throw new Error(`문항 ${id} 의 direction(${q.direction})이 ${axis} 축의 극이 아님`);
      }
      const value = answers[id];
      if (value === undefined) throw new Error(`응답 누락: ${id}`);
      if (!Number.isInteger(value) || value < SCALE_MIN || value > SCALE_MAX) {
        throw new Error(`응답 값이 ${SCALE_MIN}~${SCALE_MAX} 정수가 아님: ${id}=${value}`);
      }
      // 동의할수록 첫 번째 극 쪽이면 +1. 역채점 문항은 부호를 뒤집는다.
      const towardFirst = q.direction === poles[0] ? 1 : -1;
      const sign = q.reverseScored ? -towardFirst : towardFirst;
      sum += (value - scoringFile.centerValue) * sign;
    }
    sums[axis] = sum;
  }
  return sums;
}

/** 합계가 0이라 추가 질문이 필요한 축 */
export function findTies(sums: Record<AxisKey, number>): AxisKey[] {
  return AXIS_ORDER.filter((axis) => sums[axis] === 0);
}

/** 동점 축에 보여 줄 2지선다 문항. 축에 맞는 문항이 없으면 throw */
export function tieBreakersFor(axes: AxisKey[], questionsFile: QuestionsFile): TieBreaker[] {
  return axes.map((axis) => {
    const tb = questionsFile.tieBreakers?.find((t) => t.axis === axis);
    if (!tb) throw new Error(`questions.json 에 ${axis} 축 동점 질문이 없음`);
    return tb;
  });
}

export interface ResolveResultInput {
  answers: Answers;
  /** 동점 축에서 고른 극. 동점이 아닌 축의 값은 무시한다 */
  tieBreaks?: TieBreakAnswers;
  questionsFile: QuestionsFile;
  scoringFile: ScoringFile;
  /** 저장 시각 (ISO 8601). 순수성을 위해 호출 측에서 넘긴다 */
  completedAt: string;
}

/**
 * 응답으로 유형을 판정한다.
 * 합계 0인 축은 tieBreaks 의 극으로 정하고(합계·강도는 0 유지, tieBroken=true),
 * 그 축의 tieBreaks 가 없거나 그 축의 극이 아니면 throw.
 */
export function resolveResult(input: ResolveResultInput): AssessmentResult {
  const { answers, tieBreaks = {}, questionsFile, scoringFile, completedAt } = input;
  const sums = scoreAxes(answers, questionsFile, scoringFile);
  const borderlineMax = scoringFile.borderline?.maxPercentage ?? DEFAULT_BORDERLINE_PERCENTAGE;

  const axes = {} as Record<AxisKey, AxisResult>;
  for (const axis of AXIS_ORDER) {
    const { poles, maxScore } = scoringFile.axes[axis];
    const score = sums[axis];
    let pole = score > 0 ? poles[0] : poles[1];
    const tieBroken = score === 0;
    if (tieBroken) {
      const picked = tieBreaks[axis];
      if (!picked) throw new Error(`동점 축에 추가 질문 응답이 없음: ${axis}`);
      if (!poles.includes(picked)) throw new Error(`${axis} 축의 극이 아님: ${picked}`);
      pole = picked;
    }
    const percentage = Math.round((Math.abs(score) / maxScore) * 100);
    axes[axis] = { pole, score, percentage, borderline: percentage < borderlineMax, tieBroken };
  }

  return {
    typeCode: AXIS_ORDER.map((axis) => axes[axis].pole).join(""),
    source: "test",
    scoringVersion: scoringFile._meta.version,
    axes,
    completedAt,
  };
}

/** 유형 직접 선택 결과. 16유형 코드가 아니면 throw */
export function selfSelectedResult(
  typeCode: string,
  scoringFile: ScoringFile,
  completedAt: string
): AssessmentResult {
  const code = typeCode.toUpperCase();
  const valid =
    code.length === AXIS_ORDER.length &&
    AXIS_ORDER.every((axis, i) => (scoringFile.axes[axis].poles as string[]).includes(code[i]));
  if (!valid) throw new Error(`알 수 없는 유형 코드: ${typeCode}`);
  return { typeCode: code, source: "self", scoringVersion: scoringFile._meta.version, completedAt };
}

/**
 * 스펙트럼 막대 표시 비율 (report-sections.json axes.displayRule).
 * 우세 쪽 = 50 + 강도 ÷ 2 (반올림), 반대쪽 = 100 - 우세 쪽.
 */
export function toDisplayRatio(percentage: number): { dominant: number; opposite: number } {
  const dominant = Math.round(50 + percentage / 2);
  return { dominant, opposite: 100 - dominant };
}
