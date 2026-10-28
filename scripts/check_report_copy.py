#!/usr/bin/env python3
"""리포트 카피 검사 — docs/plan/copy_tone_guide.md §8 + docs/plan/report_spec.md §3·§4 를 코드로 옮긴 것.

사용:
  python3 scripts/check_report_copy.py data/profiles.json
  python3 scripts/check_report_copy.py <부분 파일.json> --base data/profiles.json --pairs <derived_pairs.json>

입력은 profiles.json 형식({"profiles": {...}}) 또는 유형 코드를 키로 하는 부분 파일({"INTJ": {...}}) 모두 가능.
- --base : 개수 비교(strengths 등)와 궁합 쌍의 기준이 되는 프로필 (기본: data/profiles.json)
- --pairs: 유형별 bestMatches/challengingMatches 를 덮어쓸 파일 (궁합 재도출 직후 사용)
오류가 하나라도 있으면 종료 코드 1. 경고는 종료 코드에 영향 없음.
"""
import argparse
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 톤 가이드 §8 — 사용자 노출 문구에 나오면 안 되는 패턴
FORBIDDEN = [
    ("호칭 '당신'", re.compile(r"당신")),
    ("상표 'MBTI'", re.compile(r"mbti", re.I)),
    ("인지기능 약어", re.compile(r"(?<![A-Za-z])(Fi|Fe|Ti|Te|Si|Se|Ni|Ne)(?![A-Za-z])")),
    ("전문 용어", re.compile(r"주기능|보조기능|보조 기능|3차 기능|열등 ?기능")),
    ("단정 표현", re.compile(r"항상|절대|반드시|운명|할 수밖에")),
    ("비교 표현", re.compile(r"누구보다|따라올 수 없|가장 뛰어난")),
    ("합니다체", re.compile(r"(니다|이다)\.")),
    ("낙인 단어", re.compile(r"결함|부족|미발달|둔감|통제 욕구")),
]
SOCIAL_SCENES = {"직장", "학교", "모임"}
MAX_SENTENCE = 60
MAX_HEADLINE = 30
MAX_GROWTH_MESSAGE = 80
SIMILAR_RATIO = 0.6  # 거울 문장 유형 간 유사도 경고 기준


def load_profiles(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["profiles"] if "profiles" in data else {k: v for k, v in data.items() if not k.startswith("_")}


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.?!])\s+", text.strip()) if s]


def user_strings(p: dict):
    """(경로, 문자열) — 화면에 노출되는 v2 필드만"""
    mirror = p.get("mirror", {})
    yield "mirror.headline", mirror.get("headline", "")
    for i, s in enumerate(mirror.get("lines", [])):
        yield f"mirror.lines[{i}]", s
    for i, s in enumerate(p.get("strengths", [])):
        yield f"strengths[{i}].title", s.get("title", "")
        yield f"strengths[{i}].description", s.get("description", "")
    for i, w in enumerate(p.get("weaknesses", [])):
        for k in ("title", "description", "recovery"):
            yield f"weaknesses[{i}].{k}", w.get(k, "")
    careers = p.get("careers", {})
    for i, s in enumerate(careers.get("workStyle", [])):
        yield f"careers.workStyle[{i}]", s
    for i, r in enumerate(careers.get("recommended", [])):
        yield f"careers.recommended[{i}].reason", r.get("reason", "")
    for i, r in enumerate(careers.get("lessIdeal", [])):
        yield f"careers.lessIdeal[{i}].environment", r.get("environment", "")
        yield f"careers.lessIdeal[{i}].reason", r.get("reason", "")
    romantic = p.get("relationships", {}).get("romantic", {})
    yield "relationships.romantic.style", romantic.get("style", "")
    yield "relationships.romantic.advice", romantic.get("advice", "")
    for i, c in enumerate(p.get("compatPreview", [])):
        yield f"compatPreview[{i}].line", c.get("line", "")
    for i, t in enumerate(p.get("socialTips", [])):
        yield f"socialTips[{i}].tip", t.get("tip", "")
    yield "growthMessage", p.get("growthMessage", "")
    for i, g in enumerate(p.get("growthAdvice", [])):
        yield f"growthAdvice[{i}].area", g.get("area", "")
        yield f"growthAdvice[{i}].tip", g.get("tip", "")


