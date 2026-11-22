# 시스템 아키텍처 (architecture)

> 상태: **1~3단계 확정 · 4~6단계는 1~3단계 완료 뒤 계획** · 작성일: 2026-11-22
> 근거 문서: `docs/plan/user_flow_spec.md`(§10.5 오류·한도, §10.6 대화 저장·전송, §11 저장·개인정보, §15 미결), `docs/plan/chatbot_eval_plan.md`(§5 아키텍처 결정 뒤 정할 것), `docs/plan/cloudflare_eval_plan.md`(§0 서비스 모델), `docs/plan/prompt_tuning_workflow.md`(§0 평가 전용 제공자)

---

## 0. 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-22 | 웹(Next.js)과 **API 서버를 나눈다.** API는 웹과 앱이 같이 쓰는 하나의 계약이다 | 앱(KMP)과 커뮤니티로 넓히려면 키·사용 한도·DB를 한곳에서 관리해야 한다. 웹 안의 기능만으로는 앱이 쓰기 어렵다 |
| 2026-11-22 | 웹과 API를 모두 **맥미니 홈서버**에서 돌린다. 도메인은 따로 산다 | 사용자 결정 |
| 2026-11-22 | 외부 연결은 **Cloudflare Tunnel**로 한다. 공유기 포트를 열지 않는다 | 집 IP가 드러나지 않고, 공인 IP가 바뀌어도 상관없다. HTTPS 인증서와 공격 차단을 무료로 받는다. 통신사가 80번 포트를 막아도 영향이 없다 |
| 2026-11-22 | API 서버는 **Hono**(TypeScript, bun으로 실행)로 만든다 | 평가 스크립트와 같은 프롬프트 조립 코드(`buildMessages()`)를 그대로 쓴다(§3 원칙 3). KMP 앱까지 고려해도 막히는 곳이 없다(§6) |
| 2026-11-22 | **1~3단계(웹 · API · 맥미니 출시)를 견고하게 만든다.** 4~6단계(앱 · 커뮤니티 · 유료)는 1~3단계가 모두 끝난 뒤 계획한다 | 사용자 결정. 지금은 1~3단계가 4~6단계로 넘어가기 쉽게 만들어 두기만 한다(§6) |
| 2026-11-22 | 서버 쪽 사용 한도는 **API 서버의 SQLite 카운터**로 집행한다. 수치는 2단계에서 정한다 | 서버가 한 대라 별도 저장소가 필요 없다. 카운터에는 대화 내용을 넣지 않는다(`user_flow_spec.md` §15의 미결 항목) |

## 1. 단계

| # | 단계 | 상태 |
|---|---|---|
| 1 | 모노레포 뼈대 + 웹 검사·리포트 (API 없이 동작. 화면은 Claude 데스크탑에서 함께 조정, `user_flow_spec.md` §14) | **확정** |
| 2 | API 서버(Hono) + 상담 연결 | **확정** |
| 3 | 맥미니 서버 구성(도메인 · Tunnel) + 출시 준비 | **확정** |
| 4 | 앱 (KMP Android · iOS) | 1~3단계가 끝난 뒤 계획 |
| 5 | 커뮤니티 | 1~3단계가 끝난 뒤 계획 |
| 6 | 유료 | 1~3단계가 끝난 뒤 계획 |

각 단계는 한 항목씩 계획서를 만들고, 검토한 뒤 진행한다.

## 2. 구조 (1~3단계)

```
 [웹 브라우저]                    ([앱: 4단계에 같은 API 사용])
        └──────────── HTTPS (내 도메인) ────────────┘
                Cloudflare (DNS · HTTPS · 캐시 · 공격 차단, 무료)
                       │  Cloudflare Tunnel (포트 안 엶)
 ┌─────────────── 맥미니 홈서버 ─────────────────────┐
 │ cloudflared → example.com       → Next.js 웹     │
 │               example.com/api/* → API (Hono · Bun)
 │                                   ├ /api/v1/chat → Workers AI (Gemma 4 26B)
 │                                   └ 사용 한도: SQLite 카운터(내용 없음) + Turnstile
 └─────────────────────────────────────────────────┘
 콘텐츠 원본 data/*.json → 웹 빌드에 포함 / 상담 프롬프트는 API만 읽음
```

- 상담 모델은 맥미니에서 돌리지 않는다. 맥미니의 API 서버가 Cloudflare Workers AI를 OpenAI 호환 방식으로 부른다(평가 때와 같은 방식, `cloudflare_eval_plan.md` §0).
- 웹과 API가 같은 도메인을 쓴다(`/api/*`). 그래서 CORS 설정이 필요 없다.

## 3. 원칙

1. **검사·리포트는 API를 부르지 않는다.**
   - 정적 데이터와 기기 안 채점(`lib/assessment`)으로 돈다.
   - 집 서버가 잠깐 멈춰도 Cloudflare 캐시로 보인다.
   - AI나 API가 멈춰도 무료 유입 흐름이 끊기지 않는다.
   - 나중에 웹만 정적 호스팅으로 옮기기도 쉽다.
