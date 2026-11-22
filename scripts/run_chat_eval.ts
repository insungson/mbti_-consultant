#!/usr/bin/env bun
// 상담 평가 실행 — evals/chatbot/scenarios.json 을 모델에 돌려 결과 파일을 만든다.
// 절차와 기준: evals/chatbot/README.md · 평가 단계: docs/plan/chatbot_eval_plan.md (L0·L1)
//
// 사용:
//   bun scripts/run_chat_eval.ts --dry-run                          프롬프트 묶음만 저장 (모델 호출 없음)
//   bun scripts/run_chat_eval.ts --model sonnet                     Claude CLI로 전체 실행
//   bun scripts/run_chat_eval.ts --cli codex --model gpt-6.1-sol    Codex CLI로 전체 실행
//   bun scripts/run_chat_eval.ts --call "<명령>" --label <이름>     그 밖의 모델 (연결 명령은 README 참고)
//   … --only J1,M8/relationship   일부만 실행      … --force   답변이 있는 실행도 다시 돌림
//
// 어떤 모델로 돌리든 프롬프트(lib/chatbot 의 buildMessages·detectCrisis), 사용자 대사, 결과 형식은 같다.
// 달라지는 것은 모델을 부르는 부분(아래 "모델 호출")뿐이다.
// node: 표준 모듈만 쓰므로 `npx tsx scripts/run_chat_eval.ts` 로도 돌릴 수 있다.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMessages } from "../lib/chatbot/buildPrompt";
import { detectCrisis } from "../lib/chatbot/safety";
import type { ChatMessage, ChatbotPrompts, TypeProfile } from "../lib/chatbot/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_DIR = join(ROOT, "evals", "chatbot");
const RESULTS_DIR = join(EVAL_DIR, "results");
const RENDERED_DIR = join(EVAL_DIR, "rendered");

/** 한 번의 모델 호출 제한 시간 */
const CALL_TIMEOUT_MS = 180_000;
/** 멀티턴 프롬프트를 모델 답변 없이 뽑을 때 쓰는 자리 표시 */
const PLACEHOLDER_REPLY = "(모델 답변)";

interface Scenario {
  id: string;
  group?: string;
  personas: string[];
  type?: string;
  crisis?: boolean;
  /** 하랑 시나리오의 상대 유형 → getAdvice()처럼 궁합 데이터를 붙인다 */
  partnerType?: string;
  /** 모델에 보내는 이전 대화를 최근 N개 메시지로 자른다 (서비스의 '최근 12개') */
  historyLimit?: number;
  turns: string[];
  expect?: string;
  focus?: string[];
  deprecated?: boolean;
}

interface ScenariosFile {
  defaultTypes: Record<string, string>;
  scenarios: Scenario[];
}

/** 시나리오 × 캐릭터 = 한 번의 실행 */
interface EvalRun {
  scenario: Scenario;
  persona: string;
  type: string;
}

/** 결과 파일의 runs[*] (evals/chatbot/README.md) */
interface RunRecord {
  scenarioId: string;
  persona: string;
  type: string;
  replies: string[];
  human: Record<string, string>;
  notes: string;
}

interface ResultsFile {
  promptVersion: string;
  provider: string;
  runAt: string;
  runner: string;
  runs: RunRecord[];
}

