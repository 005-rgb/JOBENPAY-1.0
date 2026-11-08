# Capacity Model

## Assumptions
- 10.000 tenants
- 1000 active agents per tenant
- 100 transactions per agent per day
- Total: 1 billion transactions/day (peak: 50.000 TPS)

## Per-Instance Capacity
- Node.js 22 instance (4 vCPU, 8GB RAM)
- 20 PostgreSQL connections
- Average query time: 10ms
- Throughput: 20 / 0.01 = 2000 queries/sec
- With 3 queries per transaction: ~666 TPS per instance

## Required Instances
- 50.000 TPS / 666 TPS = **75 instances**
- Plus 30% headroom: **100 instances**
- Database: PostgreSQL with 50 connections per instance × 100 = 5000 connections
- PgBouncer: `default_pool_size = 5000`, `max_client_conn = 10000`

## Cost Estimate
- 100 Node.js instances: ~$5000/month
- PostgreSQL (managed): ~$3000/month
- PgBouncer: ~$500/month
- Total: ~$8500/month
