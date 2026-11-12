# AgentEscrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build **AgentEscrow**, a production-ready Next.js + TypeScript + PayPal Sandbox + Multi-LLM Failover + AG Grid autonomous milestone escrow and settlement platform ready for live Render deployment and a <3-minute hackathon demo.

**Architecture:** Single Next.js App Router codebase with server-side typed PayPal REST v1/v2 client (Orders, Captures, Payouts, Refunds, Webhooks), a priority-ordered Multi-LLM Router with automatic quota/rate-limit failover (Anthropic -> OpenAI -> Gemini -> OpenRouter), an atomic JSON store (`data/escrow-db.json`), and an AG Grid Financial & Telemetry Command Center frontend with PayPal JS SDK Checkout and an AI Copilot.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, `ag-grid-react` + `ag-grid-community`, `@paypal/react-paypal-js`, `zod`, `vitest`, `lucide-react`.

---

## File Structure
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`, `.env.example`, `.gitignore`, `render.yaml`
- `src/lib/types.ts` — Domain models (`EscrowContract`, `Milestone`, `AuditLogEntry`, `WebhookEventRecord`, `LLMAttempt`) and Zod schemas
- `src/lib/store/db.ts` — Atomic JSON store with serialized async write queue and test-friendly path override (`ESCROW_DB_PATH`)
- `src/lib/ai/router.ts` — Multi-provider LLM failover router (Anthropic, OpenAI, Gemini, OpenRouter) + JSON extraction helper
- `src/lib/ai/escrow-ai.ts` — AI contract structurer, deliverable auditor, and copilot tool loop
- `src/lib/paypal/client.ts` — OAuth2 cached token manager + Orders v2, Payouts v1, Captures Refund v2, Webhook Signature Verification
- `src/lib/escrow/service.ts` — Core escrow state machine, spending-cap guardrails, payout/refund orchestration, idempotent webhook processing
- `src/app/api/**/route.ts` — REST endpoints for health, escrows, PayPal orders/captures, milestone submit/approve/refund, AI copilot, and webhooks
- `src/components/EscrowGrid.tsx` — AG Grid Escrow & Milestone Ledger with custom status badges, confidence bars, quick filter, CSV export
- `src/components/TelemetryGrid.tsx` — AG Grid Live Webhook & AI Failover Audit Stream
- `src/components/ContractStudio.tsx` — Natural-language contract builder + PayPal Sandbox Checkout funding
- `src/components/MilestoneDrawer.tsx` — Deliverable submission, AI audit breakdown, human approval, and refund controls
- `src/components/CopilotPanel.tsx` — Natural-language PayPal & Escrow AI Copilot
- `src/app/page.tsx` — Unified AgentEscrow Command Center
- `tests/*.test.ts` — Vitest unit and integration tests for AI failover, PayPal client, escrow state machine/guardrails, and webhook idempotency
- `README.md` — Judge-ready setup, architecture diagram, API coverage, and testing instructions

---

### Task 1: Project Scaffold, Config & Test Harness
**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `postcss.config.mjs`, `.env.example`, `.gitignore`, `render.yaml`, `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1:** Initialize Next.js + TypeScript dependencies (`next`, `react`, `react-dom`, `ag-grid-react`, `ag-grid-community`, `@paypal/react-paypal-js`, `zod`, `lucide-react`) and devDependencies (`typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `vitest`).
- [ ] **Step 2:** Create `vitest.config.ts`, `.env.example`, `.gitignore`, and `render.yaml`.
- [ ] **Step 3:** Verify `npx tsc --noEmit` and `npx vitest run` run cleanly.

### Task 2: Domain Types, Validation & Atomic Persistence Store
**Files:**
- Create: `src/lib/types.ts`, `src/lib/store/db.ts`
- Test: `tests/db.test.ts`

- [ ] **Step 1:** Write failing test `tests/db.test.ts` verifying contract creation, update, webhook event deduplication, and atomic concurrent writes.
- [ ] **Step 2:** Implement `src/lib/types.ts` (all TypeScript interfaces + Zod schemas) and `src/lib/store/db.ts`.
- [ ] **Step 3:** Run `npx vitest run tests/db.test.ts` and verify PASS.

### Task 3: Multi-Provider AI Router with Automatic Failover
**Files:**
- Create: `src/lib/ai/router.ts`, `src/lib/ai/escrow-ai.ts`
- Test: `tests/ai-router.test.ts`

- [ ] **Step 1:** Write failing tests in `tests/ai-router.test.ts` covering:
  - Priority order execution (first configured provider succeeds).
  - Automatic failover on `429` / `503` / network failure to next provider, recording `fallbackUsed: true` and `attempts`.
  - Skipping providers missing API keys.
  - Structured JSON extraction for contract drafting and milestone auditing.
- [ ] **Step 2:** Implement `src/lib/ai/router.ts` supporting Anthropic, OpenAI, Gemini, and OpenRouter via standard `fetch` (zero brittle SDK version mismatches, explicit timeouts, clean error classification).
- [ ] **Step 3:** Implement `src/lib/ai/escrow-ai.ts` for NL contract structuring, deliverable verification auditing, and copilot tool calling.
- [ ] **Step 4:** Run `npx vitest run tests/ai-router.test.ts` and verify PASS.

### Task 4: PayPal Sandbox REST Client (Orders v2, Payouts v1, Refunds v2, Webhooks)
**Files:**
- Create: `src/lib/paypal/client.ts`
- Test: `tests/paypal-client.test.ts`

- [ ] **Step 1:** Write failing tests in `tests/paypal-client.test.ts` verifying:
  - OAuth2 token caching and automatic `401` retry refresh.
  - `createOrder`, `captureOrder`, `getOrder`.
  - `createPayout` & `getPayoutBatch`.
  - `refundCapture` (partial and full).
  - `verifyWebhookSignature`.
- [ ] **Step 2:** Implement `src/lib/paypal/client.ts`.
- [ ] **Step 3:** Run `npx vitest run tests/paypal-client.test.ts` and verify PASS.

### Task 5: Escrow Service, Guardrails & Webhook Processor
**Files:**
- Create: `src/lib/escrow/service.ts`
- Test: `tests/escrow-service.test.ts`

- [ ] **Step 1:** Write failing tests in `tests/escrow-service.test.ts` verifying:
  - Cannot settle unfunded milestone.
  - Auto-release triggers PayPal Payout when `verdict === "PASS"`, `confidence >= 80`, and `amount <= autoReleaseCap`.
  - Above `autoReleaseCap` transitions to `AWAITING_APPROVAL` without calling Payout until human approval.
  - `FAIL` / `PARTIAL` allows guarded PayPal Refund without exceeding `totalAmount`.
  - Idempotent webhook handling deduplicates repeated `event.id` deliveries.
- [ ] **Step 2:** Implement `src/lib/escrow/service.ts`.
- [ ] **Step 3:** Run `npx vitest run tests/escrow-service.test.ts` and verify PASS.

### Task 6: Next.js API Routes
**Files:**
- Create:
  - `src/app/api/health/route.ts`
  - `src/app/api/escrows/route.ts`
  - `src/app/api/escrows/draft/route.ts`
  - `src/app/api/paypal/orders/route.ts`
  - `src/app/api/paypal/orders/[orderId]/capture/route.ts`
  - `src/app/api/escrows/[id]/milestones/[milestoneId]/submit/route.ts`
  - `src/app/api/escrows/[id]/milestones/[milestoneId]/approve-payout/route.ts`
  - `src/app/api/escrows/[id]/milestones/[milestoneId]/refund/route.ts`
  - `src/app/api/ai/copilot/route.ts`
  - `src/app/api/webhooks/paypal/route.ts`

- [ ] **Step 1:** Implement all route handlers with Zod validation and clean HTTP error responses.
- [ ] **Step 2:** Run `npx tsc --noEmit` to verify strict type safety across all routes.

### Task 7: Frontend UI, AG Grid Command Center, PayPal Checkout & AI Copilot
**Files:**
- Create:
  - `src/components/PayPalProvider.tsx`
  - `src/components/EscrowGrid.tsx`
  - `src/components/TelemetryGrid.tsx`
  - `src/components/ContractStudio.tsx`
  - `src/components/MilestoneDrawer.tsx`
  - `src/components/CopilotPanel.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1:** Build polished dark/modern fintech UI with status KPI strip (Total Escrowed, Released via Payouts, Refunded/Protected, Active AI Router Chain).
- [ ] **Step 2:** Build `EscrowGrid.tsx` and `TelemetryGrid.tsx` using `ag-grid-react` with custom cell renderers, quick filter, CSV export, and row click selection.
- [ ] **Step 3:** Build `ContractStudio.tsx` (NL AI drafting + real `@paypal/react-paypal-js` Sandbox Checkout button), `MilestoneDrawer.tsx` (submit deliverable, view AI criteria breakdown & failover badge, approve payout, issue partial/full refund), and `CopilotPanel.tsx`.
- [ ] **Step 4:** Verify `npm run build` and `npx vitest run` pass with zero errors.

### Task 8: Documentation, Demo Seed Helper & Full Verification
**Files:**
- Create: `README.md`
- Update: `src/app/api/escrows/seed-demo/route.ts` (optional one-click sample contract in Draft state ready to fund with real PayPal Sandbox, zero fake PayPal IDs)

- [ ] **Step 1:** Write comprehensive `README.md` with problem statement, architecture diagram, setup instructions, PayPal Sandbox guide, Multi-LLM failover docs, and Render deploy instructions.
- [ ] **Step 2:** Run full `npx vitest run` and `npm run build`.
- [ ] **Step 3:** Commit clean git history and guide user through live PayPal Sandbox + LLM `.env` testing, Render deployment, and <3-minute YouTube recording.

