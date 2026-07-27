interface RequestMetric {
  timestamp: number;
  ok: boolean;
}

interface CapturedError {
  timestamp: string;
  requestId: string;
  stage: string;
  message: string;
}

const WINDOW_MS = 5 * 60_000;
const ALERT_MIN_REQUESTS = 20;
const ALERT_ERROR_RATE = 0.2;
const ALERT_COOLDOWN_MS = 5 * 60_000;

const requestMetrics: RequestMetric[] = [];
const recentErrors: CapturedError[] = [];
let lastAlertAt = 0;

function trimWindow(now: number) {
  while (
    requestMetrics.length > 0 &&
    requestMetrics[0].timestamp < now - WINDOW_MS
  ) {
    requestMetrics.shift();
  }
  while (recentErrors.length > 50) {
    recentErrors.shift();
  }
}

export function startTrace() {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  return { requestId, startedAt };
}

export function recordRequestOutcome(input: {
  requestId: string;
  ok: boolean;
  durationMs: number;
  route: string;
}) {
  const now = Date.now();
  requestMetrics.push({ timestamp: now, ok: input.ok });
  trimWindow(now);

  const total = requestMetrics.length;
  const failures = requestMetrics.filter((item) => !item.ok).length;
  const errorRate = total === 0 ? 0 : failures / total;

  console.log(
    `[trace] route=${input.route} requestId=${input.requestId} ok=${input.ok} durationMs=${input.durationMs}`,
  );

  if (
    total >= ALERT_MIN_REQUESTS &&
    errorRate >= ALERT_ERROR_RATE &&
    now - lastAlertAt >= ALERT_COOLDOWN_MS
  ) {
    lastAlertAt = now;
    console.error(
      `[ops-alert] Elevated failure rate detected route=${input.route} windowRequests=${total} windowFailures=${failures} errorRate=${errorRate.toFixed(3)}`,
    );
  }
}

export function trackError(input: {
  requestId: string;
  stage: string;
  route?: string;
  extra?: unknown;
  error: unknown;
}) {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  recentErrors.push({
    timestamp: new Date().toISOString(),
    requestId: input.requestId,
    stage: input.stage,
    message,
  });
  trimWindow(Date.now());
}

export function getOpsSnapshot() {
  const now = Date.now();
  trimWindow(now);
  const total = requestMetrics.length;
  const failures = requestMetrics.filter((item) => !item.ok).length;

  return {
    windowMs: WINDOW_MS,
    totalRequests: total,
    failedRequests: failures,
    errorRate: total === 0 ? 0 : failures / total,
    recentErrors,
  };
}
