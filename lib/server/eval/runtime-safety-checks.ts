import { parseKinepikJson as parseAnalyzeKinasePayload } from "@/lib/server/tools/analyze-kinase";
import { parseKinepikJson as parseTopAffectedPayload } from "@/lib/server/tools/top-affected-kinases";
import { toUserFacingErrorMessage } from "@/app/api/chat/route";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Runtime safety check failed: ${message}`);
  }
}

function checkMalformedPayloadParsing() {
  const malformed =
    '{"value":[{"P00533":{"Gefitinib":{"WeightedZ_score":NaN,"p_value":Infinity,"n":3}}}],"Count":1}';

  const parsedAnalyze = parseAnalyzeKinasePayload(malformed) as {
    value?: Array<Record<string, unknown>>;
  };
  const parsedTopAffected = parseTopAffectedPayload(malformed) as {
    value?: Array<Record<string, unknown>>;
  };

  assert(
    Array.isArray(parsedAnalyze.value),
    "analyze-kinase parser should recover malformed payload",
  );
  assert(
    Array.isArray(parsedTopAffected.value),
    "top-affected parser should recover malformed payload",
  );
}

function checkTransportErrorFallback() {
  const msg = toUserFacingErrorMessage(
    new Error(
      "AI_RetryError: Cannot connect to API: session has been destroyed",
    ),
    [],
  );
  assert(
    msg.toLowerCase().includes("connection failed"),
    "transport errors should map to a user-facing connection failure message",
  );
}

function run() {
  checkMalformedPayloadParsing();
  checkTransportErrorFallback();
  console.log("Runtime safety checks passed.");
}

run();
