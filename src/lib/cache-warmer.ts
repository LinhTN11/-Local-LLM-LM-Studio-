import { prisma } from './prisma';
import { PROVIDER_CONFIG } from '@/config/providers';
import { safeSetJson, safeDel } from './redis-util';

const GLOBAL_TTL = 7 * 24 * 60 * 60;

const GLOBAL_SETTINGS_KEY = 'global:settings';
const GLOBAL_AI_PROVIDERS_KEY = 'global:ai-providers';

let warmingInProgress = false;

export async function warmUpGlobalCache(): Promise<boolean> {
  if (warmingInProgress) {
    console.log('[CacheWarmer] Already warming, skipping concurrent call.');
    return false;
  }

  warmingInProgress = true;
  console.log('[CacheWarmer] Starting global cache warm-up...');

  try {
    const settings = await prisma.setting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }
    await safeDel(GLOBAL_SETTINGS_KEY);
    await safeSetJson(GLOBAL_SETTINGS_KEY, settingsMap, GLOBAL_TTL);
    console.log(`[CacheWarmer] Warmed global:settings with ${Object.keys(settingsMap).length} entries (TTL=${GLOBAL_TTL}s)`);

    const providersPayload = PROVIDER_CONFIG;
    await safeDel(GLOBAL_AI_PROVIDERS_KEY);
    await safeSetJson(GLOBAL_AI_PROVIDERS_KEY, providersPayload, GLOBAL_TTL);
    console.log(`[CacheWarmer] Warmed global:ai-providers with ${Object.keys(providersPayload).length} providers (TTL=${GLOBAL_TTL}s)`);

    console.log('[CacheWarmer] Global cache warm-up complete.');
    return true;
  } catch (err) {
    console.error('[CacheWarmer] Warm-up failed:', (err as Error).message);
    return false;
  } finally {
    warmingInProgress = false;
  }
}