interface Options {
  dryRun: boolean;
  force: boolean;
  skipCheck: boolean;
  cli: string;
  call?: string;
  label?: string;
  model?: string;
  only?: string[];
  out?: string;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** 화면에 보여 줄 경로. 저장소 안이면 저장소 기준, 밖이면 절대 경로 */
function displayPath(path: string): string {
  const rel = relative(ROOT, path);
  return rel.startsWith("..") ? path : rel;
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false, force: false, skipCheck: false, cli: "claude" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? fail(`${arg} 뒤에 값이 필요해요.`);
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--skip-check") opts.skipCheck = true;
    else if (arg === "--cli") opts.cli = value();
    else if (arg === "--call") opts.call = value();
    else if (arg === "--label") opts.label = value();
    else if (arg === "--model") opts.model = value();
    else if (arg === "--out") opts.out = value();
    else if (arg === "--only") opts.only = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "사용: bun scripts/run_chat_eval.ts [옵션]",
          "  --dry-run         프롬프트 묶음만 evals/chatbot/rendered/ 에 저장 (모델 호출 없음)",
          "  --cli <이름>      모델을 부를 CLI: claude(기본) | codex",
          "  --model <이름>    모델 (예: claude → sonnet·opus, codex → gpt-6.1-sol). --cli 실행에 필요",
          "  --call <명령>     그 밖의 모델을 부르는 연결 명령. 요청 JSON을 stdin으로 받고 답변을 stdout으로 낸다",
          "  --label <이름>    --call 실행의 제공자 이름 (예: gemini-3-pro). 결과 파일 이름에 쓴다",
          "  --only <목록>     일부만 실행. 쉼표로 구분: J1,M8/relationship",
          "  --force           답변이 있는 실행도 다시 돌림 (그 실행의 사람 채점은 비움)",
          "  --out <경로>      결과 파일 경로 (기본: evals/chatbot/results/<오늘>_v<버전>_<제공자>.json)",
          "  --skip-check      실행 전 격리 확인을 건너뜀",
        ].join("\n")
      );
      process.exit(0);
    } else fail(`알 수 없는 옵션: ${arg} (--help 참고)`);
  }
  return opts;
}

/** scripts/check_chat_replies.py 의 expected_runs() 와 같은 규칙 */
function expandRuns(file: ScenariosFile): EvalRun[] {
  const runs: EvalRun[] = [];
  for (const scenario of file.scenarios) {
    if (scenario.deprecated) continue;
    for (const persona of scenario.personas) {
      runs.push({ scenario, persona, type: scenario.type ?? file.defaultTypes[persona] });
    }
  }
  return runs;
}

const runKey = (scenarioId: string, persona: string) => `${scenarioId}/${persona}`;

function filterRuns(runs: EvalRun[], only: string[] | undefined): EvalRun[] {
  if (!only) return runs;
  for (const item of only) {
    const hit = runs.some((r) => r.scenario.id === item || runKey(r.scenario.id, r.persona) === item);
    if (!hit) fail(`--only 에 맞는 실행이 없어요: ${item}`);
  }
  return runs.filter(
    (r) => only.includes(r.scenario.id) || only.includes(runKey(r.scenario.id, r.persona))
  );
}

/** getAdvice()(lib/chatbot/index.ts)와 같은 방식으로 이번 대사의 요청 메시지를 만든다 */
function renderTurn(
  prompts: ChatbotPrompts,
  profile: TypeProfile,
  persona: string,
  history: ChatMessage[],
  userMessage: string,
  extraContext?: string
): { system: string; crisis: boolean } {
  const keywords = prompts.shared.crisisProtocol?.keywords ?? [];
  const crisis = detectCrisis(userMessage, keywords).length > 0;
  const messages = buildMessages({
    prompts,
    personaId: persona,
    profile,
    history,
    userMessage,
    extraContext,
    crisisDetected: crisis,
  });
  return { system: messages[0].content, crisis };
}

type CompatMatrix = { matrix: Record<string, Record<string, unknown>> };

/** getAdvice()(lib/chatbot/index.ts)와 같은 궁합 컨텍스트. 관계 캐릭터 + partnerType 일 때만 */
function compatContext(
  prompts: ChatbotPrompts,
  compat: CompatMatrix,
  persona: string,
  type: string,
  partner?: string
): string | undefined {
  if (!partner || !prompts.personas[persona]?.needsCompatibility) return undefined;
  const cell = compat.matrix?.[type]?.[partner];
  return cell ? `사용자(${type})와 상대(${partner})의 궁합 데이터:\n${JSON.stringify(cell, null, 2)}` : undefined;
}

/** 서비스처럼 최근 N개 메시지만 보낸다 */
const limitHistory = (history: ChatMessage[], limit?: number) =>
  limit && limit > 0 ? history.slice(-limit) : history;

// ── 프롬프트 묶음 (--dry-run) ─────────────────────────────────────────────