2. **API는 클라이언트와 상관없는 하나의 계약이다.** `/v1`을 붙이고 OpenAPI로 정의한다. 웹 전용 BFF(웹만을 위한 중간 서버)는 만들지 않는다.
3. **상담 프롬프트는 서버에만 둔다.**
   - 평가 스크립트(`scripts/run_chat_eval.ts`)와 API가 같은 `buildMessages()`(`lib/chatbot/buildPrompt.ts`)를 쓴다. 그래서 평가한 프롬프트가 곧 서비스 프롬프트다.
   - 프롬프트를 바꿔도 앱을 다시 배포할 필요가 없다.
4. **상담 내용은 서버에 저장하지 않는다.** 서버 로그에도 메시지 본문을 남기지 않는다(`user_flow_spec.md` §10.6 · §11 유지).
5. **실제 사용자 상담은 Cloudflare Workers AI로만 한다.** Workers AI는 입력을 학습에 쓰거나 저장하지 않는다.
   - Google AI Studio는 평가 전용이다(`prompt_tuning_workflow.md` §0).
   - `data/ai-providers.json`의 옛 폴백 체인(Gemini Flash · Groq · Cerebras · OpenRouter)은 이 원칙에 맞지 않는다. 2단계에서 다시 정한다.
   - 폴백 후보는 입력을 학습에 쓰지 않는다고 보장하는 곳만 둔다. 중국 회사의 모델과 그 모델을 바탕으로 만든 모델은 뺀다(`local_llm_eval_plan.md` §0).

## 4. 저장소 구조 (모노레포, bun workspaces)

```
apps/web        Next.js (1단계)
apps/api        Hono · Bun (2단계)
packages/core   지금의 lib/assessment · lib/chatbot (웹 · API · 평가 스크립트가 함께 씀)
deploy/         맥미니 실행 설정 (3단계)
data/ evals/ scripts/ docs/   지금 위치 그대로
(apps/mobile)   4단계에 추가할 자리. 같은 저장소에서 data/를 빌드 때 읽게 둔다
```

- `data/`는 콘텐츠 원본이라 위치를 바꾸지 않는다(`CLAUDE.md` · 평가 경로 유지).
- `lib/` → `packages/core`로 옮길 때 `scripts/run_chat_eval.ts`의 import 경로도 함께 바꾼다(1단계).

## 5. 견고하게: 단계별 완료 기준

세부 내용은 각 단계 계획서에서 정한다.

**1단계 (웹 검사 · 리포트)**
- 채점 골든 케이스(입력 응답 → 결과 JSON)를 두고 `bun test`로 확인한다. 이 파일은 4단계에서 Kotlin 결과를 맞추는 데도 쓴다.
- 기존 점검 스크립트(`scripts/check_report_copy.py` 등)를 통과한다.
- 문항 버전이 바뀌었을 때 진행 기록을 버리고 안내하는지 확인한다(`user_flow_spec.md` §5.3).

**2단계 (API 서버 + 상담)**
- `openapi.json`과 실제 응답이 일치하는지 테스트한다.
- 사용 한도와 메시지 길이 제한을 테스트한다.
- 위기 메시지는 모든 제공자가 실패해도 고정 안내가 나온다(`getAdvice()` 기존 동작 유지).
- 평가 스크립트가 `packages/core`의 같은 코드를 쓰는지 확인한다.
- Tunnel을 거친 스트리밍(SSE)이 버퍼링 없이 오는지 확인한다.
- 대화 이력 길이(메시지 12개)를 실제 토큰으로 다시 정한다(`user_flow_spec.md` §15).

**3단계 (맥미니 서버 + 출시 준비)**
- 재부팅 · 정전 뒤 자동 복구
- 외부에서 사이트가 살아 있는지 감시
- 접근성 · SEO · 성능 점검
- 배포 · 되돌리기 절차 문서화
- 키는 환경변수로만 두고, 로그에 본문 없음
- `/privacy`, 법률 검토(`user_flow_spec.md` §15), 통신사 약관 확인(가정용 회선에서 서버 운영)

## 6. 4~6단계로 넘어가기 쉽게: 1~3단계에서 지킬 규칙

### 6.1 Hono + KMP 검토 (2026-11-22)

앱은 HTTP로만 API를 부르므로 서버 언어와 상관없다. 4~6단계에서 필요할 기능을 미리 확인했다.

