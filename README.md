# AgentEscrow

> **Autonomous Milestone Escrow & Settlement Platform** — Built for the PayPal AI Hackathon using **PayPal Developer Platform**, a **Multi-Provider AI Failover Router**, **AG Grid**, and **Render**.

## Problem Statement
Freelancers, digital agencies, and autonomous AI workflows face a core payment trust gap: buyers hesitate to pay upfront without deliverable verification, contractors risk non-payment after finishing work, and automated workflows lack spending guardrails when moving money.

**AgentEscrow** puts PayPal and AI at the center of programmable escrow:
1. **Natural-Language Agreement Structuring:** AI converts plain-English scopes into structured milestones and objective acceptance criteria.
2. **Real PayPal Escrow Hold (`Orders v2` — `AUTHORIZE`):** Buyers authorize an escrow hold via PayPal Checkout (`POST /v2/checkout/orders` + `/authorize`), locking funds safely before work starts.
3. **Independent AI Deliverable Verification (Multi-Model Failover):** When work is submitted, an AI Auditor grades each acceptance criterion and routes across configured frontier models (`Anthropic → OpenAI → Gemini → OpenRouter`, plus per-provider model fallback).
4. **Guarded Settlement (`Authorizations Capture v2`, `Void v2`, `Refunds v2`, & `Payouts v1`):**
   - **Under auto-release limit + PASS:** Automatically captures the exact milestone amount from the held PayPal Authorization (`POST /v2/payments/authorizations/{id}/capture`), working across all PayPal regions.
   - **Above limit:** Pauses in `AWAITING_APPROVAL` for explicit human sign-off.
   - **Incomplete / Rejected work:** Voids uncaptured authorization holds (`POST /v2/payments/authorizations/{id}/void`) or issues partial/full Capture Refunds (`POST /v2/payments/captures/{id}/refund`) back to the buyer.
5. **Real-Time Activity & Escrow Ledger (`AG Grid` + `Webhooks`):** Light PayPal-styled `ag-grid-react` ledgers display milestone statuses, PayPal transaction IDs, webhook verification, and CSV export, paired with a human-in-the-loop Escrow Assistant.

---

## Architecture

```text
[Buyer / Contractor / Reviewer UI (PayPal Light Glassmorphic Design)]
   ├── PayPal JS SDK (@paypal/react-paypal-js, intent: authorize) ──> /api/paypal/orders & /capture
   ├── AG Grid Escrow Ledger & Settlement History (ag-grid-react)
   └── Escrow Assistant & Deliverable Review ──> /api/escrows/* & /api/ai/copilot
                                                         │
         ┌───────────────────────────────────────────────┴───────────────────────────────────────────────┐
         ▼                                                                                               ▼
[Multi-Provider AI Failover Router (src/lib/ai/router.ts)]                           [PayPal REST Client (src/lib/paypal/client.ts)]
  1. Anthropic (claude-sonnet-4-5)                                                    • OAuth2 Cached Token + 401 Auto-Refresh
  2. OpenAI (gpt-4.1)                                                                 • Orders v2 (Create & Authorize Hold)
  3. Google Gemini (gemini-3.1-pro-preview → flash-latest → flash-lite-latest)        • Authorizations v2 (Partial Capture & Void)
  4. OpenRouter                                                                       • Captures v2 (Refunds) & Payouts v1
                                                                                      • Webhooks (verify-webhook-signature)
```

---

## Quick Start (Local)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and fill in your credentials:
```bash
cp .env.example .env.local
```

Required for live PayPal Sandbox transactions (free at [developer.paypal.com](https://developer.paypal.com/dashboard/)):
- `PAYPAL_MODE=sandbox`
- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID=...` (same Sandbox Client ID)
- `PAYPAL_WEBHOOK_ID=...` (optional; enables strict `verify-webhook-signature` enforcement)

AI Providers (configure 1 or more; the router cascades across providers and comma-separated model lists automatically on `429`/quota/`5xx`):
- `ANTHROPIC_API_KEY=...`
- `OPENAI_API_KEY=...`
- `GEMINI_API_KEY=...`
- `OPENROUTER_API_KEY=...`

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Run Tests, Typecheck & Build
```bash
npm run lint
npm test
npm run build
```

---

## End-to-End Demo Walkthrough (PayPal Sandbox)
1. Click **Load Demo Contract** (or describe a scope in **Create Escrow Agreement**, click **Generate Milestones**, and click **Save Agreement & Proceed to PayPal**).
2. Click the **PayPal** Checkout button and sign in with a **PayPal Sandbox Personal (Buyer)** account to authorize the `$170.00` escrow hold.
3. Click **Milestone 1 ($50 ≤ $80 limit)** in the **Escrow Ledger** (`AG Grid`), click **Fill Verified Work**, and click **Submit & Verify Deliverable** — AI verifies all criteria and automatically captures `$50.00` from the PayPal authorization.
4. Click **Milestone 2 ($120 > $80 limit)**, test either **Fill Verified Work** (pauses in `Needs Approval` due to the `$80` release limit) or **Fill Incomplete Work** + **Return / Refund to Buyer** to void/refund the remaining hold back to the buyer.
5. Click **Export CSV** on the **Escrow Ledger** and review the **Settlement & Activity History** grid.

---

## Deploying to Render
This repository includes `render.yaml` for Web Service deployment on [Render](https://render.com/):
1. Push this repo to a public GitHub repository.
2. In Render, select **New → Blueprint** (or **New → Web Service**) and connect your repository.
3. Set the secret environment variables (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, and your AI API keys).
4. Point your PayPal Sandbox Webhook URL to `https://<your-render-app>.onrender.com/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`.

---

## Security Practices
- All PayPal secrets (`PAYPAL_CLIENT_SECRET`) and LLM API keys stay strictly server-side.
- All API payloads are validated with `zod`, including `http(s)`-only URL checks and server-side currency rounding/cap enforcement.
- PayPal OAuth2 tokens are cached in memory and refreshed automatically on expiration or `401`.
- Webhook deliveries are deduplicated idempotently by PayPal `event.id` and fail closed (`401`) on invalid signatures when `PAYPAL_WEBHOOK_ID` is configured.

## License
MIT — see [LICENSE](./LICENSE).