function writeRendered(
  runs: EvalRun[],
  prompts: ChatbotPrompts,
  profiles: Record<string, TypeProfile>,
  compat: CompatMatrix,
  version: string
): void {
  const outDir = join(RENDERED_DIR, `v${version}`);
  rmSync(outDir, { recursive: true, force: true }); // 다시 만들 수 있는 파일만 있는 폴더
  mkdirSync(outDir, { recursive: true });

  const rows: string[] = [];
  let turnCount = 0;
  const warnings: string[] = [];

  for (const run of runs) {
    const { scenario, persona, type } = run;
    const dirName = `${scenario.id}-${persona}-${type}`;
    const runDir = join(outDir, dirName);
    mkdirSync(runDir, { recursive: true });

    const history: ChatMessage[] = [];
    const flags: string[] = [];
    let crisisSeen = false;
    const extra = compatContext(prompts, compat, persona, type, scenario.partnerType);
    scenario.turns.forEach((userMessage, i) => {
      const sent = limitHistory(history, scenario.historyLimit);
      const { system, crisis } = renderTurn(prompts, profiles[type], persona, sent, userMessage, extra);
      writeFileSync(join(runDir, `turn${i + 1}.system.txt`), `${system}\n`);
      writeFileSync(join(runDir, `turn${i + 1}.user.txt`), `${userMessage}\n`);
      flags.push(
        `${i + 1}: ${system.length.toLocaleString()}자` +
          (sent.length > 0 ? " · 이어지는 대화" : "") +
          (sent.length < history.length ? ` · 이력 ${sent.length}/${history.length}개만` : "") +
          (extra ? " · 궁합 데이터" : "") +
          (crisis ? " · 위기 알림" : "")
      );
      crisisSeen ||= crisis;
      history.push({ role: "user", content: userMessage }, { role: "assistant", content: PLACEHOLDER_REPLY });
      turnCount++;
    });

    if (Boolean(scenario.crisis) !== crisisSeen) {
      warnings.push(
        `${runKey(scenario.id, persona)}: scenarios.json crisis=${Boolean(scenario.crisis)} 인데 코드 안전망 감지=${crisisSeen}`
      );
    }
    rows.push(
      `| ${scenario.id} | ${persona} | ${type} | ${flags.join("<br>")} | ${scenario.expect ?? ""} | ${(scenario.focus ?? []).join(", ")} | \`${dirName}/\` |`
    );
  }

  const index = [
    `# 상담 평가 프롬프트 묶음 — 프롬프트 v${version}`,
    "",
    "`bun scripts/run_chat_eval.ts --dry-run` 이 만든 파일이다. 직접 고치지 않는다(다시 만들면 덮어쓴다).",
    "`turnN.system.txt` 는 N번째 대사를 보낼 때의 시스템 프롬프트, `turnN.user.txt` 는 사용자 대사다.",
    "",
    `실행 ${runs.length}회 · 대사 ${turnCount}개`,
    "",
    "| 시나리오 | 캐릭터 | 유형 | 대사별 프롬프트 | 기대 행동 | 중점 항목 | 폴더 |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  writeFileSync(join(outDir, "index.md"), index);

  console.log(`[프롬프트 묶음] 실행 ${runs.length}회 · 대사 ${turnCount}개 → ${displayPath(outDir)}/`);
  for (const w of warnings) console.log(`  ⚠️ ${w}`);
}

// ── 모델 호출 ─────────────────────────────────────────────────────────────
// 모델마다 달라지는 부분은 여기뿐이다. 새 CLI를 붙일 때는 Adapter 하나를 더한다.

interface CallInput {
  system: string;
  user: string;
  /** 이번 대사 앞의 대화(모델의 실제 답변). 세션을 쓰지 않는 방식(--call)에 그대로 넘긴다 */
  history: ChatMessage[];
  model?: string;
  /** CLI를 실행할 빈 작업 폴더 (저장소의 CLAUDE.md·AGENTS.md·메모리가 섞이지 않게 한다) */
  workDir: string;
  /** 멀티턴 실행에서만 있다. 첫 대사에서 세션 id를 적어 두고 다음 대사에서 이어 간다 */
  session?: { id?: string };
}

interface CallOutput {
  text: string;
  /** 입력 토큰 수 (알 수 없으면 undefined) */
  inputTokens?: number;
  /** CLI가 알려 준 실제 모델 id */
  modelIds: string[];
}

interface Adapter {
  /** 결과 파일 이름과 provider 에 쓰는 이름 */
  label: string;
  /** 결과 파일 runner 에 적는 실행 조건 */
  runner: string;
  /** 격리 확인 기준(짧은 요청의 입력 토큰). 없으면 확인하지 않는다 */
  isolationMaxTokens?: number;
  call(input: CallInput): CallOutput;
}

const safeLabel = (text: string) => text.replace(/[^A-Za-z0-9._-]/g, "-");

function cliVersion(bin: string, pick: (out: string) => string): string {
  const proc = spawnSync(bin, ["--version"], { encoding: "utf-8" });
  if (proc.error || proc.status !== 0) {
    fail(`${bin} CLI를 찾을 수 없어요. 터미널에서 \`${bin} --version\` 이 되는지 확인해 주세요.`);
  }
  return pick(proc.stdout.trim());
}

function run(bin: string, args: string[], input: CallInput, useShell = false) {
  const proc = spawnSync(bin, args, {
    cwd: input.workDir,
    input: input.user,
    encoding: "utf-8",
    timeout: CALL_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    shell: useShell,
  });
  if (proc.error) throw new Error(`${bin} 실행 실패: ${proc.error.message}`);
  return proc;
}

/**
 * Claude CLI. 시스템 프롬프트를 바꿔도 CLI가 에이전트 소개 한 문장과 작업 환경 정보(약 600토큰)를 덧붙인다.
 */
function claudeAdapter(model: string): Adapter {
  const version = cliVersion("claude", (out) => out.split(/\s+/)[0]);
  return {
    label: safeLabel(model.startsWith("claude") ? model : `claude-${model}`),
    runner:
      `claude CLI ${version} · scripts/run_chat_eval.ts · 시스템 프롬프트 교체, 도구 없음, 빈 작업 폴더 ` +
      "(CLI가 에이전트 소개 한 문장과 작업 환경 정보를 덧붙임, temperature 지정 불가)",
    isolationMaxTokens: 2000,
    call(input) {
      const s = input.session;
      let sessionArgs: string[];
      if (!s) sessionArgs = ["--no-session-persistence"];
      else if (!s.id) sessionArgs = ["--session-id", (s.id = randomUUID())];
      else sessionArgs = ["--resume", s.id];
      const proc = run(
        "claude",
        [
          "-p",
          "--system-prompt", input.system, // 기본 시스템 프롬프트를 상담 프롬프트로 교체
          "--system-prompt-snapshot", "off", // 재개할 때 바뀐 프롬프트([이어지는 대화])가 적용되게 한다
          "--tools", "", // 도구 없음
          "--safe-mode", // CLAUDE.md·스킬·플러그인·훅·MCP 끔 (로그인은 유지)
          "--output-format", "json",
          "--model", model,
          ...sessionArgs,
        ],
        input
      );
      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(proc.stdout);
      } catch {
        const detail = (proc.stderr || proc.stdout || "").trim().slice(0, 400);
        throw new Error(`claude 출력이 JSON이 아님 (종료 코드 ${proc.status}): ${detail}`);
      }
      const text = typeof parsed.result === "string" ? parsed.result.trim() : "";
      if (parsed.is_error || !text) {
        throw new Error(`claude 오류 (${parsed.subtype ?? "?"}): ${String(parsed.result ?? "").slice(0, 400)}`);
      }
      const usage = parsed.usage ?? {};
      return {
        text,
        inputTokens:
          (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0),
        modelIds: Object.keys(parsed.modelUsage ?? {}),
      };
    },
  };
}

