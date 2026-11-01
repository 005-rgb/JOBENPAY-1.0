# Architecture

The diagram below shows the primary payout path. The AI check can only make a deterministic outcome more restrictive; requests requiring human review pause at Approval. Approved execution is handled by the server worker, and the verified provider result is reconciled before the ledger records the outcome.

![JOBENPAY request and payout architecture](architecture.svg)

```text
Request -> Gate -> AI -> Approval -> Execution -> Webhook -> Ledger
```

The API and web application run on Node.js/Express. PostgreSQL stores tenant-scoped requests, jobs, approvals, and ledger entries. Uploaded documents are stored outside the public web root. The provider integration is restricted to PayPal Sandbox.
