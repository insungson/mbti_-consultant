# 로컬 모델 상담 평가 계획 (local_llm_eval_plan)

> 상태: **계획 — 실행 전** · 작성일: 2026-11-13 (같은 날 대상 모델 변경) · 실행 예정: 2026-11-14
> 근거 문서: `evals/chatbot/README.md`(평가 절차·기준 원본), `docs/plan/chatbot_eval_plan.md`
> 비교 대상: `evals/chatbot/results/2026-11-13_v2.4.0_claude-opus.json`, `…_codex-gpt-6.1-sol.json` (둘 다 채점 초안)

---

## 0. 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-13 | **중국 회사의 모델은 쓰지 않는다.** 중국 모델을 바탕으로 만든 모델도 뺀다 | 사용자 결정. "바탕으로 만든 모델도 뺀다"는 Claude의 해석이라 확인이 필요하다 |
| 2026-11-13 | 두 번째 모델을 SKT A.X 4.0 Light에서 **카카오 Kanana 1.5 8B**로 바꾼다 | A.X 4.0은 알리바바 Qwen 2.5를 바탕으로 만든 모델이고, 입력 한도도 16,384토큰으로 작다 |

## 1. 목적과 범위

이 컴퓨터에서 도는 공개 모델 2개로 상담 평가(48회 실행, 모델 호출 59회)를 돌려, **작은 로컬 모델로도 상담이 되는지**를 지금 쓰는 기준 그대로 확인한다.

| 하는 것 | 하지 않는 것 |
|---|---|
| Ollama 설치, 모델 2개 내려받기 | 서비스 코드(`lib/`)·제공자 설정(`data/ai-providers.json`) 변경 |
| 연결 명령 1개 작성 (`--call`에 붙임) | 시나리오·채점표·점검 스크립트·프롬프트 변경 |
| 모델별 전체 실행, 자동 점검, 채점 초안, 보고 | Docker 구성, 배포 서버 사양 결정 (결과를 본 뒤 별도 항목) |
| | 커밋 (요청하실 때만) |

Docker는 쓰지 않는다. Mac의 Docker는 그래픽 가속을 못 써서 느리고, 캐릭터는 시스템 프롬프트로 나뉘므로 모델 서버는 하나면 된다.

## 2. 대상 모델

| | Gemma 4 12B (Google, 미국) | Kanana 1.5 8B (카카오, 한국) |
|---|---|---|
| 역할 | 범용 중형 | 한국어 특화 소형 |
| 받는 곳 | Ollama 공식 `gemma4:12b` | Hugging Face `DevQuasar/kakaocorp.kanana-1.5-8b-instruct-2505-GGUF` (Q4_K_M) |
| 내려받는 크기 | 약 8GB | 4.92GB |
| 라이선스 | Apache 2.0 | Apache 2.0 |
| 한 번에 읽을 수 있는 입력 | 256K 토큰 | 32,768토큰 |
| 나온 때 | 2026년 | 2025년 5월 |

- 두 모델 모두 내 컴퓨터에서 도는 공개 모델이라 **쓰는 만큼 내는 비용도, 사용량 제한도 없다.** 표의 "입력"은 사용량이 아니라 대화 한 번에 읽을 수 있는 글의 길이다.
- Kanana의 구조는 Meta의 Llama 방식이다. 중국 모델을 바탕으로 했다는 표시는 모델 페이지와 파일 정보 어디에도 없다.
- 카카오는 Ollama용 파일을 직접 내지 않는다. 개인이 변환해 올린 파일을 쓴다. 고른 저장소는 카카오 원본(`kakaocorp/kanana-1.5-8b-instruct-2505`)을 출처로 표시했다. **평가용으로만 쓰고**, 서비스에 넣게 되면 카카오 원본에서 직접 변환한다.
- 두 모델 모두 같은 압축 수준(Q4_K_M, Ollama 기본값)으로 맞춘다.

