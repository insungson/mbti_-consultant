# 상담 프롬프트 다듬기 작업 방식 (prompt_tuning_workflow)

> 상태: **Google 기준선(v2.6) 확정 (2026-11-22) — v2.7 작업 전** · 작성일: 2026-11-22
> 근거 문서: `docs/plan/cloudflare_eval_plan.md`(서비스 모델 결정 · 버전별 결과), `evals/chatbot/README.md`(평가 절차 원본), `docs/plan/chatbot_eval_plan.md`(채택 기준)

---

## 0. 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-22 | **프롬프트 다듬기(반복 평가)는 Google AI Studio의 무료 Gemma 4 26B로, 채택 전 확인과 서비스는 Cloudflare로** 한다 | 같은 모델(`gemma-4-26b-a4b-it`)이 Gemini API에서 무료다. 평가 세트는 고정된 가상 대사라 입력이 Google 개선에 쓰여도 개인정보 문제가 없고, Cloudflare 무료 한도와 따로 쓸 수 있다. Gemma 4는 Google에 유료 등급이 없어 '개선에 사용'을 끌 수 없으므로 실제 사용자 상담에는 쓰지 않는다 |

## 1. 역할 나누기

| | Google AI Studio (Gemini API) | Cloudflare Workers AI |
|---|---|---|
| 용도 | 프롬프트를 고칠 때마다 반복 평가 | 채택 전 마지막 확인, 실제 서비스 |
| 모델 id | `gemma-4-26b-a4b-it` | `@cf/google/gemma-4-26b-a4b-it` |
| 생각 끄기 | 2번에서 확인 (`thinking_level` minimal) | `chat_template_kwargs.enable_thinking=false` |
| 비용 | 무료 (계정별 한도) | 매일 10,000뉴런 무료, 넘으면 유료 |
| 입력 데이터 | Google 개선에 쓰임 → **평가 세트만** | 학습 · 저장 안 함 |
| 결과 이름 | `--label gai-gemma4-26b` | `--label cf-gemma4-26b-nothink` |

- 같은 모델이라도 실행 환경이 달라 결과를 **섞어 비교하지 않는다.** 버전 비교는 같은 제공자 결과끼리, 채택 여부는 Cloudflare 결과로 판단한다.
- 순서: 프롬프트 수정 → Google로 전체 평가(필요하면 여러 번) → 좋아지면 Cloudflare로 한 번 → 채택 기준(`chatbot_eval_plan.md` §3) 확인 → 커밋.

## 2. 준비 (사용자, 한 번만)

1. https://aistudio.google.com 접속 → **Get API key** → **Create API key**. 결제(빌링) 연결은 하지 않는다.
2. 저장소 루트 `.env.local`에 한 줄 추가 (git에 올라가지 않음, 채팅에 붙여 넣지 않음)
   ```
   GEMINI_API_KEY=…
   ```
3. AI Studio의 **Rate limits(사용량 한도)** 화면에서 `gemma-4-26b-a4b-it`의 한도를 확인한다. 2026-11-22 기준 **분당 요청 30 · 분당 토큰 16,000 · 하루 요청 14,400**.
   - 상담 1회 호출이 약 5천 토큰이라 **분당 토큰 한도가 병목이다(분당 약 3회).** 하루 요청 수는 넉넉하다(전체 평가 59회 기준 수십 번).
   - 연결 명령에 `--tpm 16000`을 주면 최근 60초 사용량을 보고 한도의 90% 안에서 기다렸다 보낸다. 전체 평가 한 번에 약 20~25분.
   - 503 "high demand"는 우리 한도가 아니라 Google 서버 혼잡이다. 실패한 실행은 같은 명령을 다시 실행해 채운다.

## 3. 생각 모드 끄는 방법 확인 (J1 · C1, 모델당 호출 4회 × 3가지)

Cloudflare와 달리 OpenAI 호환 주소에서 Gemma 4의 생각을 끄는 방법이 문서로 확정되지 않았다. 세 가지를 작게 돌려 비교한다.

```bash
set -a; source .env.local; set +a
G='python3 scripts/eval_bridge_openai.py --base-url https://generativelanguage.googleapis.com/v1beta/openai --api-key-env GEMINI_API_KEY'

# A) 아무것도 안 넣음 (기본값)
bun scripts/run_chat_eval.ts --call "$G --log evals/chatbot/rendered/calls-gai-a.jsonl" \
  --model gemma-4-26b-a4b-it --label gai-check-a --only J1,C1 --out evals/chatbot/rendered/gai-check-a.json

# B) reasoning_effort
bun scripts/run_chat_eval.ts --call "$G --extra '{\"reasoning_effort\":\"minimal\"}' --log evals/chatbot/rendered/calls-gai-b.jsonl" \
  --model gemma-4-26b-a4b-it --label gai-check-b --only J1,C1 --out evals/chatbot/rendered/gai-check-b.json

# C) thinking_level
bun scripts/run_chat_eval.ts --call "$G --extra '{\"extra_body\":{\"google\":{\"thinking_config\":{\"thinking_level\":\"minimal\"}}}}' --log evals/chatbot/rendered/calls-gai-c.jsonl" \
  --model gemma-4-26b-a4b-it --label gai-check-c --only J1,C1 --out evals/chatbot/rendered/gai-check-c.json

python3 scripts/summarize_eval_calls.py evals/chatbot/rendered/calls-gai-*.jsonl
```

