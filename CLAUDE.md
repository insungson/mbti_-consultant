# 16가지 성격 유형 검사 서비스

## 프로젝트 개요
16personalities.com과 유사한 무료 성격 유형 검사 서비스.
사전 제작된 데이터(JSON) 기반으로 검사 및 결과를 제공한다.

## 언어
- 모든 콘텐츠: 한국어
- 코드/변수명: 영어

## 데이터 구조 (`data/`)
| 파일 | 설명 |
|------|------|
| `questions.json` | 60문항 질문지 (7점 리커트 척도) |
| `scoring.json` | 점수 산출 규칙 (축별 매핑, 계산 로직) |
| `profiles.json` | 16유형 상세 프로필 |
| `compatibility.json` | 16×16 궁합 매트릭스 |
| `famous-people.json` | 유형별 유명인 데이터 |

## 커스텀 에이전트
- `.claude/agents/mbti-psychologist.md` — 심리학자 에이전트 (콘텐츠 생성 전용)

## 용어 규칙
- "MBTI" 상표 직접 사용 지양 → "성격 유형 검사", "16가지 성격 유형" 표현 사용
- 각 유형은 동등한 가치를 가짐 (우열 없음)
- 융의 인지기능 이론 기반 (Se/Si/Ne/Ni/Te/Ti/Fe/Fi)

## 디자인 (1차 확정, 2026-10-30)
- 기준 문서: `docs/design/README.md` → `docs/design/design_spec.md` 먼저 읽기
- 세계관: 마음 정원 (가칭 서비스명 '피어나'), 글꼴 고운바탕(제목)·고운돋움(본문)
- 토큰: `docs/design/tokens.json` / 시안 이미지: `docs/design/mockups/round2/*.png`
- 16유형 꽃 이름(`docs/design/type_naming.md`)은 초안 — 확정 전에는 데이터의 별칭을 바꾸지 않는다

## 아키텍처 (2026-11-22 확정)
- 기준 문서: `docs/plan/architecture.md`. 1~3단계(웹 · API 서버 · 맥미니 출시)를 먼저 끝내고, 4~6단계(앱 · 커뮤니티 · 유료)는 그 뒤에 계획한다
- 맥미니 홈서버 + Cloudflare Tunnel, 웹은 Next.js, API는 Hono(bun). 검사·리포트는 API 없이 동작하고, 상담 프롬프트는 서버에만 둔다(평가와 같은 `buildMessages()`)
- 상담 내용은 서버·로그에 남기지 않는다. API 계약은 `/v1` + OpenAPI이며 응답을 깨지 않는다(앱 대비 규칙: architecture.md §6)

## 상담 평가 (어느 AI 도구에서든 같은 기준)
- 절차·기준 원본: `evals/chatbot/README.md`, 채점표와 세부 기준: `evals/chatbot/rubric.json`
- 실행: `bun scripts/run_chat_eval.ts` (Claude·Codex·연결 명령) / 자동 점검: `python3 scripts/check_chat_replies.py`
- 스킬: `.agents/skills/chat-eval/` (Claude Code는 `.claude/skills/chat-eval` 링크로 같은 파일을 읽는다)
- 평가 세트·채점표·점검 스크립트·모델 답변을 결과에 맞춰 고치지 않는다. 전체 실행은 사용자가 요청하고 모델을 정했을 때만 한다