**뺀 모델**

| 모델 | 이유 |
|---|---|
| A.X 4.0 Light (SKT) | 알리바바 Qwen 2.5 기반. 입력 한도 16,384토큰 |
| Qwen 3.5 (알리바바) | 중국 회사 모델 |
| Kanana-2 3B·30B (카카오) | 더 최신이지만 카카오 자체 라이선스라 조건을 확인하지 못했다. 30B는 이 컴퓨터에 크다 |
| HyperCLOVA X SEED (네이버) | 표시 의무와 금지 용도 조건이 붙는다 |
| EXAONE (LG) | 작은 모델은 비상업용 |

## 3. 실행 조건 (두 모델 공통)

| 항목 | 값 | 이유 |
|---|---|---|
| 모델 서버 | Ollama 0.40.16 (Homebrew), 이 컴퓨터에서 직접 실행 | |
| 입력 한도 설정 | **16,384토큰으로 고정** | 아래 위험 1. 모델의 한계가 아니라 평가용 설정이고, 두 모델 모두 더 올릴 수 있다 |
| temperature | 0.7 | 서비스 설정(`data/ai-providers.json`)과 평가 기준(README)이 0.7 |
| 답변 최대 길이 | 1,024토큰 | 서비스 설정과 같게 |
| 생각 모드 | 끔 | 상담 답변은 바로 나와야 한다. 켜면 답변 시간이 길어진다 |
| 호출 방식 | OpenAI 호환 `/v1/chat/completions` | 서비스 코드(`lib/chatbot/providerChain.ts`)가 쓰는 방식과 같다 |
| 동시 실행 | 없음. 한 번에 한 모델 | 메모리 24GB |

조건은 결과 파일의 `runner`에 적는다(Ollama 버전, 모델 파일, 입력 한도, temperature, 생각 모드, 컴퓨터 사양).

Claude·GPT 결과와는 실행 조건이 다르다(그쪽은 CLI가 덧붙이는 내용이 있고 temperature를 정할 수 없었다). 그래서 통과율은 **모델을 고르기 위한 참고**로 나란히 놓되, 프롬프트 버전 비교의 기준선으로는 쓰지 않는다.

## 4. 순서

"진행"이라고 하시면 0~7을 이어서 한다. **4번(작은 확인)에서 문제가 나오면 멈추고 보고한다.** 4번까지만 하고 멈추길 원하시면 시작할 때 말씀해 주시면 된다.

### 0. 시작 전 확인
- 디스크 여유(지금 58GB, 필요 약 13GB), 11434 포트가 비었는지 확인
- **Docker Desktop을 끈다** (켜 두면 메모리를 12GB쯤 잡고 있어 모델이 느려진다)

### 1. Ollama 설치와 실행
```bash
brew install ollama      # 0.40.16
ollama serve             # 평가하는 동안만 켠다
```
- 로그인할 때 자동으로 켜지도록 등록하지 않는다(`brew services` 안 씀). 평가가 끝나면 끈다.

### 2. 모델 내려받기
```bash
ollama pull gemma4:12b
ollama pull hf.co/DevQuasar/kakaocorp.kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
```

### 3. 평가용 모델 이름 만들기와 연결 명령 작성
입력 한도를 모델 이름에 묶어 둔다. 설정 파일은 저장소에 남겨 누구나 같은 조건을 다시 만들 수 있게 한다.

```
# evals/chatbot/local/gemma4-12b.Modelfile
FROM gemma4:12b
PARAMETER num_ctx 16384
```
```
# evals/chatbot/local/kanana15-8b.Modelfile
FROM hf.co/DevQuasar/kakaocorp.kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
PARAMETER num_ctx 16384
# 대화 형식이 원본과 다르게 잡혔을 때만 아래를 켠다 (초안 — 4번에서 원본 형식과 대조한 뒤 쓴다)
# TEMPLATE """{{- range .Messages }}<|start_header_id|>{{ .Role }}<|end_header_id|>
#
# {{ .Content }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>
#
# """
# PARAMETER stop "<|eot_id|>"
```
```bash
ollama create eval-gemma4-12b  -f evals/chatbot/local/gemma4-12b.Modelfile
ollama create eval-kanana15-8b -f evals/chatbot/local/kanana15-8b.Modelfile
```
같은 모델 파일을 가리키는 이름만 만들므로 디스크를 더 쓰지 않는다.