/** Codex가 덧붙이는 내용을 줄이려고 끄는 기능 (끌 수 있는 것만. 스킬 목록·에이전트 안내·도구 설명 일부는 남는다) */
const CODEX_DISABLED_FEATURES = [
  "plugins", "apps", "multi_agent", "skill_search", "goals", "hooks",
  "tool_suggest", "image_generation", "view_image", "sleep_tool",
];

/**
 * Codex CLI (codex exec). 기본 지침을 상담 프롬프트 파일로 바꾼다(model_instructions_file).
 * 사용자 설정·저장소 AGENTS.md는 읽지 않지만, Codex가 스킬 목록·에이전트 안내·도구 설명을 덧붙인다(약 1만 토큰).
 */
function codexAdapter(model: string): Adapter {
  const version = cliVersion("codex", (out) => out.split(/\s+/).pop() ?? out);
  return {
    label: safeLabel(`codex-${model}`),
    runner:
      `codex CLI ${version} (codex exec) · scripts/run_chat_eval.ts · 기본 지침을 상담 프롬프트로 교체, ` +
      "사용자 설정·AGENTS.md 제외, 빈 작업 폴더, 읽기 전용 " +
      "(Codex가 스킬 목록·에이전트 안내·도구 설명을 덧붙임, temperature 지정 불가)",
    isolationMaxTokens: 16000,
    call(input) {
      const systemFile = join(input.workDir, "system.md");
      const replyFile = join(input.workDir, "reply.txt");
      writeFileSync(systemFile, input.system);
      rmSync(replyFile, { force: true });
      const s = input.session;
      const common = [
        "--json",
        "--skip-git-repo-check",
        "--ignore-user-config", // 사용자 설정(플러그인·MCP·기본 모델)을 읽지 않는다. 로그인은 유지
        "-m", model,
        "-c", `model_instructions_file=${JSON.stringify(systemFile)}`, // 기본 지침 교체
        "-c", "project_doc_max_bytes=0", // AGENTS.md 를 읽지 않는다
        ...CODEX_DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
        "-o", replyFile,
      ];
      const args = s?.id
        ? ["exec", "resume", s.id, ...common, "-"]
        : ["exec", ...common, "-s", "read-only", ...(s ? [] : ["--ephemeral"]), "-"];
      const proc = run("codex", args, input);

      let inputTokens: number | undefined;
      let lastMessage = "";
      let errorDetail = "";
      for (const line of proc.stdout.split("\n")) {
        let event: Record<string, any>;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "thread.started" && s && !s.id) s.id = event.thread_id;
        else if (event.type === "turn.completed") inputTokens = event.usage?.input_tokens;
        else if (event.type === "item.completed" && event.item?.type === "agent_message") lastMessage = event.item.text ?? "";
        else if (event.type === "error" || event.type === "turn.failed") errorDetail = JSON.stringify(event).slice(0, 400);
      }
      const text = (existsSync(replyFile) ? readFileSync(replyFile, "utf-8") : lastMessage).trim();
      if (errorDetail || proc.status !== 0 || !text) {
        const detail = errorDetail || (proc.stderr || proc.stdout || "").trim().slice(-400);
        throw new Error(`codex 오류 (종료 코드 ${proc.status}): ${detail}`);
      }
      if (s && !s.id) throw new Error("codex 세션 id를 받지 못해 다음 대사를 이어 갈 수 없음");
      return { text, inputTokens, modelIds: [] };
    },
  };
}

