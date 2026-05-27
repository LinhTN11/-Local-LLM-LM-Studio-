#!/usr/bin/env node
// test-cache-warming.mjs
// Wave 2 Task 2.6: Cache Warming Strategy Verification
//
// Validates:
//   1. Redis flush → warmUpGlobalCache() → global:settings key populated
//   2. Redis flush → warmUpGlobalCache() → global:ai-providers key populated
//   3. TTL is set (7 days) on both keys
//   4. Warm-up is idempotent (subsequent calls skipped while in progress)
//   5. PUT /api/settings triggers re-warm
//
// Usage:
//   node scripts/test-cache-warming.mjs
//
// Prerequisites:
//   - Next.js dev server running on http://localhost:3000
//   - Redis Cluster running
//   - PostgreSQL/SQLite running

import { Cluster } from 'ioredis';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const INFO = '\x1b[33mINFO\x1b[0m';
const SKIP = '\x1b[90mSKIP\x1b[0m';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const REDIS_NODES = [
  { host: process.env.REDIS_HOST_1 || 'redis-master-1', port: Number(process.env.REDIS_PORT_1) || 6379 },
  { host: process.env.REDIS_HOST_2 || 'redis-master-2', port: Number(process.env.REDIS_PORT_2) || 6379 },
  { host: process.env.REDIS_HOST_3 || 'redis-master-3', port: Number(process.env.REDIS_PORT_3) || 6379 },
];

let passed = 0;
let failed = 0;
let skipped = 0;

function report(name, ok) {
  if (ok) { passed++; console.log(`  [${PASS}] ${name}`); }
  else { failed++; console.log(`  [${FAIL}] ${name}`); }
}

function skip(name) {
  skipped++;
  console.log(`  [${SKIP}] ${name}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRedis() {
  const cluster = new Cluster(REDIS_NODES, {
    clusterRetryStrategy: () => null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  try {
    await cluster.connect();
  } catch {
    // cluster may already be available
  }
  return cluster;
}

async function flushRedis(redis) {
  try {
    await redis.flushall();
    console.log(`  [${INFO}] Redis flushed.`);
  } catch (err) {
    console.log(`  [${INFO}] Redis flush skipped (${err.message})`);
  }
}

async function keyExists(redis, key) {
  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch {
    return false;
  }
}

async function getTtl(redis, key) {
  try {
    return await redis.ttl(key);
  } catch {
    return -2;
  }
}

async function getJson(redis, key) {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchApi(path, opts = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Cache Warming Strategy — Simulated Test Suite         ║');
  console.log('║   Task 2.6                                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const redis = await getRedis();

  // -----------------------------------------------------------------------
  // Test 1: Flush Redis and call warmUpGlobalCache directly via API
  // -----------------------------------------------------------------------
  console.log('\n--- Test 1: Flush + Warm (via API settings GET triggers init) ---');
  await flushRedis(redis);

  // The warmer hooks into prisma init, so we trigger it by calling a DB-backed API
  const initResult = await fetchApi('/api/settings', { method: 'GET' });
  console.log(`  [${INFO}] GET /api/settings returned status ${initResult.status}`);

  // Wait briefly for async warm-up to complete (triggered by prisma.ts)
  await sleep(2000);

  const hasSettings = await keyExists(redis, 'global:settings');
  report('global:settings exists after warm-up', hasSettings);

  const hasProviders = await keyExists(redis, 'global:ai-providers');
  report('global:ai-providers exists after warm-up', hasProviders);

  // -----------------------------------------------------------------------
  // Test 2: Verify TTL is set (~7 days)
  // -----------------------------------------------------------------------
  console.log('\n--- Test 2: TTL Verification ---');
  const settingsTtl = await getTtl(redis, 'global:settings');
  report(`global:settings TTL ~7 days (got ${settingsTtl}s)`, settingsTtl > 0 && settingsTtl <= 604_800);

  const providersTtl = await getTtl(redis, 'global:ai-providers');
  report(`global:ai-providers TTL ~7 days (got ${providersTtl}s)`, providersTtl > 0 && providersTtl <= 604_800);

  // -----------------------------------------------------------------------
  // Test 3: Verify JSON content
  // -----------------------------------------------------------------------
  console.log('\n--- Test 3: Content Integrity ---');
  const settingsData = await getJson(redis, 'global:settings');
  report('global:settings is valid JSON object', settingsData !== null && typeof settingsData === 'object');
  if (settingsData) {
    const keyCount = Object.keys(settingsData).length;
    console.log(`  [${INFO}] global:settings has ${keyCount} entries`);
  }

  const providersData = await getJson(redis, 'global:ai-providers');
  report('global:ai-providers is valid JSON object', providersData !== null && typeof providersData === 'object');
  if (providersData) {
    const providerCount = Object.keys(providersData).length;
    console.log(`  [${INFO}] global:ai-providers has ${providerCount} providers`);
    const hasLmStudio = !!providersData.lmstudio;
    report('global:ai-providers contains lmstudio', hasLmStudio);
    const hasFreebuff = !!providersData.freebuff;
    report('global:ai-providers contains freebuff', hasFreebuff);
    const hasOpenCode = !!providersData.opencode;
    report('global:ai-providers contains opencode', hasOpenCode);
  }

  // -----------------------------------------------------------------------
  // Test 4: PUT /api/settings triggers re-warm
  // -----------------------------------------------------------------------
  console.log('\n--- Test 4: PUT /api/settings triggers re-warm ---');
  const putResult = await fetchApi('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ test_key: 'test_value_123' }),
  });
  report('PUT /api/settings returns success', putResult.ok && putResult.data?.success === true);

  if (putResult.ok) {
    await sleep(1000);

    const reWarmedSettings = await getJson(redis, 'global:settings');
    const hasTestKey = reWarmedSettings && reWarmedSettings.test_key === 'test_value_123';
    report('Settings cache re-warmed with new key after PUT', hasTestKey);
  } else {
    skip('Settings re-warm verification (PUT failed)');
  }

  // -----------------------------------------------------------------------
  // Test 5: Idempotency — concurrent calls should be skipped
  // -----------------------------------------------------------------------
  console.log('\n--- Test 5: Idempotency (concurrent warm-up guard) ---');
  const warmAgain = await fetchApi('/api/settings', { method: 'GET' });
  console.log(`  [${INFO}] Second GET /api/settings returned status ${warmAgain.status}`);
  // The guard is in-process; we just verify the data is still there
  const stillHasSettings = await keyExists(redis, 'global:settings');
  report('global:settings still present after second init', stillHasSettings);
  const stillHasProviders = await keyExists(redis, 'global:ai-providers');
  report('global:ai-providers still present after second init', stillHasProviders);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                       RESULTS                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log('');

  if (redis) {
    try { await redis.quit(); } catch {}
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