**연결 명령** `scripts/eval_bridge_openai.py` (신규, Python 표준 라이브러리만 사용)
- README의 연결 명령 계약 그대로: stdin으로 `{system, messages, model}`을 받고, stdout으로 답변 본문만 낸다.
- `system`을 시스템 메시지로, `messages`를 순서대로 넣어 `/v1/chat/completions`에 보낸다. temperature와 최대 길이는 `data/ai-providers.json`의 `request` 값을 읽어 쓴다.
- 옵션: `--base-url`(기본 `http://localhost:11434/v1`), `--timeout`(기본 170초 — 실행 스크립트의 한도 180초보다 짧게), `--reasoning-effort`(생각 모드 조절이 필요할 때), `--log <파일>`
- `--log`에는 호출마다 입력 토큰 수, 답변 토큰 수, 걸린 시간, 답변이 길이 한도에서 잘렸는지를 한 줄씩 남긴다. 이 파일은 git에 올리지 않는 `evals/chatbot/rendered/`에 둔다.
- 답변 본문은 손대지 않는다. HTTP 오류나 빈 답변이면 0이 아닌 종료 코드로 끝낸다.
- Ollama 전용이 아니다. OpenAI 호환 서버면 주소만 바꿔 쓸 수 있다.

### 4. 작은 확인 (모델당 3회 실행 — J1, M1, C1)
결과는 임시 파일(`--out`)에 받고, 확인이 끝나면 지운다.

| 확인할 것 | 방법 | 통과 기준 |
|---|---|---|
| 입력이 잘리지 않는가 | `ollama ps`의 CONTEXT 값, 가장 긴 프롬프트(M1 두 번째 대사, 8,904자)의 입력 토큰 수 | CONTEXT가 16384. 입력 토큰 + 1,024 + 이력 여유가 16,384 안 |
| 대화 형식이 맞는가 | `ollama show <모델> --template`과 디버그 로그의 실제 입력을, 모델 파일에 든 원본 형식과 대조 | 시스템·사용자·답변 구분 표시가 원본과 같다. 다르면 3번의 TEMPLATE을 맞춰 켜고 다시 만든다 |
| 생각 모드가 꺼졌는가 | `/api/show`의 생각 모드 기본값, 답변에 생각 내용이 섞였는지, 답변 토큰 수 | 생각 내용 없음 |
| 답변이 정상인가 | 답변 직접 읽기 | 한국어, 중간에 끊기지 않음, 특수 토큰이 섞이지 않음 |
| 얼마나 걸리는가 | `--log`의 시간 | 호출당 180초 안. 전체 실행 예상 시간을 여기서 계산해 알린다 |

위 기준을 못 맞추고 설정으로 해결되지 않으면 **멈추고 보고**한다. 조용히 낮은 조건으로 진행하지 않는다.

### 5. 전체 실행 (모델별 48회, 한 모델씩)
```bash
bun scripts/run_chat_eval.ts --call "python3 scripts/eval_bridge_openai.py --log evals/chatbot/rendered/calls-gemma4-12b.jsonl"  --model eval-gemma4-12b  --label ollama-gemma4-12b
bun scripts/run_chat_eval.ts --call "python3 scripts/eval_bridge_openai.py --log evals/chatbot/rendered/calls-kanana15-8b.jsonl" --model eval-kanana15-8b --label ollama-kanana15-8b
```
- 결과: `evals/chatbot/results/2026-11-14_v2.4.0_ollama-gemma4-12b.json`, `…_ollama-kanana15-8b.json`
- 사용량은 들지 않는다. 대신 도는 동안 컴퓨터가 무겁고 뜨거워진다.
- 중간에 끊기면 같은 명령을 다시 실행한다(끝난 실행은 건너뛴다).

