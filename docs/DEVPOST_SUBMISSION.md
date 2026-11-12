# Devpost Submission & <3-Minute Demo Script

## Devpost Form Copy (Ready to Paste)

### Project Name
**AgentEscrow**

### Elevator Pitch
An autonomous AI milestone escrow and settlement platform built on PayPal Developer Platform, a Multi-LLM Failover Router, and AG Grid—turning plain-English scopes into PayPal-authorized escrow holds, verifying deliverables with AI, and executing spending-capped captures, voids, or refunds automatically.

### Built With / Tools Used
- **PayPal Developer Platform (Sandbox):** Orders v2 (`AUTHORIZE`), Authorizations Capture v2 (milestone partial captures), Authorizations Void v2, Captures Refund v2, Webhooks (`verify-webhook-signature`), Payouts v1, and `@paypal/react-paypal-js`.
- **Multi-Provider AI Failover Router:** Priority-ordered orchestration across Anthropic Claude (`claude-sonnet-4-5`), OpenAI (`gpt-4.1`), Google Gemini (`gemini-3.1-pro-preview → gemini-flash-latest → gemini-flash-lite-latest`), and OpenRouter with automatic failover on `429`/quota/`5xx` errors.
- **AG Grid (`ag-grid-react`):** Light PayPal-themed Escrow Ledger (status pills, verification progress bars, search, status filter, CSV export) + Settlement & Activity History Grid.
- **Next.js 15 + TypeScript + Tailwind CSS + Framer Motion + Zod + Render:** Full-stack type-safe web application with live cloud deployment via `render.yaml`.

### Sponsor Prizes to Select on Devpost
- **AG Grid** (1st/2nd/3rd Place — up to $5,000)
- **Render** (1st/2nd/3rd Place — up to $1,000 credits)

---

## 2:45 Demo Video Script (Under 3-Minute Limit)

1. **0:00–0:25 — The Problem & Pitch:**
   - Freelancers, agencies, and AI-enabled commerce lack trust between upfront payment and deliverable verification.
   - Introduce **AgentEscrow**: Agree on clear milestones, hold funds safely in PayPal escrow, verify deliverables with AI under strict spending guardrails, and release or refund automatically.
2. **0:25–0:55 — Create Agreement & Authorize PayPal Hold:**
   - Type or load a 2-milestone scope ($50 + $120, **$80 Auto-Release Limit**), click **Generate Milestones**, and click **Save Agreement & Proceed to PayPal**.
   - Click the **PayPal** button, sign in with your **PayPal Sandbox Personal** buyer account, and authorize the `$170.00` hold—both milestones transition to **Held in Escrow** in the **Escrow Ledger** (`AG Grid`).
3. **0:55–1:40 — Auto-Release (Under Limit) + Guardrail Pause (Above Limit):**
   - Click **Milestone 1 ($50 ≤ $80 limit)** in the Escrow Ledger, click **Fill Verified Work**, and click **Submit & Verify Deliverable**.
   - Show the criteria checklist passing and **automatically capturing `$50.00` via PayPal** (real PayPal Capture ID appears in the ledger!).
   - Click **Milestone 2 ($120 > $80 limit)** and show how verified work pauses in **Needs Approval** because it exceeds the `$80` auto-release limit.
4. **1:40–2:20 — Unhappy Path Void/Refund, Escrow Assistant & AG Grid Export:**
   - Click **Fill Incomplete Work** (or **Return / Refund to Buyer**) to protect the buyer by returning unverified funds via PayPal Void/Refund.
   - Ask the **Escrow Assistant** for a summary and demonstrate human-in-the-loop confirmation before moving funds.
   - Click **Export CSV** on the **Escrow Ledger** and show the **Settlement & Activity History** grid.
5. **2:20–2:45 — Closing & Architecture:**
   - Highlight live Render deployment, open-source MIT GitHub repo, and passing automated test suite (`vitest`).
