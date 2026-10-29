// 검사 화면의 문항 순서·페이지 나누기. 순수 함수.
// 규칙의 근거: docs/plan/user_flow_spec.md §5.2 (고정 교차 순서, 한 페이지 6문항)

import type { Answers, Question, QuestionsFile } from "./types";

/**
 * presentation.order 를 perPage 개씩 끊어 문항 페이지 배열을 만든다.
 * order 가 문항 목록과 정확히 같은 집합이 아니면(누락·중복·모르는 id) throw.
 */
export function buildPages(file: QuestionsFile): Question[][] {
  const { order, perPage } = file.presentation;
  const byId = new Map(file.questions.map((q) => [q.id, q]));

  if (new Set(order).size !== order.length) {
    throw new Error("presentation.order 에 중복된 문항 id가 있습니다");
  }
  if (order.length !== byId.size) {
    throw new Error(`presentation.order 길이(${order.length})가 문항 수(${byId.size})와 다릅니다`);
  }
  if (!Number.isInteger(perPage) || perPage < 1) {
    throw new Error(`presentation.perPage 가 올바르지 않습니다: ${perPage}`);
  }

  const ordered = order.map((id) => {
    const q = byId.get(id);
    if (!q) throw new Error(`presentation.order 에 없는 문항 id: ${id}`);
    return q;
  });

  const pages: Question[][] = [];
  for (let i = 0; i < ordered.length; i += perPage) {
    pages.push(ordered.slice(i, i + perPage));
  }
  return pages;
}

/** 페이지의 모든 문항에 응답했는지 — [다음] 버튼 활성화 기준 */
export function isPageComplete(page: Question[], answers: Answers): boolean {
  return page.every((q) => answers[q.id] !== undefined);
}

/** 답한 문항 수 — 진행 막대·"{answered}문항까지 답했어요" 표시용 */
export function countAnswered(answers: Answers, file: QuestionsFile): number {
  return file.questions.filter((q) => answers[q.id] !== undefined).length;
}
