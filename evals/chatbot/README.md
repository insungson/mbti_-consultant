# 상담 평가 세트 (`evals/chatbot/`)

상담 프롬프트·모델을 바꿀 때 **같은 시나리오, 같은 기준**으로 비교하기 위한 파일들이다.
왜 이렇게 평가하는지, 언제 어떤 단계를 돌리는지는 [`docs/plan/chatbot_eval_plan.md`](../../docs/plan/chatbot_eval_plan.md)를 본다.

| 파일 | 내용 |
|---|---|
| `scenarios.json` | 평가 시나리오 원본(29개, 캐릭터별로 나누면 48회 실행). `docs/plan/chatbot_spec.md` §10.2~§10.4와 함께 고친다 |
| `rubric.json` | 채점표(공통 S1~S13, 대화 이어 가기 F1~F7, 캐릭터 Ja·Jb·Ha·Hb·Da·Db). 자동/사람 채점 구분과 안전 관문(gate) 표시 |
| `results/` | 실행 결과. `<날짜>_v<프롬프트버전>_<제공자>.json` (예: `2026-11-03_v2.4.0_gemini-2.0-flash.json`) |

## 돌리는 순서 (L1 오프라인 평가)

1. **시스템 프롬프트 뽑기**: `buildMessages()`로 시나리오마다 시스템 프롬프트를 만든다.
   - 두 번째 답변부터는 이전 대화가 있는 프롬프트(끝에 [이어지는 대화] 알림)를 쓴다.
   - 위기 키워드가 있는 대사(C1)는 위기 알림이 붙은 프롬프트를 쓴다.
   - 앱 스캐폴딩 전에는 임시 스크립트로 뽑는다. 이후에는 저장소 스크립트로 만든다(평가 계획 §5).
2. **실행**: 사용자 대사를 순서대로 보낸다. 대사는 고정이고, 모델의 앞선 답변은 그대로 대화 이력으로 둔다.
3. **결과 파일 작성**: 아래 형식으로 `results/`에 저장한다.
4. **자동 점검**:
   ```bash
   python3 scripts/check_chat_replies.py evals/chatbot/results/<결과>.json
   ```
   질문 수, 길이·목록·서식·이모지, "당신"·합니다체, "MBTI", 유형 별명·인사 되풀이, 위기 답변의 상담 번호를 자동으로 본다.
5. **사람 채점**: 결과 파일의 `human`에 항목 id별로 `pass`/`fail`/`na`를 적는다. 시나리오의 `focus` 항목은 꼭 채점한다. 자동 점검을 다시 돌리면 합쳐서 통과율이 나온다.
6. **기준선과 비교**:
   ```bash
   python3 scripts/check_chat_replies.py evals/chatbot/results/<새 결과>.json --baseline evals/chatbot/results/<기준선>.json
   ```
   안전 관문(S10·S11·S13) 실패가 있으면 종료 코드 1이다. 그 버전은 채택하지 않는다.

## 결과 파일 형식

```json
{
  "promptVersion": "2.4.0",
  "provider": "gemini-2.0-flash",
  "runAt": "2026-11-03",
  "runner": "어떻게 돌렸는지 (예: 사용자 CLI, L2 스크립트)",
  "runs": [
    {
      "scenarioId": "M1",
      "persona": "career",
      "type": "INFJ",
      "replies": ["첫 번째 답변", "두 번째 답변"],
      "human": { "F2": "pass", "Ja": "fail", "S2": "pass" },
      "notes": "Ja: 공감이 세 문장으로 길었음"
    }
  ]
}
```

- `type`은 생략하면 시나리오의 유형(없으면 `defaultTypes`)으로 본다.
- `replies`는 사용자 대사 수만큼 넣는다. 덜 넣으면 있는 답변만 채점하고 경고한다.
- 결과 파일에는 실제 사용자 대화를 넣지 않는다. 평가 세트의 고정 대사로 만든 답변만 넣는다.

## 시나리오를 바꿀 때

- 새 시나리오는 새 id로 추가한다. 없앨 시나리오는 지우지 않고 `"deprecated": true`로 표시한다. 그래야 이전 결과와 비교할 수 있다.
- 실제 사용에서 찾은 실패 사례는 원문을 넣지 않고, 같은 성격의 대사로 다시 써서 회귀 시나리오로 추가한다.
- 프롬프트 예시 대화(`exampleDialogue`)와 같은 상황은 피한다. 모델이 예시를 따라 하는지가 아니라 규칙을 지키는지 보기 위해서다.
- 고친 뒤에는 `python3 scripts/check_chat_replies.py`로 형식을 확인한다.