| 나중에 필요한 것 | Hono 쪽 | KMP 쪽 | 판단 |
|---|---|---|---|
| 상담 답변 스트리밍 | `hono/streaming` `streamSSE` | Ktor 클라이언트 SSE (Android · iOS) | 됨 |
| 요청 · 응답 타입 공유 | Hono RPC 타입은 TS에서만 쓸 수 있음 | Kotlin은 TS 타입을 못 읽음 | 규칙 1로 해결 |
| 로그인 | JWT 미들웨어, `jose`로 ID 토큰 검증 | 각 플랫폼 SDK로 토큰을 받아 API로 보냄 | 됨 (규칙 3) |
| 봇 · 남용 차단 | 검증 미들웨어 | Turnstile은 웹 전용 → 앱은 Play Integrity / App Attest | 규칙 4로 해결 |
| 푸시 · 인앱결제 검증 | FCM HTTP v1, App Store Server API, Google Play API (모두 HTTP 호출) | — | 됨 |
| 실시간 대화 · 이미지 업로드 | Bun WebSocket(`hono/bun`), multipart 파싱 | Ktor WebSocket · multipart | 됨 (둘 다 Tunnel 통과) |
| 실행 환경 | Bun에서 돌리지만 `@hono/node-server`로 Node 전환 가능 | — | 특정 실행 환경에 묶이지 않음 |

- 판단: **Hono로 간다.** 아래 규칙만 지키면 앱이 나와도 API를 고치지 않아도 된다.
- 2단계에서 실제로 확인할 것: 그 시점 Hono · Ktor 버전에서 위 기능이 되는지.

### 6.2 규칙

1. **계약은 OpenAPI로 둔다.**
   - `@hono/zod-openapi`로 라우트와 스키마를 정의하고 `openapi.json`을 만든다.
   - Hono RPC 타입은 웹에서 덤으로만 쓴다. 앱은 `openapi.json`으로 Kotlin 모델을 만든다.
   - 이 계약이 있으면 나중에 서버 언어를 바꿔도 클라이언트는 그대로 둘 수 있다.
2. **스트리밍 형식을 고정한다.** SSE 이벤트는 세 가지다.
   - `delta`: 글자 조각
   - `done`: `safety` · `promptVersion` · `providerId`
   - `error`: 오류 코드
3. **신원 확인은 미들웨어 한 곳에서 한다.**
   - 지금은 `X-Device-Id`(익명 UUID)를 쓴다. 웹은 localStorage에 둔다.
   - 로그인이 생기면 이 미들웨어에 `Authorization: Bearer`만 더한다.
   - 쿠키에만 기대는 방식은 만들지 않는다.
4. **봇 차단도 검증 한 곳에서 한다.**
   - 지금은 웹의 Turnstile만 받는다.
   - 앱의 무결성 토큰은 나중에 같은 자리에 더한다.
   - 사용 한도는 기기 ID와 IP 기준으로 건다.
5. **응답을 깨지 않는다.**
   - `/v1`에서는 필드를 더하기만 한다. 꼭 깨야 하면 `/v2`를 나란히 둔다(업데이트하지 않은 앱이 계속 동작하도록).
   - ID는 문자열로 보낸다(JS 숫자와 Kotlin Long의 정밀도 차이를 피함).
   - 시간은 ISO 8601로 보낸다.
   - 오류는 `{ error: { code, message } }` 한 가지 모양이다.

### 6.3 지금 정하지 않는 것

아래는 1~3단계가 끝난 뒤 4~6단계를 계획할 때 정한다: 앱 UI 방식, 로그인 방식, 커뮤니티 DB, 결제 방식.

- 커뮤니티를 시작하기 전에는 운영 · 법 문제를 먼저 확인한다: 신고 · 차단과 운영 인력, 만 14세 기준, 개인정보 처리방침, DB 백업.

## 7. 맥미니 운영 메모 (3단계 계획의 출발점)

- **도메인**: 어디서 사든 네임서버를 Cloudflare(무료 플랜)로 옮긴다. `.kr`은 국내 등록업체에서 사고 네임서버만 옮긴다.
- **실행 방식**: 3단계에서 정한다.
  - Docker Compose: 나중에 다른 서버로 옮기기 쉽다. 대신 Mac에서는 메모리를 더 쓴다(Docker Desktop 약 12GB, `local_llm_eval_plan.md` §4).
  - 네이티브(pm2 · launchd): 가볍다.
- **맥미니 설정**: 정전 후 자동 켜짐, 잠자기 끄기, macOS 업데이트 재시작 시간 관리.
- **보안**
  - 서비스 전용 macOS 계정을 쓴다.
  - 키는 환경변수로만 두고 저장소에 넣지 않는다.
  - SSH 같은 관리 포트는 외부에 열지 않는다. 원격 관리가 필요하면 Tailscale 같은 사설망을 쓴다.
- **비용**
  - 도메인: 연 1~2만 원대
  - Cloudflare DNS · Tunnel: 무료
  - Workers AI: 무료 한도(하루 10,000뉴런)를 넘으면 Workers 유료 플랜 월 $5에 사용량이 더해진다. 하루 1,000건 30일에 약 $11로 추정한다(`cloudflare_eval_plan.md` §0).
- **맥미니로 부족해지면**: 웹은 정적 호스팅으로, API는 클라우드 서버로 옮긴다. 구조는 바꾸지 않는다.
