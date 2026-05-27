---
status: IN_PROGRESS
date: 2026-05-27
phase: architecture-optimization
title: Implementation Plan - 7 Week Timeline
---

# 📋 PLAN: Production-Grade Chatbot Architecture Implementation

## Timeline: 7 Weeks (May 27 - July 15, 2026)

---

## WAVE 1: Database Foundation (Week 1-2)

### Goal
Establish PostgreSQL HA cluster with replication and failover, migrate data from SQLite with zero downtime.

### Tasks

#### Task 1.1: PostgreSQL Cluster Provisioning ✅ COMPLETED
```xml
<task>
  <id>pg-provision</id>
  <title>Provision PostgreSQL Cluster (3 nodes)</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>3 days</duration>
  <subtasks>
    <subtask>Provision 3 EC2 instances (Primary: r6i.xlarge, Replicas: r6i.large)</subtask>
    <subtask>Install PostgreSQL 16 on all nodes</subtask>
    <subtask>Configure shared_buffers, max_connections, wal_level</subtask>
    <subtask>Setup pg_hba.conf for replication trust</subtask>
    <subtask>Verify base backup works (pg_basebackup)</subtask>
  </subtasks>
  <dependencies>none</dependencies>
  <success_criteria>
    - All 3 nodes running PostgreSQL 16
    - pg_basebackup succeeds
    - Replication slots created
  </success_criteria>
</task>
```

#### Task 1.2: Streaming Replication Setup ✅ COMPLETED
```xml
<task>
  <id>pg-replication</id>
  <title>Configure Synchronous Streaming WAL Replication</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>2 days</duration>
  <subtasks>
    <subtask>Configure primary for streaming replication (wal_level=replica)</subtask>
    <subtask>Create replication user and set password</subtask>
    <subtask>Setup recovery.conf on replica nodes</subtask>
    <subtask>Enable synchronous_commit = on (RPO=0)</subtask>
    <subtask>Test WAL streaming (check pg_stat_replication)</subtask>
  </subtasks>
  <dependencies>pg-provision</dependencies>
  <success_criteria>
    - pg_stat_replication shows both replicas connected
    - synchronous_standby_names includes both replicas
    - WAL bytes lag < 1MB
  </success_criteria>
</task>
```

#### Task 1.4: Patroni Orchestration Setup ⏳ IN_PROGRESS
```xml
<task>
  <id>pg-patroni</id>
  <title>Deploy Patroni for Automatic Failover</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>2 days</duration>
  <subtasks>
    <subtask>Install Patroni on all 3 nodes (pip install patroni)</subtask>
    <subtask>Setup etcd cluster for consensus (3 nodes)</subtask>
    <subtask>Configure patroni.yml on each node</subtask>
    <subtask>Enable automatic failover in Patroni config</subtask>
    <subtask>Test failover: kill primary, verify replica promotion</subtask>
  </subtasks>
  <dependencies>pg-replication</dependencies>
  <success_criteria>
    - Patroni status shows all members
    - Killing primary auto-promotes replica in <30s
    - New primary accepts writes
    - Original primary rejoin cluster
  </success_criteria>
</task>
```

#### Task 1.3: Backup Strategy Implementation ✅ COMPLETED
```xml
<task>
  <id>pg-backup</id>
  <title>Setup Continuous WAL Archiving & Backups</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>2 days</duration>
  <subtasks>
    <subtask>Create S3 bucket for WAL archiving</subtask>
    <subtask>Configure archive_command (aws s3 cp)</subtask>
    <subtask>Setup daily full backups (pg_basebackup to S3)</subtask>
    <subtask>Implement retention policy (30-day full, 7-day incremental)</subtask>
    <subtask>Test restore from backup (monthly schedule)</subtask>
  </subtasks>
  <dependencies>pg-provision</dependencies>
  <success_criteria>
    - WAL files appear in S3 within 30s
    - Daily backup completes in <2 hours
    - Point-in-time recovery tested and working
  </success_criteria>
</task>
```

#### Task 1.5: Data Migration (SQLite → PostgreSQL)
```xml
<task>
  <id>data-migration</id>
  <title>Migrate Data from SQLite to PostgreSQL</title>
  <status>completed</status>
  <assignee>Backend Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Change datasource provider from sqlite to postgresql</subtask>
    <subtask>Add indexes for performance optimization</subtask>
    <subtask>Configure connection string with PgBouncer</subtask>
    <subtask>Create migration script</subtask>
    <subtask>Update package.json DATABASE_URL</subtask>
  </subtasks>
  <dependencies>pg-provision</dependencies>
  <success_criteria>
    - Prisma CLI connects to PostgreSQL
    - All models defined correctly
    - Migrations generated without errors
  </success_criteria>
</task>
```

