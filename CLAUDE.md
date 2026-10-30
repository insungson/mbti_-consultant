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