/**
 * 연결 명령(--call). 그 밖의 모델·도구를 붙이는 자리다.
 * 명령은 stdin 으로 요청 JSON { system, messages:[{role,content}…], model } 을 받고, 답변 본문만 stdout 으로 낸다.
 * messages 는 앞선 대화(모델의 실제 답변) + 이번 사용자 대사다. 실패하면 0이 아닌 종료 코드를 낸다.
 */
function customAdapter(command: string, label: string): Adapter {
  return {
    label: safeLabel(label),
    runner: `연결 명령(--call) ${command} · scripts/run_chat_eval.ts`,
    call(input) {
      const request = {
        system: input.system,
        messages: [...input.history, { role: "user", content: input.user }],
        model: input.model ?? null,
      };
      // 연결 명령은 호출한 자리(저장소)에서 실행한다. 격리는 연결 명령이 맡는다.
      const proc = run(command, [], { ...input, user: JSON.stringify(request), workDir: process.cwd() }, true);
      const text = (proc.stdout ?? "").trim();
      if (proc.status !== 0 || !text) {
        throw new Error(`연결 명령 오류 (종료 코드 ${proc.status}): ${(proc.stderr || "").trim().slice(-400)}`);
      }
      return { text, modelIds: [] };
    },
  };
}

function pickAdapter(opts: Options): Adapter {
  if (opts.call) {
    return customAdapter(opts.call, opts.label ?? fail("--call 에는 --label 이 필요해요 (예: --label gemini-3-pro)."));
  }
  const model = opts.model ?? fail("--model 이 필요해요 (예: --model sonnet). 프롬프트만 뽑으려면 --dry-run.");
  if (opts.cli === "claude") return claudeAdapter(model);
  if (opts.cli === "codex") return codexAdapter(model);
  return fail(`지원하지 않는 --cli: ${opts.cli} (claude | codex). 그 밖의 모델은 --call 을 써 주세요.`);
}

