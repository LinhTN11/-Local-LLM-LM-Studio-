import { NextRequest, NextResponse } from 'next/server';

const LM_STUDIO_TIMEOUT_MS = 1500;
const LM_STUDIO_LOAD_TIMEOUT_MS = 60000;

interface NativeLmModel {
  key: string;
  display_name?: string;
  loaded_instances?: Array<{ id?: string }>;
}

interface NativeModelsResponse {
  models?: NativeLmModel[];
}

interface OpenAiModel {
  id: string;
}

interface OpenAiModelsResponse {
  data?: OpenAiModel[];
}

const fetchLmStudio = (url: string, init: RequestInit = {}, timeoutMs = LM_STUDIO_TIMEOUT_MS) => {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
};

export async function GET() {
  try {
    // Attempt to fetch from native LM Studio API first (returns all downloaded models)
    try {
      const nativeRes = await fetchLmStudio('http://127.0.0.1:1234/api/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (nativeRes.ok) {
        const data = await nativeRes.json();
        if (data && Array.isArray(data.models)) {
          // Format native models to the format expected by our UI
          const formattedModels = (data as NativeModelsResponse).models!.map((m) => {
            const isLoaded = Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0;
            return {
              id: m.key,
              name: m.display_name || m.key.split('/').pop()?.split('\\').pop() || m.key,
              description: isLoaded ? 'Active in LM Studio' : 'Downloaded (Click to load)',
              badge: isLoaded ? 'Active' : 'Downloaded'
            };
          });
          return NextResponse.json({ data: formattedModels });
        }
      }
    } catch {
      console.warn('Native LM Studio API /api/v1/models unavailable, falling back to OpenAI format.');
    }

    // Fallback to OpenAI-compatible endpoint
    const res = await fetchLmStudio('http://127.0.0.1:1234/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!res.ok) {
      throw new Error(`LM Studio replied with status: ${res.status}`);
    }

    const data = await res.json();
    
    // Format OpenAI response
    if (data && Array.isArray(data.data)) {
      const formattedModels = (data as OpenAiModelsResponse).data!.map((m) => ({
        id: m.id,
        name: m.id.split('/').pop()?.split('\\').pop() || m.id,
        description: 'Local model active on LM Studio',
        badge: 'Active'
      }));
      return NextResponse.json({ data: formattedModels });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    console.warn('LM Studio is offline or unreachable.');
    return NextResponse.json(
      { error: 'LM Studio offline', details: message },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { model } = await req.json();
    if (!model) {
      return NextResponse.json({ error: 'Model identifier is required' }, { status: 400 });
    }

    console.log(`Requested to load model in LM Studio: ${model}`);

    // 1. Fetch currently active models to check for loaded instances and unload them
    try {
      const activeRes = await fetchLmStudio('http://127.0.0.1:1234/api/v1/models', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (activeRes.ok) {
        const activeData = await activeRes.json();
        if (activeData && Array.isArray(activeData.models)) {
          // Find all active instances to unload (exclude the target model if it's already active)
          const instancesToUnload: string[] = [];
          for (const m of (activeData as NativeModelsResponse).models!) {
            if (Array.isArray(m.loaded_instances)) {
              for (const instance of m.loaded_instances) {
                if (m.key !== model && instance.id) {
                  instancesToUnload.push(instance.id);
                }
              }
            }
          }

          if (instancesToUnload.length > 0) {
            console.log(`Unloading ${instancesToUnload.length} old model instance(s) to free RAM/VRAM...`);
            for (const instanceId of instancesToUnload) {
              try {
                await fetchLmStudio('http://127.0.0.1:1234/api/v1/models/unload', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ instance_id: instanceId }),
                });
                console.log(`Successfully unloaded instance: ${instanceId}`);
              } catch (unloadErr: unknown) {
                const message = unloadErr instanceof Error ? unloadErr.message : 'unknown error';
                console.error(`Failed to unload instance ${instanceId}:`, message);
              }
            }
          }
        }
      }
    } catch (checkErr: unknown) {
      const message = checkErr instanceof Error ? checkErr.message : 'unknown error';
      console.warn('Could not query active models for unloading:', message);
    }

    // 2. Call LM Studio native load endpoint to load the new model
    console.log(`Sending load model request to LM Studio for: ${model}`);
    let res: Response | null = null;
    try {
      res = await fetchLmStudio('http://127.0.0.1:1234/api/v1/models/load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
        }),
      }, LM_STUDIO_LOAD_TIMEOUT_MS);
    } catch (loadErr: unknown) {
      const isTimeout = loadErr instanceof DOMException && loadErr.name === 'TimeoutError';
      if (isTimeout) {
        return NextResponse.json(
          { success: false, status: 'loading', details: 'LM Studio load still in progress' },
          { status: 202 }
        );
      }
      throw loadErr;
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LM Studio failed to load model: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('Error loading model in LM Studio:', error);
    return NextResponse.json(
      { error: 'Failed to load model', details: message },
      { status: 500 }
    );
  }
}
