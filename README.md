# 16가지 성격 유형 검사 서비스

[16personalities.com](https://www.16personalities.com)과 유사한 **무료 성격 유형 검사 서비스**입니다.
사전 제작된 데이터(JSON)를 기반으로 검사·결과 제공·유형별 AI 조언 챗봇을 목표로 합니다.

> 모든 사용자 대면 콘텐츠는 **한국어**, 코드/변수명은 영어입니다.

---

## 📌 프로젝트 개요

- **무료** 성격 유형 검사 — 60문항 7점 리커트 척도로 4개 축을 측정해 16가지 유형 중 하나를 판별
- **사전 제작 데이터 기반** — 별도 백엔드 DB 없이 정적 JSON으로 검사·프로필·궁합·유명인 데이터를 제공
- **유형별 AI 챗봇** — 검사 완료 후 판별된 유형에 대해 성장·관계·직업 조언을 해주는 대화형 챗봇

### 용어·콘텐츠 원칙
- "MBTI" 상표 직접 사용 지양 → **"성격 유형 검사"**, **"16가지 성격 유형"** 표현 사용
- 16가지 유형은 **우열이 없으며** 각자 고유한 가치를 가짐
- 모든 콘텐츠는 **칼 융의 인지기능 이론**(Se/Si/Ne/Ni/Te/Ti/Fe/Fi)에 기반

---

## 🚦 현재 진행 상황

> 한 줄 요약: **데이터 + 검사 채점·챗봇 로직 레이어, 유저 플로우 설계, 디자인 1차 시안은 완성**, **Next.js 앱(UI)은 미착수** 상태입니다.

### ✅ 완료 — 데이터 레이어 (`data/`)
| 파일 | 상태 | 내용 |
|------|------|------|
| `questions.json` | ✅ v1.1 | 60문항 (4축 × 15문항), 7점 리커트 척도, 역채점 포함. 화면 표시 순서(`presentation`: 한 페이지 6문항, 축 교차)와 동점 해소 2지선다 4문항(`tieBreakers`) |
| `scoring.json` | ✅ v1.1 | 축별 매핑·계산 로직·결과 포맷·turbulence(A/T) 규칙. 동점(축 합계 0) 추가 질문 규칙(`tieBreak`)과 경계 표시 기준(`borderline`, 강도 10% 미만) |
| `profiles.json` | ✅ **v2** | 16유형 전체. 리포트용 "거울" 카피(해요체)를 적용했고 새 필드를 추가했다(`mirror`·`careers.workStyle`·`compatPreview`·`socialTips`·`growthMessage`, 약점 `recovery`). `introduction`은 '더 알아보기' 해설용으로 유지 |
| `compatibility.json` | ✅ v1.1 | 16×16 = 256 페어 궁합 매트릭스. 양방향 점수를 대칭으로 정리했고, 궁합 미리보기의 기준 데이터다 |
| `famous-people.json` | ✅ v1.1 | 유형별 유명인 6~8명. 논란 인물을 제외했고, 화면 표시용 `featured` 4명을 지정했다(유형은 모두 추정치) |
| `report-sections.json` | ✅ v1.1 | 결과 리포트 공통 메타 — 섹션 순서·제목, 상담 연결 CTA, 성향 축 설명(경계·동점 문구 포함), 궁합 라벨, 고정 안내 문구, 유형 직접 선택 시 대체 카드 |
| `flow-copy.json` | ✅ | 리포트 밖 화면 문구 — 랜딩, 검사 안내·이어 하기, 동점 질문, 공유, 유형 선택, 상담 게이트·첫 진입 안내(만 14세 확인), 오류·한도, 도움받을 곳 |
| `questions-cultural.json` / `scoring-cultural.json` / `cultural-compatibility.json` | ✅ | 문화권 관련 보조 확장 데이터 |

### ✅ 완료 — 기획 문서 · 리포트 · AI 챗봇 사전 준비
| 파일 | 내용 |
|------|------|
| `docs/plan/chatbot_spec.md` | 챗봇 설계서 — 응답 구조·캐릭터 시트·금지선·위기 대응·평가 시나리오 |
| `docs/plan/report_spec.md` | 결과 리포트 사양 — 섹션 구성·데이터 스키마·CTA·변경 기록 |
| `docs/plan/copy_tone_guide.md` | "거울" 카피 톤 가이드 — 리포트·공유 카드·CTA 공통 문체 규칙 |
| `docs/plan/user_flow_spec.md` | 유저 플로우 설계 — 검사 → 리포트 → 상담 화면 흐름, 채점 규칙(동점·경계), 위기 카드·면책 위치, 저장·개인정보, 분석 이벤트 |
| `lib/assessment/*.ts` | 검사 순수 모듈(브라우저·서버 공용) — 문항 페이지 나누기, 축 합계·동점 확인·유형 판정, 스펙트럼 표시 비율 |
| `scripts/check_report_copy.py` | 리포트 카피 검사(톤 금지 패턴·스키마·길이·유형 간 반복). 카피를 고친 뒤 `python3 scripts/check_report_copy.py data/profiles.json` |
| `data/chatbot-prompts.json` | **v2.2** — 페르소나 3종(지온/하랑/다온) + 인정→격려→안전 응답 구조 + 캐릭터 말투·금지선·예시 대화 + 공통 가드레일 + 위기 대응 프로토콜(상담 자원 전화·문자 연결 정보 포함) + 추천 질문 + 대화 첫 인사말 |
| `data/ai-providers.json` | 무료 AI 모델 폴백 체인 설정 (토큰 소진 시 자동 전환) |
| `lib/chatbot/*.ts` | 프레임워크 무관 순수 TS 모듈 (프롬프트 조립 + 폴백 호출 + 위기 감지 안전망) |

### ✅ 완료 — 디자인 1차 확정 (`docs/design/`, 2026-10-30)
| 파일 | 내용 |
|------|------|
| `docs/design/README.md` | 디자인 폴더 안내. **여기부터 읽기** |
| `docs/design/design_spec.md` | 세계관 '마음 정원'(가칭 서비스명 '피어나') · 캐릭터 · 공통 규칙 · 화면 8종 상세 · 새 문구 · 시안 없는 화면 |
| `docs/design/type_naming.md` | 16유형 → 16가지 꽃 · 네 계절 정원 매핑 (**초안**, 확정 전에는 데이터 별칭을 바꾸지 않음) |
| `docs/design/tokens.json` | 색 · 계절 색 · 글꼴(고운바탕/고운돋움/개구) · 글자 크기 · 모서리 · 크기 |
| `docs/design/mockups/round2/` | 시안 보드 5장 (PNG + 브라우저로 여는 HTML) |
| `docs/design/assets/` | 꽃 16종 · 캐릭터 4종(움 · 지온 · 하랑 · 다온) SVG 스케치 |

### ⬜ 미착수 — 애플리케이션 레이어
- Next.js 앱 스캐폴딩 (`package.json`, `app/`, `next.config.*` 없음)
- 검사 플로우 UI(문항 → 점수 계산 → 결과), 결과/프로필/궁합 페이지
- 챗봇 API 라우트 배선 및 채팅 UI
- 화면은 `docs/design/` 시안을 기준으로 만들고, 실제 화면을 Claude 데스크탑에서 함께 보며 조정한다 (`docs/plan/user_flow_spec.md` §14)

---

## 📂 디렉터리 구조

```
mbti_nextjs/
├── CLAUDE.md                  # 프로젝트 규칙 (콘텐츠 원칙·용어·데이터 구조)
├── README.md                  # 이 문서
├── data/                      # 정적 콘텐츠 데이터 (검사·결과·챗봇)
│   ├── questions.json         # 60문항 질문지
│   ├── scoring.json           # 점수 산출 규칙
│   ├── profiles.json          # 16유형 상세 프로필 (v2: 리포트 거울 카피)
│   ├── compatibility.json     # 16×16 궁합 매트릭스 (대칭)
│   ├── famous-people.json     # 유형별 유명인 (featured 4명)
│   ├── report-sections.json   # 결과 리포트 공통 메타 (섹션·CTA·안내 문구)
│   ├── flow-copy.json         # 리포트 밖 화면 문구 (랜딩·검사·상담 안내·오류)
│   ├── chatbot-prompts.json   # 챗봇 페르소나·프롬프트
│   ├── ai-providers.json      # 무료 AI 모델 폴백 체인 설정
│   └── *-cultural.json        # 문화권 확장 데이터
├── lib/
│   ├── assessment/            # 검사 순수 모듈 (브라우저·서버 공용)
│   │   ├── types.ts           # 응답·축 결과·검사 결과 타입
│   │   ├── order.ts           # 문항 페이지 나누기 (presentation.order)
│   │   ├── scoring.ts         # 축 합계·동점 확인·유형 판정·표시 비율
│   │   └── index.ts           # export
│   └── chatbot/               # 프레임워크 무관 챗봇 로직 (순수 TS)
│       ├── types.ts           # 공통 타입
│       ├── buildPrompt.ts     # 페르소나+프로필+이력 → OpenAI 메시지 조립 (순수 함수)
│       ├── safety.ts          # 위기 키워드 감지·상담 자원 안내 (순수 함수)
│       ├── providerChain.ts   # 무료 모델 폴백 호출 클라이언트
│       └── index.ts           # getAdvice() 진입점 + 데이터 로딩
├── scripts/
│   └── check_report_copy.py   # 리포트 카피 검사 (python3, 의존성 없음)
├── docs/
│   ├── plan/                  # 기획 문서 (overview, chatbot_spec, report_spec, copy_tone_guide, user_flow_spec)
│   └── design/                # 디자인 기준 (design_spec, type_naming, tokens.json, 시안, SVG 에셋)
└── .claude/
    └── agents/
        └── mbti-psychologist.md  # 콘텐츠 생성 전용 심리학자 에이전트(Dr. 김서연)
```

---

## 🤖 AI 챗봇 아키텍처

검사로 **판별된 유형**의 프로필을 컨텍스트로 주입하여, **주제별 페르소나**가 조언하는 구조입니다.

### 주제별 페르소나
| id | 페르소나 | 담당 범위 | 주입 데이터 |
|----|----------|------|-------------|
| `career` | 지온 (커리어 멘토) | 진로·직무·이직, 직장·학교 인간관계, 사회생활 팁 | `careers`, `strengths`, `socialTips`, `cognitiveStack`, `coreTraits` |
| `relationship` | 하랑 (관계 상담사) | 연애, 우정·가족 등 사적 관계 | `relationships`, `strengths`, `coreTraits` (+ `compatibility.json`) |
| `growth` | 다온 (자기계발 코치) | 성장 습관, 미루기, 자존감, 번아웃 회복 | `growthAdvice`, `weaknesses`, `strengths`, `cognitiveStack`, `coreTraits` |

모든 페르소나는 다음을 공통으로 따릅니다. 자세한 내용은 [`docs/plan/chatbot_spec.md`](docs/plan/chatbot_spec.md)를 참조하세요.
- **응답 구조**: 인정(감정을 구체적으로 알아봐 줌) → 격려(유형 강점에 근거한 작은 제안) → 안전(위기 신호 시에만)
- **말투**: 해요체 통일, "당신" 호칭 없음. 캐릭터별 어조·자주 쓰는 표현·이모지 규칙과 예시 대화
- **금지선**: 공통 가드레일 12개(한국어, 상표 회피, 유형 동등성, 진단 아님, toxic positivity 금지, 미성년 고려, 외모 평가 금지 등) + 캐릭터별 금지선
- **위기 대응**: 일반/주의/위기 3단계, 상담 자원(109, 1577-0199, 1388, 1366, 112/119) 안내
- **코드 안전망**: 사용자 메시지에서 자해·자살 직접 표현을 감지하면 프롬프트에 주의 지시를 덧붙이고 `result.safety`로 알립니다. 모든 AI 제공자가 실패해도 고정 안내 문구를 반환합니다.

### 무료 모델 폴백 체인
무료 토큰/쿼터 소진(429·quota) 또는 일시적 오류 시 **우선순위 순서대로 다음 무료 모델로 자동 전환**합니다. 모든 제공자가 OpenAI 호환 엔드포인트라 단일 클라이언트로 처리합니다.

```
Gemini Flash  →  Groq (Llama 3.3 70B)  →  Cerebras  →  OpenRouter(무료 모델)
  1순위              2순위                   3순위         4순위
```
키가 설정되지 않은 제공자는 자동으로 건너뜁니다.

### 사용 예시 (앱 구축 후)
```ts
import { getAdvice, listStarterQuestions } from "@/lib/chatbot";

// 검사 결과(typeCode)와 사용자 질문으로 조언 생성
const res = await getAdvice({
  personaId: "growth",          // "growth" | "relationship" | "career"
  typeCode: "INTJ",             // 검사로 판별된 유형
  userMessage: "요즘 자꾸 미뤄요",
  // history: [...],            // 이전 대화(선택)
  // partnerTypeCode: "ENFP",   // relationship 페르소나용 상대 유형(선택)
});
console.log(res.content, "via", res.providerId);
// 위기 키워드 감지 시: 모델 응답과 별개로 고정 위기 안내 UI를 띄운다
if (res.safety?.crisis) showCrisisCard(res.safety.resources);

// 페르소나 진입 시 추천 질문
const starters = await listStarterQuestions("career");
```

---

## 🗺️ 향후 방향 (로드맵)

| 단계 | 내용 |
|------|------|
| **1단계 · 검사 플로우** | Next.js 스캐폴딩(TypeScript/Tailwind) + 디자인 토큰·글꼴·공통 부품, 랜딩, 60문항 검사 UI(한 페이지 6문항) → `lib/assessment`로 채점·동점 질문·유형 판별 |
| **2단계 · 결과 페이지** | `profiles.json`·`compatibility.json`·`famous-people.json` 렌더링, 결과 공유 기능 |
| **3단계 · AI 챗봇** | Route Handler에서 `getAdvice()` 배선, 채팅 UI, API 키 환경변수 설정, (선택) 스트리밍 응답 |
| **4단계 · 운영** | 배포, 분석, 접근성/SEO, 성능 최적화 |

---

## ⚙️ 로컬 설정 메모

- **git**: GitHub [insungson/mbti_-consultant](https://github.com/insungson/mbti_-consultant) (`main`, SSH 원격)
- **AI API 키**: 챗봇 사용 시 무료 키를 환경변수로 설정. 각 제공자 가입 URL은 `data/ai-providers.json`의 `signupURL` 참조.
  ```
  GEMINI_API_KEY=...        # https://aistudio.google.com/apikey
  GROQ_API_KEY=...          # https://console.groq.com/keys
  CEREBRAS_API_KEY=...      # https://cloud.cerebras.ai
  OPENROUTER_API_KEY=...    # https://openrouter.ai/keys
  ```
  > 키는 **서버 측에서만** 사용하세요(브라우저 노출 금지). 하나만 설정해도 동작하며, 없는 제공자는 폴백 체인에서 자동 skip됩니다.

---

## 📝 콘텐츠 생성

데이터/콘텐츠는 커스텀 에이전트 **`mbti-psychologist`**(임상심리학자 Dr. 김서연 페르소나)로 생성하여 심리학적 타당성과 톤 일관성을 유지합니다. 자세한 원칙은 `CLAUDE.md`와 `.claude/agents/mbti-psychologist.md` 참조.
