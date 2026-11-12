# AgentEscrow Design Specification

**Date:** 2026-11-11
**Target:** PayPal AI Hackathon (Grand Prize / Best Use of Agentic Commerce / Best Use of PayPal + AI + AG Grid Sponsor Prize + Render Sponsor Prize)

## 1. Overview & Problem Statement
Freelancers, digital agencies, and emerging agent-to-agent workflows lack a programmable trust layer between payment authorization and deliverable verification. Buyers fear paying upfront for unverified work; contractors fear completed work going unpaid; and autonomous AI agents lack spending guardrails when moving money.

**AgentEscrow** solves this by combining **PayPal's Developer Platform** (Orders v2, Captures, Payouts v1, Refunds v2, Webhooks, and Agent Toolkit patterns) with a **Multi-Provider AI Router** (priority-ordered frontier models with automatic quota/rate-limit failover) and an **AG Grid Financial Command Center**.

## 2. Architecture & Tech Stack
- **Framework:** Next.js 15+ (App Router, TypeScript, Tailwind CSS) — single full-stack repository for 1-command local run and Render web service deployment.
- **PayPal Integration:**
  - Frontend: `@paypal/react-paypal-js` (Sandbox Checkout funding).
  - Backend: Typed PayPal REST API v1/v2 client (`src/lib/paypal/client.ts`) using OAuth2 `client_credentials` token caching with automatic refresh before expiration and single `401` retry.
- **AI Multi-Provider Failover Router (`src/lib/ai/router.ts`):**
  - Priority order (configurable via `AI_PROVIDER_ORDER`):
    1. Anthropic (`claude-sonnet-4-5` / configurable `ANTHROPIC_MODEL`)
    2. OpenAI (`gpt-4.1` / configurable `OPENAI_MODEL`)
    3. Google Gemini (`gemini-2.5-pro` -> `gemini-2.5-flash` / configurable `GEMINI_MODEL`)
    4. OpenRouter (`OPENROUTER_MODEL`)
  - Skips providers without API keys. On HTTP `402`, `429`, `500-599`, network error, or timeout, automatically fails over to the next configured provider and records `{ provider, model, latencyMs, fallbackUsed, attempts }` in the audit log.
  - Deterministic structured fallback parser if no LLM keys are configured in offline CI tests (never fakes PayPal money movement).
- **UI & Data Grid (`ag-grid-react`):**
  - **Escrow & Milestone Command Ledger (AG Grid):** Sortable, filterable, quick-search grid with custom status badges (`DRAFT`, `FUNDED`, `AUDITING`, `AWAITING_APPROVAL`, `PAID_OUT`, `PARTIAL_REFUND`, `REFUNDED`, `DISPUTED`), AI confidence bars, PayPal Order/Capture/Payout IDs, row selection inspector, and CSV export.
  - **Webhook & AI Telemetry Grid (AG Grid):** Live stream of PayPal webhook events (`verified` vs `unverified` signature badge) and AI failover telemetry.
- **Persistence (`src/lib/store/db.ts`):**
  - Atomic JSON file store (`data/escrow-db.json` by default, configurable via `ESCROW_DB_PATH`) with serialized write queue so it works identically on Windows and Render Linux with zero native C++ build dependencies.

## 3. Core Domain Model & State Machine
### Escrow Contract (`EscrowContract`)
- `id`: `esc_<uuid>`
- `title`: string
- `description`: string
- `buyerEmail`: string
- `contractorEmail`: string (PayPal Sandbox recipient email)
- `currency`: `"USD"`
- `totalAmount`: number
- `autoReleaseCap`: number (guardrail: payouts above this cap require human approval even if AI passes)
- `status`: `"DRAFT" | "FUNDED" | "IN_PROGRESS" | "COMPLETED" | "DISPUTED" | "REFUNDED"`
- `paypalOrderId`: string | null
- `paypalCaptureId`: string | null
- `milestones`: `Milestone[]`
- `createdAt`, `updatedAt`: ISO timestamps

