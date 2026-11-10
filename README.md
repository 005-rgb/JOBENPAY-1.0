# JOBENPAY — The Trust Layer for Agentic Commerce

[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![PayPal API](https://img.shields.io/badge/PayPal-Sandbox%20API-003087?style=flat&logo=paypal&logoColor=white)](https://developer.paypal.com/)
[![Gemini 3.8 Flash](https://img.shields.io/badge/AI%20Engine-Gemini%203.8%20Flash-8E75C2?style=flat&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Tests](https://img.shields.io/badge/Tests-1%2C132%20Passed-success?style=flat&logo=checkmarx&logoColor=white)](server/test)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Official Submission for the PayPal AI Hackathon 2026**  
> *Autonomous AI agents are closing deals and issuing invoices. JOBENPAY ensures they never move a single cent without mathematical proof, cryptographic provenance, and human-in-the-loop authorization.*

---

## 1. What it is and the problem

### The Problem: The Trillion-Dollar Blind Spot in Autonomous Commerce
The era of **Agentic Commerce** has arrived. Autonomous AI agents—powered by Large Language Models—now manage supply chains, procure enterprise software, negotiate vendor contracts, and reconcile corporate accounts.

**Yet, traditional financial rails were built for a human-only world.**

Giving an autonomous agent direct access to corporate funds or payment gateways introduces an existential security blind spot:
- **Prompt Injection & Model Hijacking:** A maliciously crafted vendor invoice or indirect prompt injection can instruct an agent to redirect corporate payouts to rogue offshore accounts.
- **Hallucination-Induced Capital Loss:** An LLM reasoning error or hallucinated contract term can trigger accidental duplicate disbursements or massive payment overshoots in milliseconds.
- **Autonomous Velocity Exploits:** When rogue or misconfigured agents initiate thousands of micro-transactions per second, legacy fraud engines fail to react before the entire corporate treasury is drained.
- **The Attribution Vacuum:** Post-incident investigations hit a wall: *Why did the agent make this payment? What was its chain of thought? Can the decision be mathematically replayed in court?*

### The Solution: The Uncompromising Trust Layer
**JOBENPAY is the mission-critical Trust Layer between autonomous AI agents and enterprise financial networks.**

Built on an architectural **Golden Path**, JOBENPAY enforces a strict, mathematical separation of concerns:
$$\text{AI Agents Only Propose} \quad\longrightarrow\quad \text{JOBENPAY Mathematically Verifies} \quad\longrightarrow\quad \text{Humans Authorize} \quad\longrightarrow\quad \text{Payment Rails Disburse}$$

Every transaction proposal originating from an AI agent is subjected to a battery of deterministic policy gates, semantic alignment scoring, cryptographic provenance recording, and dual-custody approval before reaching the payment gateway.

---

## 2. Demo: hosted URL + judge credentials

- Hosted demo: {{HOSTED_URL}}
- Judge account: `judge@jobenpay.test`
- Judge password: {{JUDGE_PASSWORD}}

The project owner must replace these placeholders before publishing a release. Demo data is synthetic, and payment operations are restricted to PayPal Sandbox.

### Interactive Judge Tour

| Route | Feature Area | What to Inspect |
|---|---|---|
| `/transactions` | **Universal Transaction Ledger** | Filter across 15 commerce categories. Observe balanced double-entry legs (`SUM(DEBIT) = SUM(CREDIT)`). |
| `/transactions/:id` | **Signed Audit Record (SAR)** | Inspect the full cryptographic provenance, human approval timestamps, and PayPal request IDs. |
| `/payments` | **Payment Orchestration Layer (POL)** | View multi-gateway routing, smart failover history, and test the real-time failover simulator. |
| `/security` | **Security Hardening Center** | Review quantum-safe cryptographic keys (ML-DSA-65), threat detection events, and SLSA Level 3 attestations. |
| `/approvals` | **Dual-Custody Approval Queue** | Review pending agent proposals with Decision Integrity Scores (DIP) and execution time locks. |
| `/ledger` | **Tamper Detection Drill** | Click **"Verify Hash Chain"** to witness sub-millisecond mathematical integrity validation across all historical blocks. |
| *Toggle Bar* | **Zero-Leak Environment Toggle** | Switch between **SANDBOX** and **LIVE** mode. Watch the entire UI dynamically adapt (Blue ➔ Red) with zero data bleed. |

---

## 3. Run it yourself

Requirements: Node.js 22.13 or newer in the Node 22 line, npm, and Docker Compose or local PostgreSQL.

### Step 1: Clone & Configure
```bash
git clone https://github.com/005-rgb/JOBENPAY-1.0.git
cd JOBENPAY-1.0

# Install dependencies for both server and frontend
npm install
npm --prefix web install

# Create environment configuration and generate cryptographic keys
cp .env.example .env
npm run keys:gen >> .env
```

### Step 2: Initialize Database & Seed Demo Data
Ensure your PostgreSQL server is running and accessible via `DATABASE_URL` in `.env`:
```bash
# Run forward-only database migrations
npm run migrate

# Seed synthetic enterprise data, mandates, agents, and transactions
npm run seed
```

### Step 3: Build & Launch Application
```bash
# Build the production React frontend
npm run build

# Start the unified server
npm start
```
The application will launch on `http://localhost:3000`.

In another terminal, run the dry-run judge smoke test:
```bash
node --env-file=.env scripts/judge-smoke.js
```

---

## 4. How PayPal is used and how AI is used

### How PayPal is Used
PayPal is used strictly through its Sandbox API:
- OAuth 2.0 obtains short-lived access tokens.
- Payouts API submits approved disbursements with derived, idempotent request IDs (`jp_{intent_id}_{step}`).
- Signed webhook notifications are cryptographically verified before status transitions and daily reconciliation.
- The UI is an independent dashboard and never exposes provider credentials to agents or AI.

### How AI is Engineered: Powered by Gemini 3.8 Flash
JOBENPAY utilizes **Gemini 3.8 Flash** as its core intelligence and code generation engine:
1. **Deterministic Intent Extraction:** Gemini 3.8 Flash rapidly analyzes unstructured invoices, purchase orders, and multi-page supplier contracts, extracting structured financial schemas with near-zero latency.
2. **Semantic Reasoning & Alignment (DIP):** Gemini 3.8 Flash evaluates the cognitive reasoning trace of initiating agents against the human principal's original mandate, identifying subtle prompt injection attempts or budget creep.
3. **Monotonic Policy Enforcement:** AI analysis is strictly monotonic—Gemini 3.8 Flash can **only tighten policy rules** (escalating an automatic action to `REQUIRE_APPROVAL` or `REJECT`). It is mathematically and architecturally impossible for AI output to downgrade a deterministic rejection into an approval.
4. **Architectural Code Generation:** The entire JOBENPAY engine, including its 1,132 automated test suites, state machines, and mathematical constraints, was developed through pair-programming workflows with Gemini 3.8 Flash.

---

## 5. Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          AUTONOMOUS AGENTS                             │
│     (Claude, Cursor, AutoGPT, Enterprise LLMs via MCP Server)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Restricted JSON-RPC (Proposals Only)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        JOBENPAY TRUST ENGINE                           │
│                                                                        │
│  ┌─────────────────────────┐            ┌───────────────────────────┐  │
│  │   DETERMINISTIC MANDATES │            │  DECISION INTEGRITY (DIP) │  │
│  │  Budget, Velocity, Time │            │  Intent Alignment (0-100) │  │
│  └────────────┬────────────┘            └─────────────┬─────────────┘  │
│               │                                       │                │
│  ┌────────────▼────────────┐            ┌─────────────▼─────────────┐  │
│  │ COGNITIVE PROVENANCE    │            │ POST-QUANTUM CRYPTOGRAPHY │  │
│  │ Replay Engine (CPL)     │            │ ML-DSA-65 & SLSA Level 3  │  │
│  └────────────┬────────────┘            └─────────────┬─────────────┘  │
│               │                                       │                │
│               ▼                                       ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                  HUMAN-IN-THE-LOOP AUTHORIZATION                 │  │
│  │            Dual-Custody (Four-Eyes) & Step-Up Biometrics         │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ Approved Intents
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PAYMENT ORCHESTRATION LAYER                        │
│   Smart Failover (Stripe ➔ PayPal) │ Zero-PAN Vault │ Circuit Breakers │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │ Balanced Double-Entry
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│             IMMUTABLE LEDGER & VERIFIED AUDIT RECORDS (SAR)            │
│          PostgreSQL RLS │ Ed25519 Signatures │ SHA-256 Chain           │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack & Repository Map
| Layer | Technologies |
|---|---|
| **Core Runtime** | Node.js 22 LTS (`>=22.13 <23`), Pure JavaScript ESM (Zero TypeScript, Zero Native Addons) |
| **Web Server** | Express 5, Pino Logger (Automatic Credential Redaction), Helmet, Strict CSP |
| **Database** | PostgreSQL 13+ (Multi-Tenant Row-Level Security, Database Constraints & Triggers) |
| **AI Intelligence** | Google DeepMind Gemini 3.8 Flash |
| **Frontend UI** | React 18, Vite, TanStack Query, Radix UI Primitives, Lucide Icons, Pure CSS Tokens |
| **Payment Gateways** | PayPal Sandbox API (OAuth 2.0, Payouts, Webhooks), Stripe Adapter, Fake PayPal Simulator |
| **Cryptography** | Ed25519, ML-DSA-65 (PQC), AES-256-GCM (Encrypted Outbox & AAD), SHA-256 Canonical Hashing |
| **Protocols** | Model Context Protocol (MCP / JSON-RPC 2.0), vLEI Registry, SAR v1.1, RFC 8785 Hashing |

---

## 6. Security model and honest limits

- The hash-chained ledger and digital signatures provide mathematical evidence of internal record integrity. They do not prove that an operator could not recreate or replace the database.
- Approvals and ledger entries are signed by the server; approval signatures are not held by an independent client key.
- The interface follows selected PayPal Business interaction patterns, but JOBENPAY is an independent hackathon prototype.
- AI output is treated as untrusted data and cannot override deterministic rejection or approval requirements.
- PayPal calls are restricted exclusively to the Sandbox testing environment.

---

## 7. Built during the submission period

The project was built and expanded across structured phases (F0 through F9):
- **15 Universal Categories (28 Sub-type pairs):** PAYOUT, SALE, REFUND, VOID, PARTIAL, DOWN_PAYMENT, INVOICE, DISPUTE, SCHEDULED, RECURRING, BULK, SPLIT, TRANSFER, FINANCING, and DEBIT.
- **Double-Entry Ledger Architecture:** Every transaction generates strictly balanced debit/credit legs enforced by PostgreSQL DB trigger (`SUM(DEBIT) = SUM(CREDIT)` per currency). Entries are signed with Ed25519 and chained via SHA-256 tamper-evident hashes.
- **Multi-Level Idempotency:** Tenant-scoped `Idempotency-Key` and derived PayPal request IDs (`jp_{intent_id}_{step}`) prevent duplicate executions across network interruptions or worker retries.
- **Staged Decision Policy Engine:** Deterministic rule evaluation (Stages A/B) with monotonic AI tightening (Stage C) where AI can strictly tighten policies (REJECT / REQUIRE_APPROVAL) and is strictly forbidden from loosening decisions.
- **Daily Reconciliation:** Background reconciliation worker (`reconcile_daily`) verifying legs, settlement records, and provider state with automated mismatch detection and freeze alerts.
- **Zero-Leak Multi-Environment Isolation:** Full relational and repository-level isolation ensuring Sandbox and Live data never contaminate each other.
- **Comprehensive Test Suite:** Over 1,130 automated tests across unit, integration, concurrency, chaos disruptions, security fuzzing, IDOR, and AI adversarial evals with 100% green exit code.

---

## 8. Testing instructions

Run the automated verification suite:

```bash
# Fast unit tests (1,130+ tests)
npm run test:unit

# Architectural, license, and multi-tenant isolation guard
npm run guard

# Strict floating-point prevention check (BigInt minor units only)
node scripts/lint-no-float-money.js

# Full automated test suite
npm test
```

For manual verification on the web UI:
1. Log in with the Judge account (`judge@jobenpay.test`).
2. Navigate to **Transactions** (`/transactions`) to inspect transactions across all 15 categories.
3. Review Double-Entry legs and Suspicious Activity Reports (SAR v1.1) in Transaction Detail.
4. Open **Simulator** (`/simulator`) to run legitimate and adversarial payment flows.
5. Open **Ledger** (`/ledger`) and click **Verify** to execute real-time hash-chain integrity verification.

---

## 9. What's next

- **Sandbox & Simulation Boundaries:** PayPal operations are strictly restricted to the PayPal Sandbox environment. Tier C categories (`FINANCING` and `DEBIT`) run via the deterministic `PartnerSimulatorProvider` with explicit `[SIMULATED]` labeling and zero external network exposure.
- **Internal Ledger Accounting:** As defined in PRD 1.3 §0, liability and escrow accounts represent internal book accounts rather than banking escrow or credit facilities.
- **Key Rotation & Disaster Recovery:** Operational runbook for AES-256-GCM and Ed25519 key rotation, point-in-time recovery, and dead-letter queue resolution is documented in [docs/OPERATIONS.md](docs/OPERATIONS.md).
- **API Reference:** Auto-generated from canonical Zod schemas in [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

---

## 10. License

JOBENPAY is licensed under the [MIT License](LICENSE). Third-party package licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