### 6. 자동 점검과 채점 초안
```bash
python3 scripts/check_chat_replies.py evals/chatbot/results/<결과>.json
```
- 채점은 `rubric.json` 1.1.0의 `items`·`conventions`로, Claude·GPT 결과를 채점할 때와 같은 방식으로 한다.
- `humanScoring.status`는 "초안 — 사용자 검토 전"으로 적는다.

### 7. 보고
README "돌리는 순서" 6번의 항목에 더해 아래를 알린다.

- 안전 관문(S10·S11·S13) 결과 — **실패가 하나라도 있으면 그 모델은 그대로는 쓸 수 없다** (기존 채택 기준)
- 항목별 통과율을 Opus·GPT와 나란히 놓은 표
- 한국어 자연스러움, 캐릭터 말투, 금지선 지키기에서 눈에 띈 것
- 답변 시간(중앙값, 최대, 서비스 제한 30초를 넘는 비율), 입력 토큰 수, 메모리 사용량
- 다음에 할 수 있는 것: 더 작은 Gemma 4(e4b)로 사양 낮춰 보기, 더 큰 모델, 배포 서버 사양 검토 중 무엇이 맞는지

### 8. 문서 반영 (결과가 나온 뒤)
| 파일 | 변경 |
|---|---|
| `evals/chatbot/README.md` | "모델 부르기" 표에 로컬 모델 행, 연결 명령 스크립트 안내 |
| `docs/plan/chatbot_eval_plan.md` | §0 결정 기록(로컬 모델 평가 방식, 중국 모델 제외) |
| `AGENTS.md`·`CLAUDE.md` | 모델 고르는 기준(중국 모델 제외) 1줄 — 어느 AI 도구에서 작업하든 같은 기준을 보게 한다 |
| `README.md` | 스크립트 표와 문서 표에 1줄씩 |
| 이 문서 | 상태를 "실행함"으로 바꾸고 결과 요약 추가 |

## 5. 위험과 대응

| # | 위험 | 대응 |
|---|---|---|
| 1 | **입력이 조용히 잘린다.** Ollama는 그래픽 메모리가 24GB 미만이면 입력 한도를 4천 토큰으로 잡는다. 상담 프롬프트는 그보다 길어서, 그대로 두면 프롬프트 일부가 빠진 채 답한다. OpenAI 호환 호출로는 한도를 바꿀 수 없다 | 3번에서 16,384로 고정하고 4번에서 실제 값을 확인한다 |
| 2 | **Kanana의 대화 형식이 잘못 잡힌다.** 모델 파일에 든 형식이 길고 복잡해서 Ollama가 알아보지 못하고 다른 형식을 넣을 수 있다. 그러면 모델 탓이 아닌 품질 저하가 생긴다 | 4번에서 확인하고, 다르면 3번의 TEMPLATE으로 맞춘다. 그래도 안 맞으면 모델 파일의 형식을 그대로 쓰는 llama.cpp 서버로 바꾼다(연결 명령은 주소만 바꾸면 된다) |
| 3 | 생각 모드가 켜진 채 돈다 (Gemma 4) | 4번에서 기본값을 확인하고 끈다. 끌 수 없으면 보고한다 |
| 4 | 메모리 부족으로 느려진다 | Docker를 끄고 한 번에 한 모델만 올린다 |
| 5 | 호출이 180초를 넘는다 | 실행 스크립트가 한 번 다시 시도한다. 자주 생기면 한도를 몰래 늘리지 않고 보고한다 |
| 6 | 개인이 변환한 Kanana 파일을 쓴다 | 평가용으로만 쓴다. 저장소 이름과 파일 이름을 `runner`에 적는다 |
| 7 | Gemma 4의 권장 temperature는 1.0인데 0.7로 돌린다 | 서비스 설정과 평가 기준을 따른다. `runner`에 적어 둔다 |
| 8 | Kanana 1.5는 1년 반 된 모델이다 | 결과가 부족하면 카카오의 더 최신 모델(Kanana-2)의 라이선스 조건을 확인해 후보로 올린다 |

