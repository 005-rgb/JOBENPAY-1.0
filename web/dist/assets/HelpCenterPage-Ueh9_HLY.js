import{n as C,y as A,i as x,r as g,j as e,X as D,t as O,a5 as T,a3 as _,I as E,S as M,F as L,W as R,a4 as B,A as j,L as G}from"./index-5ldoSOkW.js";import{B as q}from"./book-open-Cx4QBBIw.js";import{S as N}from"./search--zii5JeN.js";import{E as z}from"./external-link-DOlebGyS.js";import{A as V}from"./arrow-right-CF0FmN_I.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=C("Compass",[["path",{d:"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",key:"9ktpf1"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]]),w=[{id:"activity",name:"Activity",icon:"Activity"},{id:"payGetPaid",name:"Pay & Get Paid",icon:"Wallet"},{id:"agentsMandates",name:"Agents & Mandates",icon:"FileCheck"},{id:"trustExchange",name:"Open Trust Exchange",icon:"ShieldCheck"},{id:"aiGovernance",name:"AI Governance & Trust",icon:"Cpu"},{id:"operations",name:"Production Operations",icon:"Server"},{id:"businessTools",name:"Business Tools",icon:"Grid"}],b=[{id:"activity-transactions",title:"Transactions",group:"Activity",groupId:"activity",path:"Sidebar > Activity > Transactions",route:"/transactions",summary:"Universal transaction ledger displaying financial lifecycles across 15 distinct commerce categories.",content:`
### Overview
The Transactions page provides an exhaustive, multi-tenant overview of all transactions generated across the 15 supported categories. Every row represents an atomic, double-entry financial intent.