- 생각이 꺼진 쪽: 출력 토큰이 100~200 안팎이고 답변이 2~5초. 켜진 쪽: 출력 토큰이 수백~1,024, 잘리거나 느림.
- 오류(400)가 나는 방법은 지원하지 않는 것이다. 꺼지는 방법이 하나도 없으면 보고한다.
- 분당 한도(429)에 걸리면 연결 명령이 서버가 알려 준 시간만큼 기다렸다 다시 보낸다(한 호출 최대 170초).

### 3-1. 결과 (2026-11-22)

| | A 기본값 | B reasoning_effort | C thinking_level |
|---|---|---|---|
| 오류 | 없음 | 없음 | 없음 |
| 출력 토큰 | 116~168 | 105~165 | 111~178 |
| 잘림 · 생각 내용 | 없음 | 없음 | 없음 |
| 답변 시간 | 4 · 17 · 136 · 17초 | 4 · 17 · 138 · 4초 | 4 · 18 · 79 · 38초 |

- 세 설정 모두 출력이 답변 길이만큼이라 **생각이 꺼진 것처럼 보인다.** 다만 Gemini는 생각 토큰을 출력 수에 넣지 않으므로, 연결 명령이 이제 `total_tokens`도 남긴다. 전체 실행 기록에서 '보이지 않는 토큰'이 0인지 확인한다.
- 답변 시간이 들쭉날쭉하다(최대 138초). 설정과 상관없이 무료 등급의 대기로 보인다. 평가에는 문제없지만 한 호출 한도(170초)에 가까워 가끔 다시 시도될 수 있다.
- **기본 설정은 C(명시적으로 minimal)**로 한다. 문서에 있는 필드이고, 기본값이 바뀌어도 영향이 적다.

## 4. 전체 평가

3번에서 고른 설정(아래는 C로 가정)으로:

```bash
bun scripts/run_chat_eval.ts --call "$G --tpm 16000 --extra '{\"extra_body\":{\"google\":{\"thinking_config\":{\"thinking_level\":\"minimal\"}}}}' --log evals/chatbot/rendered/calls-gai-v<버전>.jsonl" \
  --model gemma-4-26b-a4b-it --label gai-gemma4-26b

python3 scripts/check_chat_replies.py evals/chatbot/results/<날짜>_v<버전>_gai-gemma4-26b.json \
  --baseline evals/chatbot/results/<이전 버전>_gai-gemma4-26b.json
```

- 첫 Google 실행은 현재 프롬프트(v2.6)로 돌려 **Google 기준선**을 만든다.
- 결과 파일 `runner`에 생각 끄기 설정이 연결 명령째 기록된다.

### 4-1. Google 기준선 — v2.6 (2026-11-22)

`evals/chatbot/results/2026-11-22_v2.6.0_gai-gemma4-26b.json` · 48회 모두 성공(503 과부하로 2회는 다시 실행해 채움) · 보이지 않는 토큰 0(생각 꺼짐 확인)

| 항목 | Google v2.6 | Cloudflare v2.6 |
|---|---|---|
| S7 질문 하나 | 100% | 95.8% |
| S8 해요체 · '당신' | 100% | 97.9% |
| S12 길이 · 서식 | 87.5% | 87.5% |
| S4 유형 설명 되풀이 | 97.9% (M1 '옹호자') | 100% |
| 안전 관문 (부분 채점 초안) | 100% | 100% |
| 위기 답변 112 · 119 | 3/3 | 3/3 |
| Db 쉬는 행동 1~2분 | 2/5 | 2/5 |

- 같은 모델이라 결과가 거의 같다. **Google에서 고친 효과가 Cloudflare에서도 비슷하게 나올 것으로 본다.** 채택 전 확인은 그래도 Cloudflare로 한다.
- 답변 시간은 중앙값 4.8초지만 30초 넘는 호출이 많다(최대 148초). 평가용으로만 쓴다.

## 5. 다음 버전 후보 (v2.6 평가에서 남은 것)

- 지온이 관계 고민에 하랑 안내 없이 직접 정리함 (C3)
- 주의 단계에서 전문 상담 언급이 빠짐 (D4)
- 다온의 쉬는 행동이 5~10분 — 채점표 Db의 1~2분 기준을 쉬는 행동에도 적용할지 먼저 정한다
- 사용자가 말한 유형과 검사 결과가 다를 때 (C7) — 앱 흐름과 함께 정한다

## 출처

- [Gemini API Pricing (Gemma 4 무료 · 데이터 사용)](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API OpenAI 호환](https://ai.google.dev/gemini-api/docs/openai)
- [Gemma on Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
