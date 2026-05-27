import { gzip, gunzip } from 'zlib';
import { getRedis } from './redis';

const COMPRESSION_THRESHOLD = 1024;

function zip(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gzip(data, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function unzip(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(data, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

export async function ping(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function safeGet(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function safeSet(key: string, value: string, ttl?: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    if (ttl && ttl > 0) {
      await redis.set(key, value, 'EX', ttl);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

export async function safeGetCompressed(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const buf = Buffer.from(raw, 'base64');
    const decompressed = await unzip(buf);
    return decompressed.toString('utf-8');
  } catch {
    return null;
  }
}

export async function safeSetCompressed(key: string, value: string, ttl?: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const compressed = await zip(Buffer.from(value, 'utf-8'));
    const encoded = compressed.toString('base64');
    if (ttl && ttl > 0) {
      await redis.set(key, encoded, 'EX', ttl);
    } else {
      await redis.set(key, encoded);
    }
    return true;
  } catch {
    return false;
  }
}

export async function smartSet(key: string, value: string, ttl?: number): Promise<boolean> {
  if (value.length > COMPRESSION_THRESHOLD) {
    return safeSetCompressed(key, value, ttl);
  }
  return safeSet(key, value, ttl);
}

export async function smartGet(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    try {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length > 0 && raw.length > 20) {
        const decompressed = await unzip(buf);
        return decompressed.toString('utf-8');
      }
    } catch {}
    return raw;
  } catch {
    return null;
  }
}

export async function safeGetJson<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const raw = await safeGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function safeSetJson(key: string, data: unknown, ttl?: number): Promise<boolean> {
  return safeSet(key, JSON.stringify(data), ttl);
}

export async function smartGetJson<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const raw = await smartGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function smartSetJson(key: string, data: unknown, ttl?: number): Promise<boolean> {
  return smartSet(key, JSON.stringify(data), ttl);
}

export async function safeDel(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function safeExists(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
}

export interface HealthDetails {
  alive: boolean;
  latencyMs: number | null;
  nodeCount: number;
  clusterState: string | null;
}

export async function checkAlive(): Promise<HealthDetails> {
  const redis = getRedis();
  if (!redis) {
    return { alive: false, latencyMs: null, nodeCount: 0, clusterState: null };
  }

  try {
    const start = Date.now();
    const pong = await redis.ping();
    const latencyMs = Date.now() - start;

    const info = (await redis.cluster('INFO')) as string;
    const clusterState =
      info
        .split('\n')
        .find((l: string) => l.startsWith('cluster_state'))
        ?.split(':')[1]
        ?.trim() || null;

    const nodesOutput = (await redis.cluster('NODES')) as string;
    const nodeCount = nodesOutput.split('\n').filter((l: string) => l.trim()).length;

    return { alive: pong === 'PONG', latencyMs, nodeCount, clusterState };
  } catch {
    return { alive: false, latencyMs: null, nodeCount: 0, clusterState: null };
  }
}
