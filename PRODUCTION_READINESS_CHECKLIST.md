# KINEPIK Production Readiness Checklist

Use this checklist before each production release.

## 1. Release Scope

- [ ] Tag release candidate version and changelog notes
- [ ] Confirm all critical bug fixes are merged
- [ ] Confirm prompt/tooling changes are documented

## 2. CI Quality Gates

- [ ] `pnpm install --frozen-lockfile` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` passes
- [ ] Optional benchmark gate (`pnpm eval:benchmarks`) passes when `OPENAI_API_KEY` is set

## 3. Reliability and Failure Modes

- [ ] KINEPIK malformed numeric payload handling is validated (`NaN`, `Infinity`)
- [ ] OpenAI transport failure path returns user-safe fallback (no raw stack traces)
- [ ] Tool timeouts and retries verified for ranking tools
- [ ] No prompt path can produce unsupported numeric claims without tool evidence

## 4. Scientific Integrity

- [ ] KSEA claims are framed as inferred downstream activity, not direct drug binding
- [ ] Drug direct-target statements are separated from KINEPIK activity observations
- [ ] At least 20 sampled prompts reviewed manually for scientific wording and grounding
- [ ] Zero known hallucinated numeric claims in sampled outputs

## 5. Security and Configuration

- [ ] Production secrets configured (`OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `OPENAI_MODEL`)
- [ ] `.env.local` is not committed and secrets are not logged
- [ ] Basic rate limiting is enabled at API edge or route layer
- [ ] Dependency lockfile policies pass

## 6. Observability and Operations

- [ ] Error monitoring is enabled (API and tool execution failures)
- [ ] Structured logs include request ids and tool call names
- [ ] Alerts configured for elevated error rate and latency
- [ ] Incident runbook exists for provider outages and KINEPIK upstream instability

## 7. Pre-Deploy Verification

- [ ] Smoke test in staging: core Q&A, comparison query, heatmap request, network request
- [ ] Confirm fallback SVG visualization path works when Python is unavailable
- [ ] Confirm deployment environment Node and pnpm versions are compatible
- [ ] Confirm benchmark metrics meet release thresholds

## 8. Suggested Release Thresholds

- Benchmark pass rate: >= 90%
- Hallucination mitigation score: >= 95%
- Tool call success rate: >= 98%
- No P0/P1 open bugs

## 9. Post-Deploy Checks

- [ ] Run canary prompts and inspect responses
- [ ] Review first-hour logs for transport, TLS, and upstream failures
- [ ] Verify p95 latency and error rate against baseline
- [ ] Rollback plan validated and accessible
