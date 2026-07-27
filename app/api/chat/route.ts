import {
  streamText,
  createUIMessageStreamResponse,
  createUIMessageStream,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import {
  getOpenAIModel,
  validateServerConfig,
  getWebSearchTools,
} from "@/lib/server/openai";
import { SYSTEM_PROMPT } from "@/lib/server/prompts";
import { chatTools } from "@/lib/server/tools";
import { checkRateLimit } from "@/lib/server/security/rate-limit";
import {
  sanitizeForLog,
  sanitizeTextForLog,
} from "@/lib/server/security/log-sanitizer";
import {
  recordRequestOutcome,
  startTrace,
  trackError,
} from "@/lib/server/ops/monitoring";

const DEMO_MODE = process.env.DEMO_MODE === "true";

const KSEA_TOOL_REQUIRED_PATTERN =
  /(ksea|z-?score|p-?value|substrate|phosphosite|perturbation|cell\s*line|treated with|inhibit|activated|inhibited|gefitinib|dasatinib|rapamycin|azd3759)/i;

function likelyNeedsToolGrounding(userMessage: unknown): boolean {
  if (typeof userMessage !== "string") return true;
  return KSEA_TOOL_REQUIRED_PATTERN.test(userMessage);
}

function getClientIdentifier(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const cfIp = req.headers.get("cf-connecting-ip") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || cfIp || "unknown";
  return `chat:${ip}`;
}

function parsePositiveIntEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildToolContextSummary(
  toolMetadata: Array<{ toolName: string; output: unknown }>,
): string {
  if (toolMetadata.length === 0) {
    return "";
  }

  const last = toolMetadata[toolMetadata.length - 1];
  if (last.toolName === "analyzeKinase") {
    const notes = (last.output as { analysisNotes?: unknown })?.analysisNotes;
    if (Array.isArray(notes) && notes.length > 0) {
      const meaningful = notes
        .filter((note): note is string => typeof note === "string")
        .slice(0, 3)
        .join(" ");
      if (meaningful) {
        return ` Latest KINEPIK tool context: ${meaningful}`;
      }
    }
  }

  return "";
}

export function toUserFacingErrorMessage(
  error: unknown,
  toolMetadata: Array<{ toolName: string; output: unknown }>,
): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("cannot connect to api") ||
    lower.includes("session has been destroyed") ||
    lower.includes("bad record mac") ||
    lower.includes("ai_retryerror")
  ) {
    return (
      "The model provider connection failed after retrieving tool data. " +
      "Please retry this question. If it persists, restart the dev server and check local network/proxy/TLS interception settings." +
      buildToolContextSummary(toolMetadata)
    );
  }

  return "An unexpected model streaming error occurred. Please retry.";
}