/** 아주 짧은 요청으로 CLI가 덧붙이는 내용의 크기를 재서, 기본 지침·저장소 지침이 섞이지 않았는지 확인한다 */
function checkIsolation(adapter: Adapter, model: string | undefined, workDir: string): CallOutput | null {
  const max = adapter.isolationMaxTokens;
  if (max === undefined) {
    console.log("[격리 확인] 건너뜀 — 연결 명령(--call)은 덧붙는 내용을 잴 수 없어요. 조건은 연결 명령 쪽에서 맞춰 주세요.");
    return null;
  }
  const out = adapter.call({ system: "한 단어로만 답한다.", user: "안녕", history: [], model, workDir });
  if (out.inputTokens === undefined) {
    console.log("[격리 확인] 입력 토큰 수를 받지 못해 확인하지 못했어요.");
    return out;
  }
  if (out.inputTokens > max) {
    fail(
      `격리 확인 실패: 짧은 요청의 입력이 ${out.inputTokens}토큰이에요 (기준 ${max} 이하). ` +
        "CLI의 기본 지침이나 저장소 지침이 섞이면 평가 결과를 믿을 수 없어 멈춰요. " +
        "CLI 버전이 바뀌었는지 확인하고, 그래도 진행하려면 --skip-check 를 붙여 주세요."
    );
  }
  console.log(`[격리 확인] OK — 짧은 요청 입력 ${out.inputTokens}토큰 (기준 ${max} 이하)`);
  return out;
}

// ── 실행 ──────────────────────────────────────────────────────────────────