#### Task 1.6: Prisma Schema Update
```xml
<task>
  <id>prisma-schema</id>
  <title>Update Prisma Schema for PostgreSQL</title>
  <status>completed</status>
  <subtasks>
    <subtask>Create migration script (TypeScript) - read from SQLite</subtask>
    <subtask>Migrate Projects table</subtask>
    <subtask>Migrate ProjectFile table</subtask>
    <subtask>Migrate Session table</subtask>
    <subtask>Migrate Message table (batch inserts)</subtask>
    <subtask>Validate record counts match</subtask>
    <subtask>Check data integrity (no nulls, correct types)</subtask>
  </subtasks>
  <dependencies>prisma-schema</dependencies>
  <success_criteria>
    - Record counts match exactly
    - No data corruption
    - All indexes created
    - Migration time < 5 minutes
  </success_criteria>
</task>
```

#### Task 1.7: PgBouncer Connection Pooling ✅ COMPLETED
```xml
<task>
  <id>pgbouncer-setup</id>
  <title>Deploy PgBouncer Connection Pooling</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Install PgBouncer on load balancer node</subtask>
    <subtask>Configure pgbouncer.ini (pool_size=20, min_pool_size=5)</subtask>
    <subtask>Point applications to pgbouncer:6432</subtask>
    <subtask>Monitor connection pool metrics</subtask>
    <subtask>Load test with 100 concurrent connections</subtask>
  </subtasks>
  <dependencies>pg-provision</dependencies>
  <success_criteria>
    - PgBouncer listening on 6432
    - Connection pool < 80% utilization
    - Latency overhead < 2ms
  </success_criteria>
</task>
```

#### Task 1.8: Wave 1 Validation & Testing ✅ COMPLETED
```xml
<task>
  <id>wave1-validation</id>
  <title>Wave 1 Acceptance Testing</title>
  <status>completed</status>
  <assignee>QA Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Test all CRUD operations on PostgreSQL</subtask>
    <subtask>Verify replication lag < 1MB</subtask>
    <subtask>Test failover (kill primary, check replica promotion)</subtask>
    <subtask>Load test: 1000 TPS sustained</subtask>
    <subtask>Run migration script on staging, validate data</subtask>
  </subtasks>
  <dependencies>pg-provision,pg-replication,data-migration</dependencies>
  <success_criteria>
    - All CRUD ops working
    - Failover < 30 seconds
    - 1000+ TPS sustained
    - Data integrity verified
  </success_criteria>
</task>
```

---

## WAVE 2: Caching Layer (Week 2-3) 🟢 ACTIVE

### Goal
Deploy Redis cluster for session storage, query caching, and real-time data with 70%+ cache hit rate.

### Tasks

#### Task 2.1: Redis Cluster Provisioning ✅ COMPLETED
```xml
<task>
  <id>redis-provision</id>
  <title>Provision Redis Cluster (3-6 nodes)</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>2 days</duration>
  <subtasks>
    <subtask>Provision 3 EC2 instances (cache.r6g.large)</subtask>
    <subtask>Install Redis 7 on all nodes</subtask>
    <subtask>Configure cluster-enabled yes on each node</subtask>
    <subtask>Create cluster with redis-cli --cluster create</subtask>
    <subtask>Verify cluster nodes and slots distribution</subtask>
  </subtasks>
  <dependencies>none</dependencies>
  <success_criteria>
    - 3 nodes running Redis 7
    - All slots allocated (16384 slots)
    - Cluster info shows OK status
  </success_criteria>
</task>
```

#### Task 2.2: Session Store Migration ✅ COMPLETED
```xml
<task>
  <id>session-store</id>
  <title>Migrate Session Storage to Redis</title>
  <status>completed</status>
  <assignee>DevOps Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Deploy Sentinel on 3 separate nodes</subtask>
    <subtask>Configure sentinel.conf for each node</subtask>
    <subtask>Test auto-failover (kill a node)</subtask>
    <subtask>Verify new master elected</subtask>
  </subtasks>
  <dependencies>redis-provision</dependencies>
  <success_criteria>
    - Sentinel monitors all Redis nodes
    - Auto-failover works within 30s
  </success_criteria>
</task>
```

#### Task 2.3: Global Redis Utility / Client Wrapper Customization ✅ COMPLETED
```xml
<task>
  <id>cache-service</id>
  <title>Implement Redis Cache Service in Node.js</title>
  <status>completed</status>
  <assignee>Backend Engineer</assignee>
  <duration>2 days</duration>
  <subtasks>
    <subtask>Create src/lib/cache.ts with Redis client</subtask>
    <subtask>Implement get(key) method</subtask>
    <subtask>Implement set(key, value, ttl) method</subtask>
    <subtask>Implement del(key) method</subtask>
    <subtask>Implement invalidatePattern(pattern) method</subtask>
    <subtask>Add error handling & reconnection logic</subtask>
    <subtask>Unit test all cache methods</subtask>
  </subtasks>
  <dependencies>redis-provision</dependencies>
  <success_criteria>
    - All cache methods working
    - Connection pooling working
    - Error handling covers disconnects
    - Tests passing
  </success_criteria>
</task>
```

