#!/usr/bin/env python3
"""상담 평가 연결 명령 — OpenAI 호환 /chat/completions 서버를 부른다.

scripts/run_chat_eval.ts 의 --call 에 붙인다. 계약은 evals/chatbot/README.md "연결 명령" 절:
stdin 으로 {system, messages, model} 을 받고, stdout 으로 답변 본문만 낸다. 실패하면 0이 아닌 종료 코드.

서버 주소만 바꾸면 어디든 쓴다.
  - 내 컴퓨터의 Ollama        --base-url http://localhost:11434/v1 (기본값)
  - Cloudflare Workers AI     --base-url https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1
                              --api-key-env CLOUDFLARE_API_TOKEN
  - Google AI Studio          --base-url https://generativelanguage.googleapis.com/v1beta/openai
                              --api-key-env GEMINI_API_KEY

temperature 와 답변 최대 길이는 data/ai-providers.json 의 request 값(서비스 설정)을 그대로 쓴다.
--log 에는 호출마다 토큰 수 · 걸린 시간 · 잘림 여부를 한 줄씩 남긴다(scripts/summarize_eval_calls.py 로 요약).
답변 본문은 손대지 않는다.

표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROVIDERS_FILE = ROOT / "data" / "ai-providers.json"

# 잠깐 기다리면 풀릴 수 있는 오류 (한도 · 서버 혼잡)
RETRY_STATUS = {429, 502, 503, 504}


def fail(message: str, code: int = 1) -> None:
    print(f"[eval_bridge] {message}", file=sys.stderr)
    sys.exit(code)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="OpenAI 호환 서버용 상담 평가 연결 명령")
    p.add_argument("--base-url", default="http://localhost:11434/v1",
                   help="OpenAI 호환 주소 (끝에 /chat/completions 는 붙이지 않는다). $변수는 펼친다")
    p.add_argument("--api-key-env", default="",
                   help="API 키를 담은 환경변수 이름 (예: CLOUDFLARE_API_TOKEN). 없으면 인증 없이 부른다")
    p.add_argument("--model", default="",
                   help="모델 이름. 비우면 요청 JSON 의 model(--model 로 넘어온 값)을 쓴다")
    p.add_argument("--max-tokens-field", default="max_tokens",
                   choices=["max_tokens", "max_completion_tokens"],
                   help="답변 최대 길이를 담을 필드 이름 (서버마다 다름)")
    p.add_argument("--extra", default="",
                   help='요청 본문에 더할 JSON. 예: \'{"reasoning_effort":"low"}\'')
    p.add_argument("--timeout", type=float, default=170.0,
                   help="한 번 호출 제한 시간(초). run_chat_eval.ts 의 한도 180초보다 짧게")
    p.add_argument("--retries", type=int, default=4, help="429·5xx 일 때 다시 시도할 횟수")
    p.add_argument("--deadline", type=float, default=170.0,
                   help="기다림과 다시 시도를 합친 한 호출의 전체 한도(초). run_chat_eval.ts 의 한도 180초보다 짧게")
    p.add_argument("--log", default="", help="호출 기록을 한 줄씩 덧붙일 JSONL 파일")
    p.add_argument("--tpm", type=int, default=0,
                   help="분당 토큰 한도. 주면 최근 60초 사용량을 보고 한도에 닿지 않게 기다렸다 보낸다 (예: Google AI Studio Gemma 4 = 16000)")
    p.add_argument("--pace-file", default="evals/chatbot/rendered/.pace.json",
                   help="--tpm 에서 최근 호출 토큰을 적어 두는 파일 (호출마다 새 프로세스라 파일로 공유)")
    p.add_argument("--allow-truncated", action="store_true",
                   help="답변 최대 길이에서 잘린 답변도 성공으로 낸다 (기본: 실패로 처리)")
    return p.parse_args()


def load_request_defaults() -> dict:
    try:
        return json.loads(PROVIDERS_FILE.read_text(encoding="utf-8"))["request"]
    except (OSError, KeyError, json.JSONDecodeError) as e:
        fail(f"{PROVIDERS_FILE} 의 request 값을 읽지 못했어요: {e}")
    return {}


def post(url: str, body: dict, headers: dict, timeout: float) -> tuple[int, dict | None, str, float | None]:
    """(상태 코드, JSON, 본문, 서버가 알려 준 대기 초)"""
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", errors="replace")
            return res.status, json.loads(raw), raw, None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return e.code, None, raw, retry_after(e.headers.get("Retry-After"), raw)
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, None, str(e), None
    except json.JSONDecodeError as e:
        return 200, None, f"JSON이 아닌 응답: {e}", None


def retry_after(header: str | None, body: str) -> float | None:
    """Retry-After 헤더나 오류 본문의 retryDelay("23s")에서 기다릴 초를 읽는다 (Gemini API는 본문에 넣는다)"""
    if header:
        try:
            return float(header)
        except ValueError:
            pass
    m = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', body)
    return float(m.group(1)) if m else None


def write_log(path: str, record: dict) -> None:
    if not path:
        return
    log_path = Path(os.path.expandvars(path))
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_pace(path: Path) -> list[list[float]]:
    try:
        return [e for e in json.loads(path.read_text(encoding="utf-8")) if time.time() - e[0] < 60]
    except (OSError, json.JSONDecodeError):
        return []


def wait_for_tpm(path: Path, limit: int, estimate: int, deadline: float) -> None:
    """최근 60초 토큰 + 이번 예상 토큰이 한도의 90%를 넘으면, 오래된 호출이 빠질 때까지 기다린다"""
    budget = limit * 0.9
    entries = load_pace(path)
    used = sum(tok for _, tok in entries)
    if not entries or used + estimate <= budget:
        return
    need, freed, until = used + estimate - budget, 0.0, time.time()
    for ts, tok in sorted(entries):
        freed += tok
        until = ts + 60.5
        if freed >= need:
            break
    pause = until - time.time()
    if pause > 0:
        if time.monotonic() + pause > deadline - 20:
            pause = max(0.0, deadline - 20 - time.monotonic())
        print(f"[eval_bridge] 분당 토큰 한도({limit:,}) 때문에 {pause:.0f}초 기다려요", file=sys.stderr)
        time.sleep(pause)


def record_pace(path: Path, tokens: int) -> None:
    entries = load_pace(path) + [[time.time(), tokens]]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entries), encoding="utf-8")


def main() -> None:
    args = parse_args()
    try:
        req = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        fail(f"stdin 요청 JSON을 읽지 못했어요: {e}")

    model = args.model or req.get("model") or ""
    if not model:
        fail("모델 이름이 없어요. run_chat_eval.ts 에 --model 을 주거나 --model 을 붙여 주세요.")

    base_url = os.path.expandvars(args.base_url).rstrip("/")
    if "$" in base_url:
        fail(f"주소에 펼치지 못한 환경변수가 있어요: {base_url}")

    headers = {"Content-Type": "application/json"}
    if args.api_key_env:
        key = os.environ.get(args.api_key_env, "").strip()
        if not key:
            fail(f"환경변수 {args.api_key_env} 가 비어 있어요.")
        headers["Authorization"] = f"Bearer {key}"

    defaults = load_request_defaults()
    body: dict = {
        "model": model,
        "messages": [{"role": "system", "content": req["system"]}, *req["messages"]],
        "temperature": defaults.get("temperature", 0.7),
        args.max_tokens_field: defaults.get("maxTokens", 1024),
    }
    if args.extra:
        try:
            body.update(json.loads(args.extra))
        except json.JSONDecodeError as e:
            fail(f"--extra 가 JSON이 아니에요: {e}")

    url = f"{base_url}/chat/completions"
    started = time.monotonic()
    pace_path = ROOT / args.pace_file if not os.path.isabs(args.pace_file) else Path(args.pace_file)
    # 한글은 대략 1.7자에 1토큰, 답변 몫으로 300을 더한다
    estimate = int(sum(len(m["content"]) for m in body["messages"]) / 1.7) + 300
    if args.tpm:
        wait_for_tpm(pace_path, args.tpm, estimate, started + args.deadline)
    status, data, raw = 0, None, ""
    # run_chat_eval.ts 가 한 호출을 180초에 끊으므로, 기다림과 요청을 합쳐 --deadline 안에서 끝낸다
    deadline = started + args.deadline
    for attempt in range(args.retries + 1):
        remaining = deadline - time.monotonic()
        status, data, raw, wait = post(url, body, headers, max(5.0, min(args.timeout, remaining)))
        if status == 200 and data is not None:
            break
        if status in RETRY_STATUS and attempt < args.retries:
            # 분당 한도(429)는 서버가 알려 준 만큼, 없으면 10·20·40·60초 기다린다
            pause = min(wait if wait is not None else 10 * 2 ** attempt, 60) + 1
            if deadline - time.monotonic() - pause < 20:
                break
            print(f"[eval_bridge] HTTP {status} — {pause:.0f}초 기다렸다 다시 보내요", file=sys.stderr)
            time.sleep(pause)
            continue
        break
    seconds = round(time.monotonic() - started, 2)

    record: dict = {
        "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "model": model,
        "status": status,
        "seconds": seconds,
        "systemChars": len(req["system"]),
        "historyMessages": len(req["messages"]) - 1,
    }

    if status != 200 or data is None:
        record["error"] = raw[:500]
        write_log(args.log, record)
        if args.tpm and status not in (429, 503):
            record_pace(pace_path, estimate)
        fail(f"HTTP {status}: {raw[:400]}")

    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content")
    text = content.strip() if isinstance(content, str) else ""
    usage = data.get("usage") or {}
    details = usage.get("completion_tokens_details") or {}
    reasoning_text = message.get("reasoning_content") or message.get("reasoning") or ""

    record.update({
        "inputTokens": usage.get("prompt_tokens"),
        "outputTokens": usage.get("completion_tokens"),
        "reasoningTokens": details.get("reasoning_tokens"),
        # 입력 + 출력보다 크면 보이지 않는 생각 토큰이 있다는 뜻 (Gemini는 생각 토큰을 출력에 넣지 않는다)
        "totalTokens": usage.get("total_tokens"),
        "reasoningChars": len(reasoning_text) if isinstance(reasoning_text, str) else None,
        "finishReason": choice.get("finish_reason"),
        "truncated": choice.get("finish_reason") == "length",
        "replyChars": len(text),
        "thinkTagInReply": any(tag in text for tag in ("<think>", "<|channel", "channel|>")),
    })
    write_log(args.log, record)
    if args.tpm:
        record_pace(pace_path, usage.get("total_tokens") or estimate)

    if not text:
        fail(f"빈 답변 (finish_reason={choice.get('finish_reason')}). 생각 모드가 답변 길이를 다 썼는지 --log 를 확인해 주세요.")
    if record["truncated"] and not args.allow_truncated:
        fail("답변이 최대 길이에서 잘렸어요 (finish_reason=length). 잘린 답변을 채점하지 않도록 실패로 처리해요. 생각 모드를 확인해 주세요.")
    print(text)


if __name__ == "__main__":
    main()
