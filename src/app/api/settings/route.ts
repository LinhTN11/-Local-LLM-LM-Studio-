import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { warmUpGlobalCache } from '@/lib/cache-warmer';

export async function GET() {
  try {
    const settings = await prisma.setting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return NextResponse.json(map);
  } catch (error: any) {
    console.error('[Settings API] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch settings', message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, string>;
    const entries = Object.entries(body).filter(([k]) => k);

    for (const [key, value] of entries) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }

    await warmUpGlobalCache();

    console.log(`[Settings API] Updated ${entries.length} setting(s) and re-warmed cache.`);
    return NextResponse.json({ success: true, updated: entries.length });
  } catch (error: any) {
    console.error('[Settings API] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update settings', message: error.message }, { status: 500 });
  }
}
