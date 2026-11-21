#!/usr/bin/env python3
"""연결 명령(scripts/eval_bridge_openai.py --log)이 남긴 호출 기록을 요약한다.

모델별로 토큰 수 · 답변 시간 · 잘림을 보여 주고, Cloudflare Workers AI 단가로
"무료 한도로 하루 몇 건", "하루 N건이면 한 달 얼마"를 계산한다.

  python3 scripts/summarize_eval_calls.py evals/chatbot/rendered/calls-cf-gemma4-26b.jsonl
  python3 scripts/summarize_eval_calls.py <기록.jsonl> --daily 1000

단가 출처: https://developers.cloudflare.com/workers-ai/platform/pricing/ (2026-11-19 확인).
바뀌었을 수 있으니 결과를 쓰기 전에 페이지에서 다시 확인한다. Workers 유료 플랜 기본료는 넣지 않는다.
평가 대사 1회 = 사용자 메시지 1건으로 본다. 평가 세트에는 이어지는 대화가 섞여 있어 실제와 비슷하다.

표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

# 백만 토큰당 뉴런 (입력, 출력)
CLOUDFLARE_NEURONS_PER_M = {
    "gemma-4-26b-a4b-it": (9_091, 27_273),
    "gpt-oss-20b": (18_182, 27_273),
    "llama-3.3-70b-instruct-fp8-fast": (26_668, 204_805),
}
FREE_NEURONS_PER_DAY = 10_000
USD_PER_1000_NEURONS = 0.011
SLOW_SECONDS = 30  # 서비스 요청 제한 시간 (data/ai-providers.json request.timeoutMs)


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = max(0, min(len(s) - 1, round(q * (len(s) - 1))))
    return s[k]


def rates_for(model: str, price_in: float | None, price_out: float | None):
    if price_in is not None and price_out is not None:
        return price_in, price_out
    for key, rate in CLOUDFLARE_NEURONS_PER_M.items():
        if key in model:
            return rate
    return None


def main() -> None:
    p = argparse.ArgumentParser(description="평가 호출 기록 요약 · Cloudflare 비용 환산")
    p.add_argument("logs", nargs="+", help="eval_bridge_openai.py --log 로 남긴 JSONL 파일")
    p.add_argument("--daily", type=int, default=1000, help="비용을 계산할 하루 메시지 수 (기본 1000)")
    p.add_argument("--neurons-in", type=float, help="단가표에 없는 모델: 백만 입력 토큰당 뉴런")
    p.add_argument("--neurons-out", type=float, help="단가표에 없는 모델: 백만 출력 토큰당 뉴런")
    args = p.parse_args()

    by_model: dict[str, list[dict]] = defaultdict(list)
    for path in args.logs:
        for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                print(f"⚠️ {path}:{n} JSON이 아니어서 건너뜀", file=sys.stderr)
                continue
            by_model[rec.get("model", "?")].append(rec)

    if not by_model:
        sys.exit("기록이 없어요.")

    for model, recs in by_model.items():
        ok = [r for r in recs if r.get("status") == 200]
        errors = len(recs) - len(ok)
        ins = [r["inputTokens"] for r in ok if isinstance(r.get("inputTokens"), int)]
        outs = [r["outputTokens"] for r in ok if isinstance(r.get("outputTokens"), int)]
        reas = [r["reasoningTokens"] for r in ok if isinstance(r.get("reasoningTokens"), int)]
        secs = [r["seconds"] for r in ok if isinstance(r.get("seconds"), (int, float))]
        truncated = sum(1 for r in ok if r.get("truncated"))
        think = sum(1 for r in ok if r.get("thinkTagInReply") or (r.get("reasoningChars") or 0) > 0)
        slow = sum(1 for s in secs if s > SLOW_SECONDS)

        print(f"\n■ {model}")
        print(f"  호출 {len(recs)}회 · 성공 {len(ok)} · 실패 {errors}")
        if ins:
            print(f"  입력 토큰  중앙값 {statistics.median(ins):,.0f} · 평균 {statistics.mean(ins):,.0f} · 최대 {max(ins):,}")
        else:
            print("  입력 토큰  서버가 알려 주지 않음")
        if outs:
            print(f"  출력 토큰  중앙값 {statistics.median(outs):,.0f} · 평균 {statistics.mean(outs):,.0f} · 최대 {max(outs):,}")
        if reas:
            print(f"  (그중 생각 토큰  평균 {statistics.mean(reas):,.0f})")
        if secs:
            print(
                f"  답변 시간  중앙값 {statistics.median(secs):.1f}초 · 90% {pct(secs, 0.9):.1f}초 · 최대 {max(secs):.1f}초"
                f" · {SLOW_SECONDS}초 넘음 {slow}회"
            )
        print(f"  길이 한도에서 잘림 {truncated}회 · 생각 내용이 보인 답변 {think}회")

        rate = rates_for(model, args.neurons_in, args.neurons_out)
        if not (ins and outs):
            print("  비용 환산  토큰 수가 없어 계산하지 못함")
            continue
        if rate is None:
            print("  비용 환산  단가표에 없는 모델 — --neurons-in / --neurons-out 을 주면 계산해요")
            continue
        per_call = statistics.mean(ins) * rate[0] / 1e6 + statistics.mean(outs) * rate[1] / 1e6
        free_calls = FREE_NEURONS_PER_DAY / per_call
        paid_neurons = max(0.0, args.daily * per_call - FREE_NEURONS_PER_DAY)
        per_day = paid_neurons / 1000 * USD_PER_1000_NEURONS
        print(f"  Cloudflare 환산 (백만 토큰당 뉴런 입력 {rate[0]:,} · 출력 {rate[1]:,})")
        print(f"    메시지 1건 평균 {per_call:,.1f}뉴런 → 무료 한도로 하루 약 {free_calls:,.0f}건")
        print(f"    하루 {args.daily:,}건이면 하루 약 ${per_day:,.2f} · 30일 약 ${per_day * 30:,.0f} (유료 플랜 기본료 별도)")


if __name__ == "__main__":
    main()
