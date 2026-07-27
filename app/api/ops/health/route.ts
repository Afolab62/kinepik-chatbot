import { getOpsSnapshot } from "@/lib/server/ops/monitoring";

const NODE_ENV = process.env.NODE_ENV ?? "development";

function isOpsHealthEnabled(): boolean {
  const configured = process.env.OPS_HEALTH_ENABLED;
  if (configured !== undefined) {
    return configured === "true";
  }

  // Disabled by default in production unless explicitly enabled.
  return NODE_ENV !== "production";
}

function getProvidedToken(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const headerToken = req.headers.get("x-ops-token");
  return headerToken?.trim() || undefined;
}

export async function GET(req: Request) {
  if (!isOpsHealthEnabled()) {
    return new Response("Not Found", { status: 404 });
  }

  const adminToken = process.env.OPS_HEALTH_TOKEN;
  const providedToken = getProvidedToken(req);
  const tokenRequired = NODE_ENV !== "development" || Boolean(adminToken);

  if (tokenRequired) {
    if (!adminToken || !providedToken || providedToken !== adminToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return Response.json(
    {
      ok: true,
      environment: NODE_ENV,
      metrics: getOpsSnapshot(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