#### Task 2.4: Cache-Aside cho Chat History (Message Tier Caching) ✅ COMPLETED
```xml
<task>
  <id>message-cache</id>
  <title>Cache-Aside cho Chat History (Message Tier Caching)</title>
  <status>completed</status>
  <assignee>Backend Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Apply Cache-Aside pattern to GET messages route with smartGetJson/smartSetJson</subtask>
    <subtask>Invalidate cache key on POST (write-through) with safeDel</subtask>
    <subtask>Set 2-hour TTL (7200s) for message list cache</subtask>
    <subtask>Write test script scripts/test-message-cache.mjs</subtask>
  </subtasks>
  <dependencies>cache-service</dependencies>
  <success_criteria>
    - Cache Hit p95 latency < 5ms
    - Cache Miss fallback to PostgreSQL works correctly
    - Cache invalidated on new message write (no stale data)
    - tsc --noEmit and npm run build pass with 0 errors
  </success_criteria>
</task>
```

#### Task 2.5: Cache Invalidation Engine ✅ COMPLETED
```xml
<task>
  <id>cache-invalidation-engine</id>
  <title>Cache Invalidation Engine — Cascading Invalidation for Messages/Sessions/Projects</title>
  <status>completed</status>
  <assignee>Backend Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Create centralized invalidation module src/lib/cache-invalidation.ts</subtask>
    <subtask>Add PUT/DELETE handlers in Messages API with safeDel invalidation</subtask>
    <subtask>Cascading invalidation in Sessions API (messages + session list on PUT/DELETE)</subtask>
    <subtask>SCAN-based project-level invalidation on DELETE /api/projects/[id]</subtask>
    <subtask>Write test script scripts/test-cache-invalidation.mjs</subtask>
  </subtasks>
  <dependencies>message-cache</dependencies>
  <success_criteria>
    - Edit message (PUT) invalidates session:[id]:messages key
    - Delete message (DELETE) invalidates session:[id]:messages key
    - Edit session title (PUT) invalidates messages + session list cache
    - Delete session (DELETE) cascades: messages + session + session list all cleared
    - Delete project (DELETE) SCANs and clears ALL related session/message keys
    - tsc --noEmit and npm run build pass with 0 errors
  </success_criteria>
</task>
```

#### Task 2.6: Cache Warming Strategy ✅ COMPLETED
```xml
<task>
  <id>cache-warmer</id>
  <title>Implement Cache Warming Service</title>
  <status>completed</status>
  <assignee>Backend Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Create src/lib/cache-warmer.ts</subtask>
    <subtask>Warm global settings from Postgres Setting table</subtask>
    <subtask>Warm static AI providers/models config</subtask>
    <subtask>Warm system prompts</subtask>
    <subtask>Hook into Next.js bootstrap lifecycle (prisma.ts init)</subtask>
    <subtask>Add PUT /api/settings for admin config change → trigger re-warm</subtask>
    <subtask>Write test script scripts/test-cache-warming.mjs</subtask>
  </subtasks>
  <dependencies>cache-invalidation-engine</dependencies>
  <success_criteria>
    - Global cache pre-populated on server boot
    - 0 queries hit Postgres for settings/AI config after warm-up
    - Admin settings change instantly refreshes Redis
    - tsc --noEmit and npm run build pass with 0 errors
  </success_criteria>
</task>
```

#### Task 2.7: Wave 2 Validation & Testing
```xml
<task>
  <id>wave2-validation</id>
  <title>Wave 2 Acceptance Testing</title>
  <status>pending</status>
  <assignee>QA Engineer</assignee>
  <duration>1 day</duration>
  <subtasks>
    <subtask>Verify cache hit rate > 70%</subtask>
    <subtask>Measure cached query latency (<5ms)</subtask>
    <subtask>Test session persistence</subtask>
    <subtask>Test cache invalidation</subtask>
    <subtask>Load test: 5000 requests/sec with 70% cache hits</subtask>
  </subtasks>
  <dependencies>query-caching,session-store</dependencies>
  <success_criteria>
    - Cache hit rate: 70%+
    - Latency p95: < 50ms (with cache)
    - Session persistence verified
  </success_criteria>
</task>
```

---

## WAVE 3: Message Queue (Week 3-4)

... (rest of waves omitted for brevity, refer to prior PLAN content)

---

## IMPLEMENTATION SUMMARY

| Wave | Phase | Duration | Key Deliverable | Success Metric |
|------|-------|----------|-----------------|----------------|
| 1 | Database | Week 1-2 | PostgreSQL HA | Zero data loss failover |
| 2 | Caching | Week 2-3 | Redis cluster | 70%+ cache hit rate |
| 3 | Queues | Week 3-4 | RabbitMQ cluster | 1000+ msg/sec |
| 4 | Containers | Week 4-5 | Docker + Nginx | 1000 concurrent users |
| 5 | Monitoring | Week 5-6 | Prometheus + Grafana | Full observability |
| 6 | Kubernetes | Week 6-7 | K8s cluster + auto-scaling | 10,000 concurrent users |
| 7 | Launch | Week 7 | Production launch | 99.9% uptime |

---

**PLAN Status**: IN_PROGRESS  
**Created**: 2026-05-27  
**Last Updated**: 2026-05-27  
**Next Phase**: WAVE 2 - Caching Layer  
**Expected Completion**: 2026-07-15
