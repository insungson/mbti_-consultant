// 검사 진입점: 문항 페이지 나누기 + 채점·유형 판정.
// 프레임워크 무관 순수 모듈. 데이터(questions.json·scoring.json)는 호출 측에서 import 해 넘긴다.

export { buildPages, countAnswered, isPageComplete } from "./order";
export {
  findTies,
  resolveResult,
  scoreAxes,
  selfSelectedResult,
  tieBreakersFor,
  toDisplayRatio,
} from "./scoring";
export type { ResolveResultInput } from "./scoring";
export type * from "./types";