## 6. 예상 시간과 용량

| 단계 | 예상 |
|---|---|
| 설치, 내려받기(약 13GB) | 회선에 따라 10~30분 |
| 설정 파일, 연결 명령, 작은 확인 | 30분쯤 |
| 전체 실행 | 모델당 20~40분 (추정. 4번에서 잰 값으로 다시 알린다) |
| 자동 점검, 채점 초안, 보고 | 모델당 20~30분 |

합쳐서 2~3시간이고 대부분 기다리는 시간이다. 디스크는 약 13GB를 쓴다.

## 7. 확인한 것과 아직 모르는 것

**오늘 확인함 (공식 문서·모델 페이지)**
- 이 컴퓨터: M4 Pro, 메모리 24GB, 디스크 여유 58GB, Ollama 없음, Homebrew에 Ollama 0.40.16
- Ollama의 기본 입력 한도(메모리에 따라 4천/3만2천/25만6천)와 바꾸는 방법
- Ollama의 OpenAI 호환 호출이 temperature·최대 길이·생각 강도 조절을 받고, 입력 한도는 못 바꾼다는 것
- Kanana 1.5 8B: 카카오 모델 페이지에 Apache 2.0, 입력 32,768토큰. 변환 파일은 4.92GB
- A.X 4.0이 알리바바 Qwen 2.5 기반이라는 것(2025년 7월 공개 당시 보도, 변환 파일의 구조 표시도 Qwen 계열)
- 실행 스크립트의 `--call`이 `--model` 값을 넘겨주고, 호출 한도가 180초라는 것

**내일 돌려 봐야 알 수 있음**
- Gemma 4의 생각 모드가 Ollama에서 기본으로 켜져 있는지
- Ollama가 Kanana의 대화 형식을 제대로 잡는지
- 상담 프롬프트가 각 모델에서 몇 토큰인지 (8,904자 → 5천~8천 토큰으로 추정)
- 실제 답변 속도

## 8. 되돌리기

```bash
ollama rm eval-gemma4-12b eval-kanana15-8b gemma4:12b hf.co/DevQuasar/kakaocorp.kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
brew uninstall ollama
rm -rf ~/.ollama        # 내려받은 모델과 설정
```

## 출처

- [Ollama 문서 — 입력 한도](https://docs.ollama.com/context-length)
- [Ollama 문서 — OpenAI 호환](https://docs.ollama.com/api/openai-compatibility)
- [Ollama 문서 — 생각 모드](https://docs.ollama.com/capabilities/thinking)
- [Ollama 모델 목록 — gemma4](https://ollama.com/library/gemma4)
- [Hugging Face 문서 — Ollama에서 GGUF 쓰기](https://huggingface.co/docs/hub/ollama)
- [google/gemma-4-12b-it](https://huggingface.co/google/gemma-4-12b-it)
- [kakaocorp/kanana-1.5-8b-instruct-2505](https://huggingface.co/kakaocorp/kanana-1.5-8b-instruct-2505)
- [DevQuasar/kakaocorp.kanana-1.5-8b-instruct-2505-GGUF](https://huggingface.co/DevQuasar/kakaocorp.kanana-1.5-8b-instruct-2505-GGUF)
- [아주경제 — SKT, 한국어 특화 '에이닷 엑스 4.0' 오픈소스 공개](https://www.ajunews.com/view/20250703091138903)
- [skt/A.X-4.0-Light](https://huggingface.co/skt/A.X-4.0-Light)