### How to Use & Filter
1. **Search & Category Filter:** Filter by specific categories (e.g., Payout, Sale, Refund, Split) or search by Intent ID and counterparty.
2. **Environment Isolation:** Transactions are strictly isolated by environment. Sandbox records display a blue badge, while Live records display a high-contrast red badge.
3. **Transaction Details:** Click on any Intent ID to inspect its [Signed Authorization Receipt (SAR)](#activity-audit), double-entry ledger legs, and PayPal reconciliation state.

### Expected Results
- Transactions appear in real time upon proposal submission.
- Balanced double-entry legs (\`SUM(DEBIT) = SUM(CREDIT)\`) are guaranteed by PostgreSQL database triggers.

### Connected Modules
- Learn how transactions are proposed via [New Transaction](#pay-payouts).
- Understand how pending proposals are reviewed in [Approvals](#activity-approvals).
- Audit historical entries in [Double-Entry Ledger](#activity-ledger).
    `,related:["activity-approvals","activity-ledger","activity-audit","pay-pol"],keywords:["transactions","intents","ledger","double-entry","categories","filtering","records"]},{id:"activity-requests",title:"Requests",group:"Activity",groupId:"activity",path:"Sidebar > Activity > Requests",route:"/requests",summary:"Inspect incoming transaction proposals originating from registered AI agents and MCP servers.",content:`
### Overview
The Requests screen lists raw proposals submitted by AI agents prior to evaluation. Every request contains the initiating agent's identity, timestamped payload, and referenced mandate.

### Workflow & User Actions
1. **Request Inspection:** Click a Request ID to view the full JSON payload, canonical request hash, and extracted invoice parameters.
2. **Evaluation Status:** Track whether the request evaluated to \`APPROVED\`, \`REJECTED\`, or \`PENDING_APPROVAL\`.
3. **Fail-Closed Tracing:** If an agent proposed an amount violating its mandate, inspect the triggered reason codes (e.g., \`MAX_AMOUNT_EXCEEDED\`, \`DIS_BELOW_THRESHOLD\`).

### Connected Modules
- See how agents propose requests via [AI Agents Management](#agents-agents).
- Understand how budgets are verified in [Deterministic Mandates](#agents-mandates).
- Review requests escalated for manual sign-off in [Approvals Queue](#activity-approvals).
    `,related:["agents-agents","agents-mandates","activity-approvals","ai-dip"],keywords:["requests","proposals","agent requests","evaluation","payload","intent"]},{id:"activity-approvals",title:"Approvals Queue",group:"Activity",groupId:"activity",path:"Sidebar > Activity > Approvals",route:"/approvals",summary:"Dual-custody (four-eyes) governance queue where authorized humans review escalated proposals.",content:`
### Overview
JOBENPAY enforces a strict human-in-the-loop principle: **AI agents can only propose; only authenticated humans can approve or execute payments.** Any transaction exceeding automatic thresholds lands in this queue.

### How to Approve or Reject
1. **Review Decision Details:** Inspect the proposed amount, counterparty verification status, and the [Decision Integrity (DIP)](#ai-dip) score.
2. **Dual-Custody Enforcement:** High-value transactions require approvals from two distinct authorized principals.
3. **Step-Up Authentication:** Approving a transaction may prompt for step-up biometric/passkey verification via [Security Settings](#business-security).
4. **Execution:** Once approved, the transaction transitions to \`APPROVED\` and is queued for background worker execution via PayPal or Stripe.

### Connected Modules
- Review how spending caps trigger approvals in [Deterministic Mandates](#agents-mandates).
- Verify AI semantic reasoning alignment in [Decision Integrity (DIP)](#ai-dip).
- Track the resulting book transfers in [Double-Entry Ledger](#activity-ledger).
    `,related:["activity-transactions","agents-mandates","ai-dip","business-security"],keywords:["approvals","dual-custody","four-eyes","human in the loop","review","reject","authorize"]},{id:"activity-ledger",title:"Double-Entry Ledger",group:"Activity",groupId:"activity",path:"Sidebar > Activity > Ledger",route:"/ledger",summary:"Cryptographically signed, tamper-evident financial ledger with real-time SHA-256 hash-chain verification.",content:`
### Overview
The Ledger is the core source of financial truth. Every monetary movement creates paired debit and credit legs that balance to zero per currency. Entries are chained via SHA-256 hashes and digitally signed with Ed25519.

### Key Capabilities & Verification Drill
1. **Verify Hash Chain Button:** Click **"Verify Hash Chain"** to trigger a real-time mathematical audit of all blocks. If any database manipulation is detected, the UI immediately alerts the operator.
2. **Legs Breakdown:** Inspect debit accounts (\`liability:escrow\`, \`asset:bank\`) and credit accounts (\`payee:payout\`, \`revenue:fees\`).
3. **CSV Export:** Download OWASP-mitigated, formula-injection-safe CSV ledger exports for enterprise ERP reconciliation.

### Connected Modules
- Check transaction origins in [Transactions](#activity-transactions).
- See forensic event logs in [Audit Log](#activity-audit).
- Understand gateway balance settlements in [Payment Orchestration (POL)](#pay-pol).
    `,related:["activity-transactions","activity-audit","pay-pol","ops-security"],keywords:["ledger","double-entry","hash chain","tamper evident","sha256","ed25519","verification","export"]},{id:"activity-audit",title:"Audit Log & SAR",group:"Activity",groupId:"activity",path:"Sidebar > Activity > Audit",route:"/audit",summary:"Immutable audit trail and regulatory Signed Authorization Records (SAR v1.1) for compliance officers.",content:`
### Overview
The Audit screen logs all system mutations, user logins, mandate revisions, and payment executions. Every record is cryptographically tied to the acting tenant and user session.

### Signed Authorization Receipts (SAR v1.1)
- For every completed financial movement, JOBENPAY generates a canonical **SAR v1.1** export.
- SARs include the exact mandate version ID, DIP score, agent identity, Ed25519 server signature, and external PayPal Request IDs.
- SARs can be verified independently by external regulators via the [Public Proof Verification API](#trust-proofs).

### Connected Modules
- Verify receipts externally in [Open Trust Exchange Proofs](#trust-proofs).
- Inspect historical ledger legs in [Double-Entry Ledger](#activity-ledger).
- Investigate security alerts in [Threat Detection & Security](#ops-security).
    `,related:["activity-ledger","trust-proofs","ops-security","ai-cpl"],keywords:["audit","sar","signed authorization record","compliance","forensics","provenance"]},{id:"pay-payouts",title:"Payouts",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Payouts",route:"/payouts",summary:"Disburse funds directly to vendors, contractors, and partners via the PayPal Payouts API.",content:`
### Overview
The Payouts module manages outgoing disbursements. Payouts require an approved mandate, verified payee credentials, and sufficient balance reservations.

### Workflow
1. **Create Payout:** Enter the payee identifier (PayPal ID, email, or phone), currency, and minor-unit amount.
2. **Policy Evaluation:** The engine checks velocity limits, budget thresholds, and payee trust levels.
3. **Execution:** Once approved, the job queue delivers the payout to PayPal Sandbox using an idempotent request ID (\`jp_{intent_id}_payout\`).

### Connected Modules
- Register approved recipients in [Payees](#pay-payees).
- Disburse to thousands of recipients simultaneously via [Bulk Payouts](#pay-bulk).
- Inspect failover options in [Payment Orchestration (POL)](#pay-pol).
    `,related:["pay-payees","pay-bulk","pay-pol","activity-approvals"],keywords:["payouts","disbursements","paypal payouts","vendor payments","send money"]},{id:"pay-sales",title:"Sales & Orders",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Sales & Orders",route:"/sales",summary:"Authorize and capture buyer checkout orders with integrated Buyer Harness simulation.",content:`
### Overview
The Sales module orchestrates incoming commerce flows. Supports two-phase authorization and capture lifecycles for goods, services, and digital products.

### Interactive Buyer Harness
- In Sandbox mode, test buyer authorization flows with synthetic PayPal and card credentials.
- Test edge cases such as customer cancellation, partial authorization, and instant capture.

### Connected Modules
- Reverse settled sales via [Refunds](#pay-refunds).
- Cancel uncaptured authorizations via [Void Authorizations](#pay-voids).
- Collect upfront security deposits via [Down Payments](#pay-downpayments).
    `,related:["pay-refunds","pay-voids","pay-downpayments","pay-partials"],keywords:["sales","orders","checkout","authorize","capture","buyer harness"]},{id:"pay-invoices",title:"Invoices",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Invoices",route:"/invoices",summary:"Issue accounts receivable invoices, send payment reminders, and reconcile webhook settlements.",content:"\n### Overview\nCreate and track enterprise invoices. Invoices transition through `DRAFT` ➔ `SENT` ➔ `PAID` or `OVERDUE`. Automatic webhook matching updates invoice balances without human intervention.\n\n### Connected Modules\n- Upload supplier documents in [Documents / Invoices](#pay-documents).\n- Review automatic incoming allocations in [Transfers](#pay-transfers).\n    ",related:["pay-documents","pay-transfers","pay-sales"],keywords:["invoices","accounts receivable","billing","reminders","settlement"]},{id:"pay-downpayments",title:"Down Payments",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Down Payments",route:"/down-payments",summary:"Three-phase milestone escrow saga: initial deposit reservation, settlement, and forfeiture.",content:`
### Overview
Down Payments protect high-value service engagements and milestones. Funds are held in internal ledger escrow until contractual verification conditions are satisfied.

### Three-Phase Lifecycle
1. **Initial Deposit:** Funds are authorized and moved into \`liability:escrow\`.
2. **Settlement:** Upon milestone delivery, funds are released to the vendor.
3. **Forfeiture:** In case of breach, funds are returned to the buyer according to arbitration rules.

### Connected Modules
- Learn about agreement verification in [PACT Contracts & Escrow](#trust-handshakes).
- Split milestone payouts between subcontractors via [Split Payments](#pay-splits).
    `,related:["pay-splits","trust-handshakes","activity-ledger"],keywords:["down payments","escrow","deposit","milestone","forfeiture","settlement"]},{id:"pay-recurring",title:"Recurring Billing",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Recurring Billing",route:"/recurring",summary:"Internal subscription management with strict cycle ceilings and automated execution schedulers.",content:`
### Overview
Manage automated recurring billing cycles without handing continuous open-ended authorization to external parties. JOBENPAY enforces cycle count caps and mandatory re-evaluation before each renewal.

### Connected Modules
- Set up one-off future payments in [Scheduled Payments](#pay-scheduled).
- Configure recurring vendor caps in [Deterministic Mandates](#agents-mandates).
    `,related:["pay-scheduled","agents-mandates","pay-payouts"],keywords:["recurring","subscriptions","billing cycles","renewal","scheduled billing"]},{id:"pay-splits",title:"Split Payments",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Split Payments",route:"/splits",summary:"Marketplace multi-recipient payout engine with automated platform fee calculation and escrow holding.",content:`
### Overview
Split gross customer payments among platform operators, primary vendors, and secondary collaborators. Mathematical property testing guarantees zero rounding discrepancy across 1,000 parallel iterations.

### Interactive Split Calculator
- Input the Gross Transaction Amount, Platform Fee (Basis Points / bps), and Recipient IDs.
- The UI calculates exact net shares and previews double-entry debit/credit ledger splits.

### Connected Modules
- Direct net payouts to registered vendors in [Payees](#pay-payees).
- Inspect resulting balanced legs in [Double-Entry Ledger](#activity-ledger).
    `,related:["pay-payees","activity-ledger","pay-payouts"],keywords:["splits","marketplace","platform fee","basis points","revenue share","calculator"]},{id:"pay-bulk",title:"Bulk Payouts",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Bulk Payouts",route:"/bulk",summary:"Streamlined batch disbursement engine capable of chunking up to 15,000 items per batch.",content:`
### Overview
Disburse funds to thousands of contractors, affiliates, or gig workers in a single batch. Upload CSV payloads or submit batches via the MCP API. Batches exceeding 15,000 items are rejected with \`BULK_TOO_LARGE\`.

### Connected Modules
- Disburse single payments via [Payouts](#pay-payouts).
- Verify batch processing capacity in [SLO & Error Budgets](#ops-slo).
    `,related:["pay-payouts","ops-slo","activity-ledger"],keywords:["bulk","batch payouts","mass payout","chunking","csv upload","payouts api"]},{id:"pay-transfers",title:"Internal Transfers",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Transfers",route:"/transfer",summary:"Zero-fee internal peer-to-peer balance allocations between organization accounts and sub-ledgers.",content:`
### Overview
Move funds internally between departments, project budgets, or organization sub-accounts. Strict database constraints prevent circular self-transfers (\`sender_id = receiver_id\`).

### Connected Modules
- View organization balance sheets in [Double-Entry Ledger](#activity-ledger).
- Allocate departmental budgets in [Deterministic Mandates](#agents-mandates).
    `,related:["activity-ledger","agents-mandates"],keywords:["transfers","internal transfer","p2p","balance transfer","book transfer"]},{id:"pay-scheduled",title:"Scheduled Payments",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Scheduled",route:"/scheduled",summary:"Time-locked payment orders with automatic mandate re-evaluation upon execution trigger.",content:`
### Overview
Schedule future disbursements and milestone payments. If the originating mandate is revoked or modified prior to execution time, the scheduled transaction is automatically blocked and transitioned to \`REJECTED\`.

### Connected Modules
- See recurring payment plans in [Recurring Billing](#pay-recurring).
- Review mandate rules in [Deterministic Mandates](#agents-mandates).
    `,related:["pay-recurring","agents-mandates","activity-approvals"],keywords:["scheduled","future payment","time-lock","re-evaluation","timer"]},{id:"pay-financing",title:"Partner Financing",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Financing",route:"/financing",summary:"Simulated merchant financing and invoice factoring powered by the Partner Simulator Provider.",content:`
### Overview
JOBENPAY provides a simulated partner financing engine for testing invoice factoring, PO financing, and credit advances. Operates under strict zero-network isolation with mandatory \`[SIMULATED]\` labeling.

### Connected Modules
- Manage direct debit mandates in [Direct Debit](#pay-debit).
- Test simulated failures in [Simulator](#agents-simulator).
    `,related:["pay-debit","agents-simulator","activity-ledger"],keywords:["financing","factoring","partner simulator","credit advance","simulated"]},{id:"pay-debit",title:"Direct Debit",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Direct Debit",route:"/debit",summary:"Customer direct debit mandate verification and simulated pull-payment authorizations.",content:`
### Overview
Verify direct debit mandates, bank authorization tokens, and recurring debit limits. Direct debit transactions enforce a default of 0 automatic approvals—always requiring human or policy authorization.

### Connected Modules
- Manage merchant financing in [Partner Financing](#pay-financing).
- Review policy rules in [Policy Language (JPL)](#ai-jpl).
    `,related:["pay-financing","ai-jpl","activity-approvals"],keywords:["direct debit","ach","bank pull","mandate","simulated debit"]},{id:"pay-refunds",title:"Refunds",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Refunds",route:"/refunds",summary:"Process full and partial refunds within a 180-day window with cumulative over-refund protection.",content:`
### Overview
Issue refunds against previously settled sales. JOBENPAY tracks cumulative refund amounts in real time to ensure total refunds never exceed the original capture amount.

### Connected Modules
- Inspect original sales in [Sales & Orders](#pay-sales).
- Cancel authorizations before settlement via [Void Authorizations](#pay-voids).
    `,related:["pay-sales","pay-voids","pay-partials"],keywords:["refunds","partial refund","customer return","reversal","180 days"]},{id:"pay-voids",title:"Void Authorizations",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Voids",route:"/voids",summary:"Instantly cancel unsettled authorizations and release held credit lines.",content:`
### Overview
Voiding releases temporary credit holds and open authorizations before settlement. Once voided, transactions transition to a terminal \`VOIDED\` state that cannot be captured or refunded.

### Connected Modules
- View authorizations in [Sales & Orders](#pay-sales).
- Reverse settled funds in [Refunds](#pay-refunds).
    `,related:["pay-sales","pay-refunds"],keywords:["voids","cancel authorization","hold release","unsettled"]},{id:"pay-partials",title:"Partial Captures",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Partials",route:"/partials",summary:"Capture a portion of an authorized order while maintaining remaining balance tracking.",content:`
### Overview
Partial captures enable split shipments and staged fulfillment. An authorized order can be captured in increments up to the total authorized amount.

### Connected Modules
- View parent orders in [Sales & Orders](#pay-sales).
- Cancel remaining uncaptured balances via [Void Authorizations](#pay-voids).
    `,related:["pay-sales","pay-voids","pay-refunds"],keywords:["partials","partial capture","split shipment","staged capture"]},{id:"pay-disputes",title:"Disputes & Claims",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Disputes",route:"/disputes",summary:"Human-governed customer chargeback and dispute resolution with automated evidence packaging.",content:`
### Overview
When a dispute webhook arrives from PayPal, JOBENPAY quarantines the disputed funds in escrow. AI agents can prepare response dossiers, but only authorized human operators can submit the final dispute response.

### Connected Modules
- View underlying transactions in [Transactions](#activity-transactions).
- Export evidence receipts in [Audit Log & SAR](#activity-audit).
    `,related:["activity-transactions","activity-audit","activity-approvals"],keywords:["disputes","chargebacks","claims","evidence","arbitration"]},{id:"pay-pol",title:"Payment Orchestration Layer (POL)",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Payment Orchestration",route:"/payments",summary:"Multi-gateway routing (Stripe + PayPal), Smart Failover, PCI DSS Token Vault, and Circuit Breakers.",content:`
### Overview
The Payment Orchestration Layer provides enterprise payment resilience. It intelligently routes transactions, handles gateway failovers, and secures cardholder data.

### Key Features
1. **Smart Failover:** When Stripe encounters a soft decline, POL automatically retries the payment through PayPal Sandbox with identical idempotency keys.
2. **Hard Decline Stop:** Stolen cards or fraud flags trigger an instant stop with zero retry cascades.
3. **Self-Owned Vault:** Tokenizes payment methods without exposing raw Primary Account Numbers (PANs).
4. **Interactive POL Terminal:** Test normal paths, soft declines, and hard declines directly on the page.

### Connected Modules
- Disburse via gateways in [Payouts](#pay-payouts).
- Monitor gateway health in [Circuit Breakers](#ops-circuit-breakers).
- Audit tokens and encryption in [Security Hardening & PQC](#ops-security).
    `,related:["pay-payouts","ops-circuit-breakers","ops-security","activity-transactions"],keywords:["pol","orchestration","failover","stripe","paypal","vault","tokens","pci dss"]},{id:"pay-payees",title:"Payees Directory",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Payees",route:"/payees",summary:"Manage trusted suppliers, contractors, and payout recipients with cryptographic trust verification.",content:`
### Overview
The Payees directory stores registered counterparty identifiers (PayPal Account ID, Email, Phone). Payees progress through trust states: \`PENDING_REVIEW\` ➔ \`TRUSTED\` or \`BLOCKED\`.

### Adding a Payee
1. Click **"New Payee"** in the top-right toolbar.
2. Enter the display name and select the identifier type. In Live mode, select **"PayPal Account ID"**; in Sandbox mode, select **"Sandbox Account ID"**.
3. Changing a payee's trust status to \`TRUSTED\` triggers a step-up biometric prompt.

### Connected Modules
- Disburse to trusted payees in [Payouts](#pay-payouts).
- Restrict agents to specific payees in [Deterministic Mandates](#agents-mandates).
    `,related:["pay-payouts","agents-mandates","business-security"],keywords:["payees","counterparties","recipients","trust status","suppliers"]},{id:"pay-documents",title:"Documents / Invoices",group:"Pay & Get Paid",groupId:"payGetPaid",path:"Sidebar > Pay & Get Paid > Documents",route:"/documents",summary:"Upload PDF and text invoices for automated AI field extraction and usage tracking.",content:`
### Overview
Upload vendor invoices, receipts, and contracts. Powered by Gemini 3.8 Flash, the extraction worker extracts vendor names, tax IDs, line items, and bank details while strictly accounting for AI token quotas.

### Connected Modules
- Match extracted invoices to [Invoices](#pay-invoices).
- Verify AI intent alignment in [Decision Integrity (DIP)](#ai-dip).
    `,related:["pay-invoices","ai-dip","agents-mandates"],keywords:["documents","extraction","gemini","invoice parser","token quota","ocr"]},{id:"agents-agents",title:"AI Agents Directory",group:"Agents & Mandates",groupId:"agentsMandates",path:"Sidebar > Agents & Mandates > Agents",route:"/agents",summary:"Register autonomous AI agents, generate HMAC API keys, and set per-agent velocity limits.",content:`
### Overview
Every AI agent interacting with JOBENPAY must be registered as a distinct identity with tenant-scoped cryptographic credentials. Agents are assigned roles and bound to specific mandates.

### Creating an Agent
1. Navigate to **Sidebar > Agents & Mandates > Agents** and click **"Create Agent"**.
2. Provide a unique Agent Name (e.g., \`ProcurementBot-01\`), select the environment (Sandbox or Live), and assign an authorized spending mandate.
3. Copy the generated HMAC SHA-256 API Key. Store it securely in your agent's MCP or environment configuration.

### Connected Modules
- Bind spending rules in [Deterministic Mandates](#agents-mandates).
- Connect agents via [Agentic Interface (MCP)](#ops-runbooks).
- Monitor anomalous agent activity in [Threat Detection & Security](#ops-security).
    `,related:["agents-mandates","ops-security","activity-requests"],keywords:["agents","ai agents","api keys","registration","hmac","credentials","mcp"]},{id:"agents-mandates",title:"Deterministic Mandates",group:"Agents & Mandates",groupId:"agentsMandates",path:"Sidebar > Agents & Mandates > Mandates",route:"/mandates",summary:"Immutable spending policies governing maximum per-transaction caps, monthly budgets, and vendor allowlists.",content:`
### Overview
Mandates are the bedrock of JOBENPAY's security architecture. They define what an AI agent is mathematically permitted to do. Once signed by an authorized human, mandate versions are **immutable**.

### Configuring a Mandate
- **Per-Transaction Cap:** The maximum single payment the agent may propose (e.g., $500.00 USD).
- **Monthly Budget:** Cumulative budget cap. Parallel transactions cannot race to overshoot this limit.
- **Payee Allowlist:** Restricts proposals exclusively to pre-approved counterparty IDs.
- **Operating Schedule:** Hours of the day and days of the week payments are permitted to execute.

### Connected Modules
- Assign mandates to agents in [AI Agents Directory](#agents-agents).
- Evaluate intent compliance in [Decision Integrity (DIP)](#ai-dip).
- Compile declarative rules in [Policy Language (JPL)](#ai-jpl).
    `,related:["agents-agents","ai-dip","ai-jpl","activity-approvals"],keywords:["mandates","spending caps","budgets","allowlist","policy","immutable","limits"]},{id:"agents-intents",title:"Intent Anchors",group:"Agents & Mandates",groupId:"agentsMandates",path:"Sidebar > Agents & Mandates > Intent Anchors",route:"/intents",summary:"Cryptographically anchor human natural-language objectives to verify AI agent fidelity.",content:`
### Overview
Intent Anchoring binds the human principal's original objective (e.g., *"Pay ACME Corp for Q3 Cloud Hosting up to $1,200"*) to an immutable cryptographic hash. The engine compares subsequent agent actions against this anchor.

### Connected Modules
- Verify anchor alignment in [Decision Integrity (DIP)](#ai-dip).
- Audit historical reasoning in [Cognitive Provenance (CPL)](#ai-cpl).
    `,related:["ai-dip","ai-cpl","agents-mandates"],keywords:["intent anchors","human intent","alignment","hash anchoring","fidelity"]},{id:"agents-simulator",title:"Sandbox Simulator",group:"Agents & Mandates",groupId:"agentsMandates",path:"Sidebar > Agents & Mandates > Simulator",route:"/simulator",summary:"Interactive test laboratory to simulate happy paths, budget rejections, and ledger tampering drills.",content:`
### Overview
The Simulator enables engineers and compliance auditors to test the system under controlled conditions without connecting live credentials.

### Interactive Drills
1. **Happy Path:** Submit a compliant payout and observe automatic approval.
2. **Budget Overshoot:** Submit a $10,000 proposal against a $500 cap to verify immediate deterministic rejection.
3. **Ledger Tamper & Restore Drill:** Intentionally inject a corrupted record into the ledger and verify that the hash-chain validator catches it instantly. Click **"Restore"** to repair state.

### Connected Modules
- View resulting ledger blocks in [Double-Entry Ledger](#activity-ledger).
- Test gateway decline scenarios in [Payment Orchestration (POL)](#pay-pol).
    `,related:["activity-ledger","pay-pol","ops-security"],keywords:["simulator","sandbox testing","tamper drill","chaos","rejection","demo"]},{id:"trust-proofs",title:"Proof Verification",group:"Open Trust Exchange",groupId:"trustExchange",path:"Sidebar > Open Trust Exchange > Proof Verification",route:"/proofs",summary:"Public verification portal for Signed Authorization Receipts (SAR v1.1) and cryptographic attestations.",content:`
### Overview
The Proof Verification portal allows third-party auditors, counterparties, and banking partners to verify the authenticity of any transaction without accessing private database tables.

### Verifying a Proof
1. Paste the **SAR JSON** or enter the **Intent ID** and **Receipt Hash**.
2. Click **"Verify Cryptographic Signature"**.
3. The engine verifies the server's Ed25519 signature, checks the RFC 8785 canonical hash, and confirms that the record has not been revoked.

### Connected Modules
- Export receipts from [Audit Log & SAR](#activity-audit).
- Initiate bilateral handshakes in [Trust Handshakes](#trust-handshakes).
    `,related:["activity-audit","trust-handshakes","trust-conformance"],keywords:["proofs","sar verification","ed25519 signature","rfc8785","public audit"]},{id:"trust-handshakes",title:"Trust Handshakes",group:"Open Trust Exchange",groupId:"trustExchange",path:"Sidebar > Open Trust Exchange > Trust Handshakes",route:"/handshakes",summary:"Pre-transaction bilateral trust handshakes using verifiable Legal Entity Identifiers (vLEI).",content:`
### Overview
Before exchanging high-value payments, organizations execute an automated Trust Handshake. Both parties exchange vLEI credentials, verify mutual non-revocation status, and agree on dispute arbitration venues.

### Connected Modules
- Manage organizational vLEI in [Organization Profile](#business-organization).
- Verify AP2 test vectors in [Conformance Tester](#trust-conformance).
    `,related:["business-organization","trust-conformance","trust-proofs"],keywords:["handshakes","vlei","trust protocol","pre-transaction","bilateral trust"]},{id:"trust-conformance",title:"Conformance Tester",group:"Open Trust Exchange",groupId:"trustExchange",path:"Sidebar > Open Trust Exchange > Conformance Tester",route:"/protocol/conformance",summary:"Automated test runner validating compliance against AP2 and Open Trust Exchange test vectors.",content:`
### Overview
Run the built-in conformance suite to ensure your deployment satisfies all 10 standard Open Trust Exchange vectors, including signature validation, revocation checks, and replay defense.

### Connected Modules
- Review verification logs in [Proof Verification](#trust-proofs).
- Inspect policy standard compliance in [Policy Language (JPL)](#ai-jpl).
    `,related:["trust-proofs","ai-jpl"],keywords:["conformance","test vectors","ap2","compliance runner","protocol testing"]},{id:"ai-dip",title:"Decision Integrity (DIP)",group:"AI Governance & Trust",groupId:"aiGovernance",path:"Sidebar > AI Governance & Trust > Decision Integrity (DIP)",route:"/dip",summary:"Mathematical scoring engine (0-100) verifying whether AI agent reasoning aligns with original human intent.",content:`
### Overview
Decision Integrity Proofs (DIP) solve the AI alignment challenge in financial operations. Before an agent's proposal is approved, DIP parses the agent's internal reasoning trace and scores its integrity.

### The DIS Formula
The Decision Integrity Score (DIS: 0–100) is calculated deterministically across 6 weighted dimensions:
- **Vendor Alignment (15%):** Matches the proposed payee against the mandate and intent anchor.
- **Purpose Coherence (15%):** Evaluates whether the expenditure directly supports the stated objective.
- **Amount Justification (20%):** Validates line items against contract quotes.
- **Evidence Validity (10%):** Verifies supporting document hashes.
- **Temporal Plausibility (20%):** Validates operating hours and invoice payment terms.
- **Agent Behavioral Consistency (20%):** Compares request against historical agent baselines.

### Hard Rejection Triggers
If a brand mismatch (\`DIP_BRAND_MISMATCH\`) or corrupted evidence (\`DIP_EVIDENCE_INVALID\`) is detected, the transaction is immediately rejected regardless of score.

### Connected Modules
- Set up intent anchors in [Intent Anchors](#agents-intents).
- Replay historical decisions in [Cognitive Provenance (CPL)](#ai-cpl).
- Review flagged decisions in [Approvals Queue](#activity-approvals).
    `,related:["agents-intents","ai-cpl","activity-approvals","agents-mandates"],keywords:["dip","decision integrity","dis score","alignment","reasoning trace","intent","gauge"]},{id:"ai-cpl",title:"Cognitive Provenance (CPL)",group:"AI Governance & Trust",groupId:"aiGovernance",path:"Sidebar > AI Governance & Trust > Cognitive Provenance (CPL)",route:"/cpl",summary:"Capture immutable snapshots of AI prompts, context, and reasoning tokens for deterministic replay.",content:`
### Overview
The Cognitive Provenance Layer (CPL) ensures no AI financial decision is a "black box." At the exact millisecond of proposal creation, CPL captures a cryptographic snapshot of the agent's memory, prompt, and execution environment.

### Deterministic Replay Engine
1. Select any past transaction with an attached cognitive snapshot.
2. Click **"Run Replay Verification"**.
3. The engine feeds the historical input into the deterministic evaluation pipeline and computes a **Reproducibility Score (RS: 0–100)**.
4. An RS score < 95 alerts compliance officers of potential model drift or non-deterministic behavior.

### Connected Modules
- Evaluate reasoning traces in [Decision Integrity (DIP)](#ai-dip).
- Compile rules in [Policy Language (JPL)](#ai-jpl).
- Audit historical transactions in [Audit Log & SAR](#activity-audit).
    `,related:["ai-dip","ai-jpl","activity-audit"],keywords:["cpl","cognitive provenance","replay engine","snapshots","reproducibility","audit"]},{id:"ai-jpl",title:"Policy Language (JPL)",group:"AI Governance & Trust",groupId:"aiGovernance",path:"Sidebar > AI Governance & Trust > Policy Language (JPL)",route:"/jpl",summary:"Declarative, domain-specific language for AI agent financial governance with explicit deny precedence.",content:`
### Overview
JobenPay Policy Language (JPL) is an open declarative standard for authoring agent control policies. JPL policies are compiled into deterministic bytecode and signed with Ed25519.

### Key Language Features
- **18 Deterministic Operators:** Mathematical, temporal, and set operations evaluated without floating-point errors.
- **Explicit Deny Precedence:** If any single rule evaluates to \`DENY\`, the entire evaluation resolves to \`DENY\`, overriding all permissive rules.
- **RFC 8785 Canonical Hashing:** Guarantees identical cryptographic hashes across all execution platforms.

### Connected Modules
- Enforce policies in [Deterministic Mandates](#agents-mandates).
- Verify reasoning against policies in [Decision Integrity (DIP)](#ai-dip).
    `,related:["agents-mandates","ai-dip","trust-conformance"],keywords:["jpl","policy language","compiler","evaluator","explicit deny","rules","declarative"]},{id:"ops-overview",title:"Operations Overview",group:"Production Operations",groupId:"operations",path:"Sidebar > Production Operations > Operations Overview",route:"/ops",summary:"Mission control dashboard tracking real-time system health, worker queues, and throughput.",content:`
### Overview
The Operations Dashboard monitors background workers, PostgreSQL job queues (\`SKIP LOCKED\`), email outboxes, and overall engine throughput.

### Health Endpoints
- \`/healthz\`: Liveness probe for load balancers.
- \`/readyz\`: Readiness probe confirming database connectivity, schema checksums, and vault initialization.
- \`/startupz\`: Bootstrap initialization probe.

### Connected Modules
- Monitor latency and uptime targets in [SLO & Error Budgets](#ops-slo).
- Inspect gateway circuit states in [Circuit Breakers](#ops-circuit-breakers).
- Audit key lifecycles in [Secret Rotation](#ops-secrets).
    `,related:["ops-slo","ops-circuit-breakers","ops-secrets","ops-security"],keywords:["operations","ops dashboard","healthz","readyz","workers","queues","throughput"]},{id:"ops-security",title:"Security Hardening & PQC",group:"Production Operations",groupId:"operations",path:"Sidebar > Production Operations > Security Hardening",route:"/security",summary:"Quantum-safe cryptography (ML-DSA-65), behavioral threat detection, and SLSA Level 3 supply chain.",content:`
### Overview
The Security Hardening center manages post-quantum cryptographic defenses, zero-trust tenant boundaries, and real-time rogue agent mitigation.

### Tabs & Capabilities
1. **Post-Quantum Cryptography (PQC):** Inspect active quantum-safe keys (ML-DSA-65, SLH-DSA, Ed25519). Authorized Admins can trigger instant cryptographic key rotations.
2. **Threat Detection (Rogue Agents):** Real-time monitoring for behavioral anomalies (velocity spikes >5x baseline, amount anomalies >3 sigma). Anomalous agents are quarantined automatically.
3. **Supply Chain (SLSA & SBOM):** Verifies application dependencies against SLSA Level 3 attestations and Cosign signatures.

### Connected Modules
- Rotate operational secrets in [Secret Rotation](#ops-secrets).
- Check circuit isolation in [Circuit Breakers](#ops-circuit-breakers).
- Audit event logs in [Audit Log & SAR](#activity-audit).
    `,related:["ops-secrets","ops-circuit-breakers","activity-audit","agents-agents"],keywords:["security","pqc","post-quantum","ml-dsa-65","slsa","sbom","rogue agent","threat detection"]},{id:"ops-slo",title:"SLO & Error Budgets",group:"Production Operations",groupId:"operations",path:"Sidebar > Production Operations > SLO & Error Budgets",route:"/ops/slo",summary:"Track 6 core Service Level Indicators (SLIs) and maintain strict Error Budget policies.",content:`
### Overview
Maintain 99.9% availability and < 300ms p95 evaluation latency across all tenant services. Error budget depletion triggers automatic policy freezes preventing new agent deployments until stability is restored.

### Connected Modules
- Review operational status in [Operations Overview](#ops-overview).
- Follow emergency procedures in [Runbooks & Alerts](#ops-runbooks).
    `,related:["ops-overview","ops-runbooks"],keywords:["slo","sli","error budget","uptime","latency","availability"]},{id:"ops-circuit-breakers",title:"Circuit Breakers",group:"Production Operations",groupId:"operations",path:"Sidebar > Production Operations > Circuit Breakers",route:"/ops/circuit-breakers",summary:"Adaptive failure isolation protecting PayPal, Stripe, and AI provider APIs.",content:`
### Overview
Circuit breakers monitor external provider health. After 5 consecutive failures or timeout spikes, the circuit transitions from \`CLOSED\` ➔ \`OPEN\`, failing fast to prevent threadpool starvation. Half-open probes automatically test service recovery.

### Connected Modules
- See payment routing failover in [Payment Orchestration (POL)](#pay-pol).
- Follow incident runbooks in [Runbooks & Alerts](#ops-runbooks).
    `,related:["pay-pol","ops-runbooks","ops-overview"],keywords:["circuit breakers","fail-fast","half-open","outage protection","resilience"]},{id:"ops-runbooks",title:"Runbooks & Alerts",group:"Production Operations",groupId:"operations",path:"Sidebar > Production Operations > Runbooks & Alerts",route:"/ops/runbooks",summary:"10 operational incident runbooks, alert configurations, and model context protocol instructions.",content:`
### Overview
Step-by-step operational runbooks for engineers and SREs:
- **RB-01:** PayPal Sandbox Outage & Failover Execution.
- **RB-02:** Ledger Hash-Chain Discrepancy Forensic Drill.
- **RB-03:** Dead-Letter Queue (DLQ) Recovery & Replay.
- **RB-04:** PQC Key Rotation Procedure.
- **RB-05:** Model Context Protocol (MCP) Agent Connection Setup.

### Connected Modules
- Rotate keys following RB-04 in [Secret Rotation](#ops-secrets).
- Review security alerts in [Security Hardening & PQC](#ops-security).
    `,related:["ops-secrets","ops-security","ops-circuit-breakers"],keywords:["runbooks","alerts","incident response","dlq","mcp setup","sre"]},{id:"ops-secrets",title:"Secret Rotation",group:"Production Operations",groupId:"operations",path:"Sidebar > Production Operations > Secret Rotation",route:"/ops/secrets",summary:"Zero-downtime rotation for Ed25519 signing keys, AES-256-GCM master keys, and API credentials.",content:`
### Overview
Rotate cryptographic keys with seamless grace periods. During rotation, historical entries remain verifiable via key version ID lookups, while new ledger blocks are signed with the active key.

### Connected Modules
- Inspect quantum-safe keys in [Security Hardening & PQC](#ops-security).
- View hash verification in [Double-Entry Ledger](#activity-ledger).
    `,related:["ops-security","activity-ledger","ops-runbooks"],keywords:["secret rotation","key rotation","aes256","ed25519","grace period","zero downtime"]},{id:"business-organization",title:"Organization Profile",group:"Business Tools",groupId:"businessTools",path:"Sidebar > Business Tools > Organization",route:"/organization",summary:"Manage corporate profile, legal identity registration, and verifiable LEI (vLEI) certificates.",content:`
### Overview
Configure your enterprise organization profile, tax identifiers, base functional currency, and verifiable Legal Entity Identifier (vLEI).

### Connected Modules
- Execute trust verification in [Trust Handshakes](#trust-handshakes).
- Manage team members in [Members Management](#business-members).
    `,related:["trust-handshakes","business-members"],keywords:["organization","company profile","vlei","legal entity","currency"]},{id:"business-members",title:"Members Management",group:"Business Tools",groupId:"businessTools",path:"Sidebar > Business Tools > Members",route:"/members",summary:"Team member administration with strict Role-Based Access Control (RBAC).",content:`
### Overview
Invite team members and assign granular roles:
- **OWNER:** Full corporate authority, freeze controls, and bank configuration.
- **ADMIN:** Policy creation, mandate management, and agent registration.
- **APPROVER:** Authorized to review and approve transaction proposals in dual-custody queues.
- **OPERATOR:** Day-to-day transaction creation and status tracking.
- **VIEWER:** Read-only access for compliance and financial auditors.
- **JUDGE:** Dedicated hackathon evaluation role with full audit, simulation, and approval privileges.

### Connected Modules
- Assign roles for [Approvals Queue](#activity-approvals).
- Configure step-up security in [Security Settings](#business-security).
    `,related:["activity-approvals","business-security","business-organization"],keywords:["members","users","rbac","roles","permissions","judge role","team"]},{id:"business-paypal",title:"PayPal Settings",group:"Business Tools",groupId:"businessTools",path:"Sidebar > Business Tools > PayPal Sandbox",route:"/settings/paypal",summary:"Configure PayPal Sandbox Client ID, Secret, and webhook verification tokens.",content:`
### Overview
Connect your developer PayPal Sandbox credentials to enable live testing of the Payouts API and webhook lifecycle.

### Safety Guarantee
JOBENPAY is hardcoded to connect **exclusively to PayPal Sandbox host endpoints**. Production live PayPal credentials are strictly prohibited and actively blocked by CI runtime guards.

### Connected Modules
- Disburse funds in [Payouts](#pay-payouts).
- Reroute payments in [Payment Orchestration (POL)](#pay-pol).
    `,related:["pay-payouts","pay-pol","activity-transactions"],keywords:["paypal settings","sandbox credentials","client id","webhook token","oauth"]},{id:"business-security",title:"Security Settings",group:"Business Tools",groupId:"businessTools",path:"Sidebar > Business Tools > Security",route:"/settings/security",summary:"User session timeout management, MFA configuration, and Step-Up biometric authentication.",content:`
### Overview
Manage personal account security, active sessions, and step-up authentication. High-value approvals and trust transitions require a valid Step-Up SCA grant before the mutation is committed.

### Connected Modules
- Authorize pending proposals in [Approvals Queue](#activity-approvals).
- Authorize payees in [Payees Directory](#pay-payees).
- Inspect platform keys in [Security Hardening & PQC](#ops-security).
    `,related:["activity-approvals","pay-payees","ops-security"],keywords:["security settings","mfa","step-up","sessions","biometrics","password"]}],H="_pageContainer_qvunb_1",F="_headerCard_qvunb_11",U="_headerTop_qvunb_21",J="_titleArea_qvunb_29",Q="_titleIcon_qvunb_35",W="_pageTitle_qvunb_39",Y="_pageSubtitle_qvunb_47",$="_searchBox_qvunb_53",K="_searchIcon_qvunb_59",X="_searchInput_qvunb_68",Z="_clearSearchBtn_qvunb_86",ee="_layoutGrid_qvunb_101",te="_sidebarList_qvunb_114",ae="_groupBlock_qvunb_126",ie="_groupLabel_qvunb_132",ne="_moduleButton_qvunb_145",re="_moduleButtonActive_qvunb_166",se="_contentCard_qvunb_172",oe="_breadcrumbs_qvunb_189",ce="_breadcrumbSeparator_qvunb_198",de="_articleHeader_qvunb_202",le="_articleTitle_qvunb_212",ue="_articleSummary_qvunb_219",pe="_liveActionBtn_qvunb_226",ye="_navPathCallout_qvunb_248",ge="_navPathIcon_qvunb_260",me="_articleBody_qvunb_264",he="_articleSectionTitle_qvunb_273",ve="_articleText_qvunb_283",be="_bulletList_qvunb_287",fe="_bulletItem_qvunb_295",Pe="_inlineCode_qvunb_299",Se="_anchorLink_qvunb_308",we="_relatedSection_qvunb_323",Ie="_relatedTitle_qvunb_332",ke="_relatedGrid_qvunb_341",Ce="_relatedCard_qvunb_347",Ae="_relatedCardText_qvunb_367",xe="_relatedCardName_qvunb_373",De="_relatedCardGroup_qvunb_379",Oe="_emptySearchState_qvunb_384",t={pageContainer:H,headerCard:F,headerTop:U,titleArea:J,titleIcon:Q,pageTitle:W,pageSubtitle:Y,searchBox:$,searchIcon:K,searchInput:X,clearSearchBtn:Z,layoutGrid:ee,sidebarList:te,groupBlock:ae,groupLabel:ie,moduleButton:ne,moduleButtonActive:re,contentCard:se,breadcrumbs:oe,breadcrumbSeparator:ce,articleHeader:de,articleTitle:le,articleSummary:ue,liveActionBtn:pe,navPathCallout:ye,navPathIcon:ge,articleBody:me,articleSectionTitle:he,articleText:ve,bulletList:be,bulletItem:fe,inlineCode:Pe,anchorLink:Se,relatedSection:we,relatedTitle:Ie,relatedGrid:ke,relatedCard:Ce,relatedCardText:Ae,relatedCardName:xe,relatedCardGroup:De,emptySearchState:Oe},Te={Activity:B,Wallet:R,FileCheck:L,ShieldCheck:M,Cpu:E,Server:_,Grid:T};function _e({content:s,onNavigateModule:m}){const n=s.trim().split(`
`),r=[];let o=[],u=0;const c=()=>{o.length>0&&(r.push(e.jsx("ul",{className:t.bulletList,children:o.map((y,p)=>e.jsx("li",{className:t.bulletItem,children:I(y,m)},p))},`list-${u++}`)),o=[])};return n.forEach((y,p)=>{const d=y.trim();if(!d){c();return}if(d.startsWith("### ")){c(),r.push(e.jsx("h3",{className:t.articleSectionTitle,children:d.replace("### ","")},`h3-${p}`));return}if(d.startsWith("## ")){c(),r.push(e.jsx("h2",{className:t.articleSectionTitle,style:{fontSize:"20px"},children:d.replace("## ","")},`h2-${p}`));return}if(d.startsWith("- ")||/^\d+\.\s/.test(d)){const f=d.replace(/^(-|\d+\.)\s+/,"");o.push(f);return}c(),r.push(e.jsx("p",{className:t.articleText,children:I(d,m)},`p-${p}`))}),c(),e.jsx("div",{className:t.articleBody,children:r})}function I(s,m){const n=/\[([^\]]+)\]\(#([^)]+)\)/g,r=[];let o=0,u;for(;(u=n.exec(s))!==null;){u.index>o&&r.push(k(s.slice(o,u.index)));const c=u[1],y=u[2];r.push(e.jsx("button",{type:"button",className:t.anchorLink,onClick:p=>{p.preventDefault(),m(y)},children:c},`link-${u.index}`)),o=n.lastIndex}return o<s.length&&r.push(k(s.slice(o))),r}function k(s){return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((n,r)=>n.startsWith("**")&&n.endsWith("**")?e.jsx("strong",{children:n.slice(2,-2)},r):n.startsWith("`")&&n.endsWith("`")?e.jsx("code",{className:t.inlineCode,children:n.slice(1,-1)},r):n)}function je(){const s=A(),m=x(),n=g.useRef(null),r=s.hash?s.hash.replace("#",""):"activity-transactions",[o,u]=g.useState(r),[c,y]=g.useState("");g.useEffect(()=>{if(s.hash){const a=s.hash.replace("#","");b.some(v=>v.id===a)&&(u(a),n.current&&n.current.scrollIntoView({behavior:"smooth",block:"start"}))}},[s.hash]);const p=a=>{u(a),m(`/help#${a}`,{replace:!0}),n.current&&n.current.scrollIntoView({behavior:"smooth",block:"start"})},d=g.useMemo(()=>{const a=c.trim().toLowerCase();return a?b.filter(i=>{var v;return i.title.toLowerCase().includes(a)||i.group.toLowerCase().includes(a)||i.summary.toLowerCase().includes(a)||i.content.toLowerCase().includes(a)||((v=i.keywords)==null?void 0:v.some(h=>h.toLowerCase().includes(a)))}):b},[c]),f=g.useMemo(()=>{const a={};return w.forEach(i=>{a[i.id]=[]}),d.forEach(i=>{a[i.groupId]||(a[i.groupId]=[]),a[i.groupId].push(i)}),a},[d]),l=g.useMemo(()=>b.find(a=>a.id===o)||b[0],[o]),P=g.useMemo(()=>l.related?l.related.map(a=>b.find(i=>i.id===a)).filter(Boolean):[],[l]);return e.jsxs("div",{className:t.pageContainer,children:[e.jsxs("div",{className:t.headerCard,children:[e.jsx("div",{className:t.headerTop,children:e.jsxs("div",{className:t.titleArea,children:[e.jsx(q,{size:28,className:t.titleIcon}),e.jsxs("div",{children:[e.jsx("h1",{className:t.pageTitle,children:"Help Center & Documentation"}),e.jsx("p",{className:t.pageSubtitle,children:"Comprehensive, interconnected reference guide for the JOBENPAY Universal Engine."})]})]})}),e.jsxs("div",{className:t.searchBox,children:[e.jsx(N,{size:18,className:t.searchIcon}),e.jsx("input",{type:"text",className:t.searchInput,placeholder:"Search all 39 modules (e.g., PQC, DIP, Payouts, Mandates, Circuit Breakers)...",value:c,onChange:a=>y(a.target.value)}),c?e.jsx("button",{type:"button",className:t.clearSearchBtn,onClick:()=>y(""),"aria-label":"Clear search",children:e.jsx(D,{size:16})}):null]})]}),e.jsxs("div",{className:t.layoutGrid,children:[e.jsx("aside",{className:t.sidebarList,children:d.length===0?e.jsxs("div",{className:t.emptySearchState,children:[e.jsx(O,{size:32}),e.jsxs("p",{children:['No modules match your query "',c,'".']})]}):w.map(a=>{const i=f[a.id]||[];if(i.length===0)return null;const v=Te[a.icon]||S;return e.jsxs("div",{className:t.groupBlock,children:[e.jsxs("div",{className:t.groupLabel,children:[e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:"6px"},children:[e.jsx(v,{size:12}),a.name]}),e.jsx("span",{children:i.length})]}),i.map(h=>e.jsxs("button",{type:"button",className:`${t.moduleButton} ${h.id===l.id?t.moduleButtonActive:""}`,onClick:()=>p(h.id),children:[e.jsx("span",{children:h.title}),e.jsx(j,{size:14,opacity:h.id===l.id?1:.4})]},h.id))]},a.id)})}),e.jsxs("main",{className:t.contentCard,ref:n,children:[e.jsxs("div",{className:t.breadcrumbs,children:[e.jsx("span",{children:"Help"}),e.jsx("span",{className:t.breadcrumbSeparator,children:"/"}),e.jsx("span",{children:l.group}),e.jsx("span",{className:t.breadcrumbSeparator,children:"/"}),e.jsx("strong",{style:{color:"var(--jp-text)"},children:l.title})]}),e.jsxs("div",{className:t.articleHeader,children:[e.jsxs("div",{style:{flex:1},children:[e.jsx("h2",{className:t.articleTitle,children:l.title}),e.jsx("p",{className:t.articleSummary,children:l.summary})]}),l.route?e.jsxs(G,{to:l.route,className:t.liveActionBtn,children:[e.jsx("span",{children:"Open Live Feature"}),e.jsx(z,{size:14})]}):null]}),e.jsxs("div",{className:t.navPathCallout,children:[e.jsx(S,{size:16,className:t.navPathIcon}),e.jsxs("div",{children:[e.jsx("strong",{children:"Navigation Path: "}),e.jsx("span",{children:l.path})]})]}),e.jsx(_e,{content:l.content,onNavigateModule:p}),P.length>0?e.jsxs("div",{className:t.relatedSection,children:[e.jsx("h4",{className:t.relatedTitle,children:"Related Modules & Governance Chains"}),e.jsx("div",{className:t.relatedGrid,children:P.map(a=>e.jsxs("button",{type:"button",className:t.relatedCard,onClick:()=>p(a.id),children:[e.jsxs("div",{className:t.relatedCardText,children:[e.jsx("span",{className:t.relatedCardName,children:a.title}),e.jsx("span",{className:t.relatedCardGroup,children:a.group})]}),e.jsx(V,{size:14,color:"var(--jp-blue)"})]},a.id))})]}):null]})]})]})}export{je as default};