def check_schema(t: str, p: dict, base: dict, pairs: dict, err, warn):
    b = base.get(t, {})
    mirror = p.get("mirror")
    if not isinstance(mirror, dict) or not mirror.get("headline") or not 3 <= len(mirror.get("lines", [])) <= 4:
        err("mirror: headline 과 lines 3~4개가 필요")
    for key in ("strengths", "weaknesses", "growthAdvice"):
        if len(p.get(key, [])) != len(b.get(key, [])):
            err(f"{key}: 개수 {len(p.get(key, []))} ≠ 원본 {len(b.get(key, []))}")
    if any(not w.get("recovery") for w in p.get("weaknesses", [])):
        err("weaknesses: 모든 항목에 recovery 필요")
    careers = p.get("careers", {})
    if len(careers.get("workStyle", [])) != 3:
        err("careers.workStyle: 3개 필요")
    if len(careers.get("recommended", [])) != len(b.get("careers", {}).get("recommended", [])):
        err("careers.recommended: 원본과 개수가 다름")
    less = careers.get("lessIdeal", [])
    if len(less) != len(b.get("careers", {}).get("lessIdeal", [])):
        err("careers.lessIdeal: 원본과 개수가 다름")
    if any("field" in r or not r.get("environment") or not r.get("reason") for r in less):
        err("careers.lessIdeal: 직업명 field 대신 environment + reason 필요")
    romantic = p.get("relationships", {}).get("romantic", {})
    if not romantic.get("style") or not romantic.get("advice"):
        err("relationships.romantic: style·advice 필요")

    # 기대 궁합 쌍: --pairs > 입력 파일의 romantic > 기준 프로필의 romantic
    expected = pairs.get(t) or (romantic if "bestMatches" in romantic else b.get("relationships", {}).get("romantic", {}))
    preview = p.get("compatPreview", [])
    got = {(c.get("type"), c.get("kind")) for c in preview}
    want = {(o, "best") for o in expected.get("bestMatches", [])} | {
        (o, "challenging") for o in expected.get("challengingMatches", [])
    }
    if len(preview) != 4 or got != want:
        err(f"compatPreview: {sorted(got)} ≠ 기대 {sorted(want)}")

    tips = p.get("socialTips", [])
    if len(tips) != 3 or {x.get("scene") for x in tips} != SOCIAL_SCENES:
        err("socialTips: 직장·학교·모임 장면 3개 필요")
    msg = p.get("growthMessage", "")
    if not msg:
        err("growthMessage 필요")
    elif len(msg) > MAX_GROWTH_MESSAGE:
        err(f"growthMessage: {len(msg)}자 > {MAX_GROWTH_MESSAGE}자")
    headline = (mirror or {}).get("headline", "")
    if len(headline) > MAX_HEADLINE:
        warn(f"mirror.headline: {len(headline)}자 > {MAX_HEADLINE}자")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--base", default=str(ROOT / "data" / "profiles.json"))
    ap.add_argument("--pairs")
    args = ap.parse_args()

    target = load_profiles(Path(args.target))
    base = load_profiles(Path(args.base))
    pairs = json.loads(Path(args.pairs).read_text(encoding="utf-8")) if args.pairs else {}

    total_err = total_warn = 0
    seen: dict[str, str] = {}  # 정규화한 문장 → 처음 나온 위치 (유형 간 반복 검사)

    for t, p in target.items():
        errors: list[str] = []
        warnings: list[str] = []
        check_schema(t, p, base, pairs, errors.append, warnings.append)

        for path, text in user_strings(p):
            for label, rx in FORBIDDEN:
                if rx.search(text):
                    errors.append(f"{label}: {path}: {text[:40]}")
            for s in sentences(text):
                if len(s) > MAX_SENTENCE:
                    msg = f"{MAX_SENTENCE}자 초과({len(s)}): {path}: {s}"
                    (errors if path.startswith("mirror.lines") else warnings).append(msg)
                key = re.sub(r"[\s.,!?'\"~·]", "", s)
                if len(key) < 12:
                    continue
                where = f"{t}.{path}"
                if key in seen and not seen[key].startswith(f"{t}.{path}"):
                    errors.append(f"문장 반복: {path} = {seen[key]}: {s[:40]}")
                else:
                    seen.setdefault(key, where)

        status = "OK" if not errors else f"오류 {len(errors)}"
        print(f"[{t}] {status}" + (f" · 경고 {len(warnings)}" if warnings else ""))
        for e in errors:
            print(f"  ❌ {e}")
        for w in warnings:
            print(f"  ⚠️ {w}")
        total_err += len(errors)
        total_warn += len(warnings)

    # 고유성 보조 검사: 다른 유형의 거울 문장과 장면·표현이 거의 같으면 경고 (완전 일치는 위에서 오류)
    mirror_lines = [
        (t, i, re.sub(r"[\s.,!?'\"~·]", "", line), line)
        for t, p in target.items()
        for i, line in enumerate(p.get("mirror", {}).get("lines", []))
    ]
    similar = []
    for x in range(len(mirror_lines)):
        for y in range(x + 1, len(mirror_lines)):
            ta, ia, ka, la = mirror_lines[x]
            tb, ib, kb, lb = mirror_lines[y]
            if ta != tb and SequenceMatcher(None, ka, kb).ratio() >= SIMILAR_RATIO:
                similar.append(f"{ta}.mirror.lines[{ia}] ≈ {tb}.mirror.lines[{ib}]: {la[:30]} / {lb[:30]}")
    if similar:
        print("\n유형 간 비슷한 거울 문장")
        for s in similar:
            print(f"  ⚠️ {s}")
    total_warn += len(similar)

    print(f"\n검사 {len(target)}유형 · 오류 {total_err} · 경고 {total_warn}")
    return 1 if total_err else 0


if __name__ == "__main__":
    sys.exit(main())
