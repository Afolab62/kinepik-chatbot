import {
  streamText,
  createUIMessageStreamResponse,
  createUIMessageStream,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import {
  getBiochatterModel,
  validateApiKey,
  isBiochatterServerConfigured,
} from "@/lib/server/biochatter";
import { SYSTEM_PROMPT } from "@/lib/server/prompts";
import { chatTools } from "@/lib/server/tools";

const DEMO_MODE = process.env.DEMO_MODE === "true";

export async function POST(req: Request) {
  const { messages } = await req.json();

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
  const { valid, error } = validateApiKey();
  if (!valid) {
    return Response.json({ error }, { status: 500 });
  }

  const serverNote = isBiochatterServerConfigured()
    ? "\n\nNote: Running via BioChatter server with RAG-enhanced responses."
    : "";

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: getBiochatterModel(),
    system: SYSTEM_PROMPT + serverNote,
    messages: modelMessages,
    tools: chatTools,
    stopWhen: stepCountIs(5),
    onFinish({ totalUsage }) {
      console.log(
        `[tokens] input=${totalUsage.inputTokens} output=${totalUsage.outputTokens} total=${totalUsage.totalTokens}`,
      );
    },
  });

  return result.toUIMessageStreamResponse();
}