/** 한 실행(시나리오 × 캐릭터)의 대사를 순서대로 보내고 답변을 모은다 */
function runOnce(
  evalRun: EvalRun,
  prompts: ChatbotPrompts,
  profile: TypeProfile,
  compat: CompatMatrix,
  adapter: Adapter,
  model: string | undefined,
  workDir: string
): string[] {
  const { scenario, persona } = evalRun;
  const extra = compatContext(prompts, compat, persona, evalRun.type, scenario.partnerType);
  const session = scenario.turns.length > 1 ? {} : undefined;
  const history: ChatMessage[] = [];
  const replies: string[] = [];
  for (const userMessage of scenario.turns) {
    const sent = limitHistory(history, scenario.historyLimit);
    const { system } = renderTurn(prompts, profile, persona, sent, userMessage, extra);
    const { text } = adapter.call({ system, user: userMessage, history: [...sent], model, workDir, session });
    replies.push(text);
    history.push({ role: "user", content: userMessage }, { role: "assistant", content: text });
  }
  return replies;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isComplete(record: RunRecord | undefined, evalRun: EvalRun): boolean {
  return (
    !!record &&
    record.replies.length === evalRun.scenario.turns.length &&
    record.replies.every((r) => typeof r === "string" && r.trim().length > 0)
  );
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));

  const prompts = loadJson<ChatbotPrompts>(join(ROOT, "data", "chatbot-prompts.json"));
  const profiles = loadJson<{ profiles: Record<string, TypeProfile> }>(join(ROOT, "data", "profiles.json")).profiles;
  const scenarios = loadJson<ScenariosFile>(join(EVAL_DIR, "scenarios.json"));
  const compat = loadJson<CompatMatrix>(join(ROOT, "data", "compatibility.json"));
  const version = String(prompts._meta.version ?? "unknown");

  const allRuns = expandRuns(scenarios);
  for (const r of allRuns) {
    if (!prompts.personas[r.persona]) fail(`${r.scenario.id}: 알 수 없는 캐릭터 ${r.persona}`);
    if (!profiles[r.type]) fail(`${r.scenario.id}: 알 수 없는 유형 ${r.type}`);
    if (r.scenario.partnerType && !profiles[r.scenario.partnerType]) fail(`${r.scenario.id}: 알 수 없는 상대 유형 ${r.scenario.partnerType}`);
  }
  const runs = filterRuns(allRuns, opts.only);

  if (opts.dryRun) {
    writeRendered(runs, prompts, profiles, compat, version);
    return;
  }

  const adapter = pickAdapter(opts);
  const outPath = opts.out ? resolve(opts.out) : join(RESULTS_DIR, `${today()}_v${version}_${adapter.label}.json`);

  const results: ResultsFile = existsSync(outPath)
    ? loadJson<ResultsFile>(outPath)
    : { promptVersion: version, provider: adapter.label, runAt: today(), runner: adapter.runner, runs: [] };
  if (results.promptVersion !== version) {
    fail(
      `결과 파일의 프롬프트 버전(${results.promptVersion})이 현재(${version})와 달라요. ` +
        "버전이 섞이지 않게 --out 으로 새 파일을 지정해 주세요."
    );
  }
  const isNewFile = results.runs.length === 0;

  const records = new Map<string, RunRecord>(results.runs.map((r) => [runKey(r.scenarioId, r.persona), r]));
  const save = () => {
    const expected = allRuns.map((r) => runKey(r.scenario.id, r.persona));
    const ordered = expected.filter((k) => records.has(k)).map((k) => records.get(k)!);
    const others = [...records].filter(([k]) => !expected.includes(k)).map(([, r]) => r);
    results.runs = [...ordered, ...others];
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  };

  if (!opts.call && runs.some((r) => r.scenario.historyLimit)) {
    console.log("⚠️ historyLimit 시나리오가 있어요. claude·codex CLI는 세션이 전체 대화를 기억해서 이력 자르기가 정확하지 않아요(--call 에서만 정확).");
  }
  const todo = runs.filter((r) => opts.force || !isComplete(records.get(runKey(r.scenario.id, r.persona)), r));
  const calls = todo.reduce((n, r) => n + r.scenario.turns.length, 0);
  console.log(
    `[실행] 프롬프트 v${version} · ${adapter.label} · 실행 ${todo.length}회(호출 ${calls}회)` +
      (runs.length > todo.length ? ` · 이미 끝난 ${runs.length - todo.length}회는 건너뜀` : "")
  );
  console.log(`[결과] ${displayPath(outPath)}`);
  if (todo.length === 0) {
    console.log("돌릴 실행이 없어요. 다시 돌리려면 --force 를 붙여 주세요.");
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "eval-"));
  const failed: string[] = [];
  try {
    if (!opts.skipCheck) {
      const probe = checkIsolation(adapter, opts.model, workDir);
      if (probe && isNewFile) {
        if (probe.modelIds.length === 1) results.provider = probe.modelIds[0];
        if (probe.inputTokens !== undefined) results.runner += ` · 짧은 요청 기준 입력 ${probe.inputTokens}토큰`;
      }
    }

    todo.forEach((evalRun, n) => {
      const key = runKey(evalRun.scenario.id, evalRun.persona);
      const startedAt = Date.now();
      let replies: string[] | null = null;
      let lastError = "";
      // 실패하면 그 실행을 처음부터 한 번 더 (멀티턴은 새 세션으로)
      for (let attempt = 0; attempt < 2 && !replies; attempt++) {
        try {
          replies = runOnce(evalRun, prompts, profiles[evalRun.type], compat, adapter, opts.model, workDir);
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const head = `[${n + 1}/${todo.length}] ${key}/${evalRun.type}`;
      if (!replies) {
        failed.push(key);
        console.log(`${head} ❌ 실패 (${seconds}초): ${lastError}`);
        return;
      }
      // 답변이 바뀌었으므로 이전 사람 채점은 비운다
      records.set(key, {
        scenarioId: evalRun.scenario.id,
        persona: evalRun.persona,
        type: evalRun.type,
        replies,
        human: {},
        notes: "",
      });
      save();
      console.log(`${head} 답변 ${replies.length}개 (${seconds}초)`);
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log(`\n끝 — 성공 ${todo.length - failed.length}회 · 실패 ${failed.length}회`);
  if (failed.length) console.log(`실패한 실행: ${failed.join(", ")} (같은 명령을 다시 실행하면 이것만 다시 돌려요)`);
  console.log(`다음: python3 scripts/check_chat_replies.py ${displayPath(outPath)}`);
  if (failed.length) process.exit(1);
}

main();
