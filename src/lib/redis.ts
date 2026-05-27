import { Cluster, RedisOptions } from 'ioredis';

const REDIS_NODES = [
  { host: process.env.REDIS_HOST_1 || 'redis-master-1', port: Number(process.env.REDIS_PORT_1) || 6379 },
  { host: process.env.REDIS_HOST_2 || 'redis-master-2', port: Number(process.env.REDIS_PORT_2) || 6379 },
  { host: process.env.REDIS_HOST_3 || 'redis-master-3', port: Number(process.env.REDIS_PORT_3) || 6379 },
];

let cluster: Cluster | null = null;
let connectionAttempted = false;

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 1,
  enableAutoPipelining: true,
  lazyConnect: true,
};

function createCluster(): Cluster {
  const c = new Cluster(REDIS_NODES, {
    clusterRetryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    enableReadyCheck: true,
    redisOptions,
  });

  c.on('error', (err: Error) => {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      return;
    }
    console.error('[Redis] Cluster error:', err.message);
  });

  return c;
}

export function getRedis(): Cluster | null {
  if (!connectionAttempted) {
    connectionAttempted = true;
    try {
      cluster = createCluster();
    } catch (err) {
      console.error('[Redis] Failed to initialize cluster:', err);
      return null;
    }
  }
  return cluster;
}
