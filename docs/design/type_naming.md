# 16유형 이름 체계 — 16가지 꽃, 네 계절 정원

> 상태: **초안 (1차 확정 시안에 반영됨)** · 작성일: 2026-10-30
> 시안: `docs/design/mockups/round2/02-16-flowers.png`
> 아이콘: `docs/design/assets/flowers/{CODE}-{slug}.svg`

## 1. 왜 바꾸나

현재 데이터의 유형 별칭(전략가 · 중재자 …)과 그룹명(분석가 · 외교관 · 관리자 · 탐험가)이 16Personalities 한국어판과 대부분 같다. 세계관(마음 정원)에 맞춰 **꽃 이름 + 네 계절 정원**으로 바꾼다. 성격 유형 코드(INFP 등)는 그대로 쓴다.

## 2. 매핑

| 코드 | 꽃 | 일본어 | 우리 정원 꽃말 | 계절 정원 | 이전 별칭 | 아이콘 |
|---|---|---|---|---|---|---|
| INFJ | 목련 | モクレン | 잎보다 먼저 봄을 알아채요 | 봄 | 옹호자 | INFJ-magnolia.svg |
| INFP | 제비꽃 | スミレ | 작아도 제 빛깔을 지켜요 | 봄 | 중재자 | INFP-violet.svg |
| ENFJ | 프리지아 | フリージア | 곁의 새 출발을 응원해요 | 봄 | 선도자 | ENFJ-freesia.svg |
| ENFP | 민들레 | タンポポ | 바람 타고 어디서든 피어나요 | 봄 | 활동가 | ENFP-dandelion.svg |
| ISTP | 수련 | スイレン | 고요한 물 위에서 제때 피어요 | 여름 | 장인 | ISTP-water-lily.svg |
| ISFP | 수국 | アジサイ | 머문 땅의 빛깔로 물들어요 | 여름 | 모험가 | ISFP-hydrangea.svg |
| ESTP | 나팔꽃 | アサガオ | 닿는 곳을 잡고 성큼 올라가요 | 여름 | 사업가 | ESTP-morning-glory.svg |
| ESFP | 해바라기 | ヒマワリ | 해를 따라 환하게 고개를 돌려요 | 여름 | 연예인 | ESFP-sunflower.svg |
| INTJ | 용담 | リンドウ | 서두르지 않고 끝을 내다보며 피어요 | 가을 | 전략가 | INTJ-gentian.svg |
| INTP | 코스모스 | コスモス | 작은 꽃 안에 우주를 품어요 | 가을 | 논리술사 | INTP-cosmos.svg |
| ENTJ | 달리아 | ダリア | 겹겹이 꽃잎을 짜 맞춰 피어요 | 가을 | 통솔자 | ENTJ-dahlia.svg |
| ENTP | 금목서 | キンモクセイ | 향이 먼저 골목을 건너가요 | 가을 | 변론가 | ENTP-osmanthus.svg |
| ISTJ | 동백 | ツバキ | 추운 날에도 약속처럼 피어요 | 겨울 | 현실주의자 | ISTJ-camellia.svg |
| ISFJ | 매화 | ウメ | 찬 바람 속에 먼저 온기를 나눠요 | 겨울 | 수호자 | ISFJ-plum-blossom.svg |
| ESTJ | 호랑가시나무 | ヒイラギ | 겨울 숲의 길을 든든히 지켜요 | 겨울 | 경영자 | ESTJ-holly.svg |
| ESFJ | 포인세티아 | ポインセチア | 모두 모이는 계절을 환하게 밝혀요 | 겨울 | 외교관 | ESFJ-poinsettia.svg |

### 계절 정원 (그룹)

| 계절 | 기존 group 키 | 기존 그룹명 | 한 줄 | 색 (tint / dot) |
|---|---|---|---|---|
| 봄 정원 | diplomats (NF) | 외교관 | 마음을 먼저 틔우는 꽃들 | #FBE3E8 / #D97A92 |
| 여름 정원 | explorers (SP) | 탐험가 | 지금 이 순간 활짝 피는 꽃들 | #DDEDF4 / #5E97B5 |
| 가을 정원 | analysts (NT) | 분석가 | 생각을 깊게 여무는 꽃들 | #F8E5CF / #C98544 |
| 겨울 정원 | sentinels (SJ) | 관리자 | 찬 바람에도 곁을 지키는 꽃들 | #E7E5F3 / #7F78B8 |

## 3. 정한 기준

1. **우열 없음**: 모든 꽃은 같은 크기, 같은 원 안에 그린다. 계절 색은 밝기·채도를 맞춘다. 희귀도·크기·밝기로 차이를 두지 않는다.
2. **꽃말은 새로 쓴다**: 전통 꽃말을 인용하지 않는다(출처마다 다르고, 부정적 꽃말이 섞여 있음). 카피 톤 가이드(해요체, 단정·비교 금지)를 따른다.
3. **제외한 꽃**: 흰 국화(한국 조문 연상), 수선화(자기애 꽃말이 널리 알려짐). 1차 시안의 INFP 패랭이꽃은 제비꽃으로 바꿨다.
4. **한·일 공통**: 두 나라 모두 익숙한 꽃 위주로 골랐다. 일본어판은 같은 꽃의 일본 이름을 쓴다.
5. **표기**: 첫 등장 `제비꽃(INFP)`, 이후 `제비꽃 유형`. 그룹은 `봄 정원`.

## 4. 확정 전 확인할 것

- [ ] 꽃 16종·꽃말 문구 최종 검수 (사용자)
- [ ] 일본어 꽃말 문구 작성 (현재는 꽃 이름만 있음)
- [ ] 서비스명 '피어나'(가칭) 상표 검색

## 5. 확정 뒤 데이터 반영 목록 (개발 단계에서 진행 — 아직 하지 않음)

| 파일 | 바꿀 곳 |
|---|---|
| `data/profiles.json` | 각 유형 `nickname` → 꽃 이름, `groupLabel` → 계절 정원 이름. 새 필드 제안: `flower`(이름·일본어·slug), `flowerLine`(우리 정원 꽃말), `season` |
| `data/profiles.json` | `introduction` 등 본문 속 기존 별칭("INFP 중재자는 …") 치환 |
| `docs/plan/copy_tone_guide.md` §4 | 유형 표기 규칙: "중재자(INFP)" → "제비꽃(INFP)" |
| `docs/plan/report_spec.md` | 별칭이 들어간 예시 문구 |
| `data/flow-copy.json` | `share.shareTitle` 의 `{nickname}` 은 그대로 두면 꽃 이름으로 바뀜. 결과 확인 |
| `data/chatbot-prompts.json` | 인사말·프롬프트의 `{nickname}` 치환 결과 확인("제비꽃 유형의 강점과 연결해서") |
| `data/compatibility.json`, `famous-people.json` | 별칭 문자열 포함 여부 확인 |
| `scripts/check_report_copy.py` | 기존 별칭이 남아 있으면 경고하는 점검 추가 |