### Milestone (`Milestone`)
- `id`: `ms_<uuid>`
- `title`: string
- `amount`: number
- `acceptanceCriteria`: string[]
- `status`: `"PENDING_FUNDING" | "LOCKED_IN_ESCROW" | "SUBMITTED" | "AWAITING_APPROVAL" | "PAID_OUT" | "PARTIAL_REFUND" | "REFUNDED"`
- `submission`: `{ proofUrl?: string; notes: string; artifactText: string; submittedAt: string } | null`
- `aiAudit`: `{ verdict: "PASS" | "PARTIAL" | "FAIL"; confidence: number; recommendedReleasePercent: number; summary: string; criteriaResults: { criterion: string; met: boolean; reason: string }[]; provider: string; model: string; fallbackUsed: boolean; latencyMs: number; auditedAt: string } | null`
- `paypalPayoutBatchId`: string | null
- `paypalRefundId`: string | null
- `settledAmount`: number
- `refundedAmount`: number

### Guardrail & Settlement Rules
1. Cannot submit or settle a milestone unless parent contract is `FUNDED` (verified PayPal Capture).
2. AI Auditor evaluates deliverable against `acceptanceCriteria`.
3. If `verdict === "PASS"` and `confidence >= 80` and `milestone.amount <= contract.autoReleaseCap`:
   - Automatically calls PayPal Payouts (`POST /v1/payments/payouts`) for `milestone.amount` to `contractorEmail`.
4. If `verdict === "PASS"` and `milestone.amount > contract.autoReleaseCap`:
   - Transitions milestone to `AWAITING_APPROVAL` for explicit human sign-off before Payout executes.
5. If `verdict === "PARTIAL"` or `"FAIL"`:
   - Allows releasing verified percentage (optional) and/or issuing a PayPal Capture Refund (`POST /v2/payments/captures/{capture_id}/refund`) for the unverified amount, enforcing total `(settledAmount + refundedAmount) <= totalAmount`.

## 4. API Routes
- `GET /api/health` — Returns PayPal Sandbox config status, active AI provider chain (no secrets exposed), and DB health.
- `GET /api/escrows` — Lists all contracts, milestones, audit logs, and webhook events.
- `POST /api/escrows/draft` — Uses AI Router to parse natural-language scope into structured milestones & acceptance criteria (or accepts manual JSON).
- `POST /api/paypal/orders` — Creates a PayPal Checkout Order (`intent: "CAPTURE"`) for a contract's `totalAmount`.
- `POST /api/paypal/orders/[orderId]/capture` — Captures the approved PayPal order, records `paypalCaptureId`, and moves milestones to `LOCKED_IN_ESCROW`.
- `POST /api/escrows/[id]/milestones/[milestoneId]/submit` — Submits deliverable proof, runs AI Auditor (with failover), and either auto-triggers PayPal Payout or pauses in `AWAITING_APPROVAL` / refund recommendation.
- `POST /api/escrows/[id]/milestones/[milestoneId]/approve-payout` — Human-in-the-loop sign-off to execute PayPal Payout.
- `POST /api/escrows/[id]/milestones/[milestoneId]/refund` — Executes PayPal Capture Refund (partial or full) back to the buyer.
- `POST /api/ai/copilot` — Natural-language PayPal & Escrow Copilot with tool calling (inspect contracts, inspect live PayPal order/payout status, trigger guarded payout/refund with confirmation).
- `POST /api/webhooks/paypal` — Verifies PayPal webhook signature (when `PAYPAL_WEBHOOK_ID` is set) and idempotently processes `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`, `CUSTOMER.DISPUTE.CREATED`.

## 5. Error Handling & Security
- Never expose `PAYPAL_CLIENT_SECRET` or AI API keys to the browser; all PayPal & LLM calls execute server-side.
- Validate all inputs with Zod; enforce server-side amount integrity (`sum(milestones.amount) === totalAmount`).
- Return structured JSON errors (`{ error, code, details }`) surfaced cleanly in the UI.
- Include `.env.example` and never commit `.env`.

## 6. Verification & Deployment
- Automated Vitest suite covering AI router failover, PayPal OAuth + API error handling, state machine & guardrail math, and webhook idempotency.
- Live PayPal Sandbox verification (Personal buyer + Business merchant) and Render `render.yaml` deployment configuration.