export async function POST(req: Request) {
  const trace = startTrace();
  const toolMetadata: Array<{
    toolName: string;
    timestamp: string;
    input: unknown;
    output: unknown;
  }> = [];

  try {
    const rateLimit = checkRateLimit(getClientIdentifier(req), {
      windowMs: parsePositiveIntEnv(
        process.env.CHAT_RATE_LIMIT_WINDOW_MS,
        60_000,
      ),
      maxRequests: parsePositiveIntEnv(
        process.env.CHAT_RATE_LIMIT_MAX_REQUESTS,
        30,
      ),
    });
    if (!rateLimit.allowed) {
      recordRequestOutcome({
        requestId: trace.requestId,
        ok: false,
        durationMs: Date.now() - trace.startedAt,
        route: "/api/chat",
      });
      return Response.json(
        {
          error: "Rate limit exceeded. Please retry shortly.",
          retryAfterMs: rateLimit.retryAfterMs,
          requestId: trace.requestId,
        },
        { status: 429 },
      );
    }

    const body = await req.json();
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      recordRequestOutcome({
        requestId: trace.requestId,
        ok: false,
        durationMs: Date.now() - trace.startedAt,
        route: "/api/chat",
      });
      return Response.json(
        {
          error: "Invalid request body: messages[] is required.",
          requestId: trace.requestId,
        },
        { status: 400 },
      );
    }
    const userMessage =
      messages[messages.length - 1]?.content || "[no message]";

    console.log(
      `[chat-api] requestId=${trace.requestId} userQuery="${
        typeof userMessage === "string"
          ? sanitizeTextForLog(userMessage, 220)
          : "[structured content]"
      }"`,
    );
    console.log(
      `[chat-api] requestId=${trace.requestId} messageCount=${messages.length}`,
    );

    // --- Demo mode: stream a canned response without any API key ---
    if (DEMO_MODE) {
      const demoText = `**[Demo mode — no API key configured]**\n\nTo enable responses, add \`OPENAI_API_KEY\` to \`.env.local\` and remove \`DEMO_MODE=true\`.`;

      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const id = crypto.randomUUID();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: demoText });
          writer.write({ type: "text-end", id });
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    // --- Real mode ---
    const { valid, error } = validateServerConfig();
    if (!valid) {
      recordRequestOutcome({
        requestId: trace.requestId,
        ok: false,
        durationMs: Date.now() - trace.startedAt,
        route: "/api/chat",
      });
      return Response.json(
        { error, requestId: trace.requestId },
        { status: 500 },
      );
    }

    const webSearchTools = getWebSearchTools();
    const serverNote = webSearchTools
      ? "Native OpenAI web search is enabled for speculative or literature-backed questions."
      : "";

    const modelMessages = await convertToModelMessages(messages);

    // Wrap each tool to log calls and capture metadata
    const wrappedTools: Record<string, any> = {};
    const tools = webSearchTools
      ? { ...chatTools, ...webSearchTools }
      : chatTools;

    for (const [toolName, tool] of Object.entries(tools)) {
      const originalExecute = tool.execute as
        | ((input: unknown, options: unknown) => Promise<unknown> | unknown)
        | undefined;
      wrappedTools[toolName] = {
        ...tool,
        execute: async (input: unknown, options: unknown) => {
          const timestamp = new Date().toISOString();
          console.log(
            `[tool-call] requestId=${trace.requestId} tool=${toolName} input=${JSON.stringify(sanitizeForLog(input))}`,
          );
          try {
            if (!originalExecute) {
              throw new Error(`Tool ${toolName} does not implement execute().`);
            }
            const output = await originalExecute(input, options);
            console.log(
              `[tool-result] requestId=${trace.requestId} tool=${toolName} output=${JSON.stringify(sanitizeForLog(output)).substring(0, 500)}...`,
            );
            toolMetadata.push({ toolName, timestamp, input, output });
            return output;
          } catch (err) {
            trackError({
              requestId: trace.requestId,
              stage: `tool:${toolName}`,
              route: "/api/chat",
              extra: { toolName, input: sanitizeForLog(input) },
              error: err,
            });
            console.error(
              `[tool-error] requestId=${trace.requestId} tool=${toolName} error=${err}`,
            );
            throw err;
          }
        },
      };
    }

    const requireToolGrounding = likelyNeedsToolGrounding(userMessage);

    const result = streamText({
      model: getOpenAIModel(),
      system: SYSTEM_PROMPT + (serverNote ? `\n\nNote: ${serverNote}` : ""),
      messages: modelMessages,
      tools: wrappedTools,
      toolChoice: requireToolGrounding ? "required" : "auto",
      stopWhen: stepCountIs(8),
      onFinish({ totalUsage }) {
        console.log(
          `[tokens] requestId=${trace.requestId} input=${totalUsage.inputTokens} output=${totalUsage.outputTokens} total=${totalUsage.totalTokens}`,
        );
        console.log(
          `[tools-used] requestId=${trace.requestId} tools=${toolMetadata.map((t) => t.toolName).join(", ") || "none"}`,
        );

        if (requireToolGrounding && toolMetadata.length === 0) {
          trackError({
            requestId: trace.requestId,
            stage: "tool-boundary",
            error:
              "No tool calls made for a query that required tool grounding.",
          });
        }

        recordRequestOutcome({
          requestId: trace.requestId,
          ok: true,
          durationMs: Date.now() - trace.startedAt,
          route: "/api/chat",
        });
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        trackError({
          requestId: trace.requestId,
          stage: "model-stream",
          route: "/api/chat",
          error,
        });
        recordRequestOutcome({
          requestId: trace.requestId,
          ok: false,
          durationMs: Date.now() - trace.startedAt,
          route: "/api/chat",
        });
        console.error("[chat-api] stream error:", error);
        return toUserFacingErrorMessage(error, toolMetadata);
      },
    });
  } catch (error) {
    trackError({
      requestId: trace.requestId,
      stage: "route",
      route: "/api/chat",
      error,
    });
    recordRequestOutcome({
      requestId: trace.requestId,
      ok: false,
      durationMs: Date.now() - trace.startedAt,
      route: "/api/chat",
    });
    return Response.json(
      {
        error: "Request processing failed.",
        requestId: trace.requestId,
      },
      { status: 500 },
    );
  }
}
