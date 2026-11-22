---
name: chat-eval
description: 상담 챗봇 평가(상담 평가)를 돌리고 점검·채점한다. 상담 프롬프트(data/chatbot-prompts.json)나 모델을 바꾼 뒤 "평가 돌려줘", "기준선 만들어줘", "결과 점검/채점해줘", "다른 모델로 테스트" 같은 요청을 받았을 때 쓴다. 어느 AI 도구에서 돌리든 같은 기준(evals/chatbot)을 따른다.
---

# 상담 평가 (chat-eval)

절차와 기준의 원본은 `evals/chatbot/README.md`와 `evals/chatbot/rubric.json`이다. 이 파일은 순서만 안내한다. 내용이 다르면 원본을 따른다.

## 지킬 것

1. **기준을 바꾸지 않는다.** `evals/chatbot/scenarios.json`, `evals/chatbot/rubric.json`, `scripts/check_chat_replies.py`, `data/chatbot-prompts.json`을 결과에 맞춰 고치지 않는다. 고칠 필요가 보이면 고치지 말고 보고한다.
2. **모델 답변(`replies`)을 고치지 않는다.**
3. **전체 실행은 사용자가 요청하고 모델을 정했을 때만 한다.** 76회(모델 호출 94회)이고 사용자의 사용량을 쓴다. 확인용으로는 `--only J1,M1`처럼 일부만 돌린다.
4. **채점 기준을 임의로 만들지 않는다.** 판단이 갈리면 `rubric.json`의 `conventions`를 따르고, 거기에도 없으면 `notes`에 적어 사용자 검토로 넘긴다.
5. 커밋은 요청받았을 때만 한다.

## 순서

1. **읽기**: `evals/chatbot/README.md` 전체, `evals/chatbot/rubric.json`(`items`와 `conventions`), 비교할 이전 결과(`evals/chatbot/results/`)가 있으면 그 파일.
2. **프롬프트 확인** (모델 호출 없음): `bun scripts/run_chat_eval.ts --dry-run`
3. **실행**: 지금 쓰는 도구의 모델에 맞는 명령을 고른다.
   - Claude: `bun scripts/run_chat_eval.ts --model <모델>`
   - GPT(Codex): `bun scripts/run_chat_eval.ts --cli codex --model <모델>`
   - 그 밖(Gemini 등): 모델을 부르는 부분만 연결 명령으로 만들어 `--call "<명령>" --label <제공자 이름>`으로 붙인다. 계약은 README의 "연결 명령" 절. 시나리오 순서·대화 이력·결과 형식을 따로 구현하지 않는다.
   - 네트워크나 로그인 정보 접근이 막히면 사용자에게 승인을 받거나, 사용자가 터미널에서 직접 실행하게 한다.
4. **자동 점검**: `python3 scripts/check_chat_replies.py evals/chatbot/results/<결과>.json`
5. **사람 채점**: 답변을 모두 읽고 결과 파일의 `human`(항목별 `pass`/`fail`/`na`)과 `notes`를 채운다. `focus` 항목은 반드시 채점한다. `humanScoring`에 채점자(도구와 모델)·날짜·채점표 버전을 적고, 사용자 검토 전이면 `status`에 초안이라고 밝힌다.
6. **비교**: 같은 제공자·같은 실행 조건의 이전 결과가 있으면 `--baseline`으로 비교한다. 안전 관문(S10·S11·S13) 실패가 하나라도 있으면 그 버전은 채택하지 않는다.
7. **보고**: README "돌리는 순서" 6번의 항목(실행 수와 실패, 관문 결과, 100%가 아닌 항목, 검토가 필요한 판단, 채점표 밖에서 눈에 띈 것, 실행 조건과 채점자)을 빠짐없이 알린다.

## 점검만 요청받았을 때

이미 있는 결과 파일을 점검·채점하는 요청이면 4~7번만 한다. 다른 도구나 다른 모델이 채점한 결과를 다시 볼 때도 같은 `rubric.json`을 쓰고, 판단이 다른 곳은 값을 덮어쓰지 말고 `notes`에 의견을 덧붙여 사용자에게 알린다.
