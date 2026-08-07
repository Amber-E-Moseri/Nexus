// Nova model router — Anthropic and OpenAI support.
// Provider is detected from the model name prefix.
// Set NOVA_FAST_MODEL=gpt-4o-mini and OPENAI_API_KEY for the cheap path.
// Set NOVA_SYNTHESIS_MODEL=claude-sonnet-5 and ANTHROPIC_API_KEY for the quality path.

const ANTHROPIC_API_VERSION = '2023-06-01'

export const NOVA_MODELS = {
  fast: Deno.env.get('NOVA_FAST_MODEL') ?? 'gpt-4o-mini',
  synthesis: Deno.env.get('NOVA_SYNTHESIS_MODEL') ?? 'claude-sonnet-5',
}

export type NovaModelTier = keyof typeof NOVA_MODELS

export class NovaApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'NovaApiError'
    this.status = status
  }
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')
}

export interface ClaudeCallOptions {
  tier: NovaModelTier
  // systemBlocks: Anthropic-style [{type:'text', text:'...', cache_control?:{...}}]
  // For OpenAI, text is extracted and joined; cache_control is ignored.
  systemBlocks: unknown[]
  messages: unknown[]
  tools?: unknown[]
  maxTokens?: number
  timeoutMs?: number
}

export interface ModelCallResult {
  // Raw provider response (kept for callers that need cache token fields)
  response: any
  model: string
  provider: 'anthropic' | 'openai'
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

function extractSystemText(systemBlocks: unknown[]): string {
  return (systemBlocks as any[])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text ?? '')
    .join('\n\n')
    .trim()
}

async function callOpenAI(
  model: string,
  opts: ClaudeCallOptions,
  apiKey: string,
): Promise<ModelCallResult> {
  const systemText = extractSystemText(opts.systemBlocks)

  const messages: any[] = []
  if (systemText) messages.push({ role: 'system', content: systemText })
  for (const m of opts.messages as any[]) {
    messages.push(m)
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    messages,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000)

  let resp: Response
  try {
    resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NovaApiError(`OpenAI call timed out after ${opts.timeoutMs ?? 60000}ms`, 408)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}))
    const msg = (errBody as any).error?.message || `OpenAI error ${resp.status}`
    throw new NovaApiError(msg, resp.status)
  }

  const result = await resp.json()
  return {
    response: result,
    model,
    provider: 'openai',
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  }
}

async function callAnthropic(
  model: string,
  opts: ClaudeCallOptions,
  apiKey: string,
): Promise<ModelCallResult> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.systemBlocks,
    messages: opts.messages,
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = { type: 'auto' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000)

  let resp: Response
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NovaApiError(`Anthropic call timed out after ${opts.timeoutMs ?? 60000}ms`, 408)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}))
    const msg = (errBody as any).error?.message || `Anthropic error ${resp.status}`
    throw new NovaApiError(msg, resp.status)
  }

  const result = await resp.json()
  return {
    response: result,
    model,
    provider: 'anthropic',
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
    cacheCreationInputTokens: result.usage?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: result.usage?.cache_read_input_tokens ?? 0,
  }
}

export async function callClaude(opts: ClaudeCallOptions): Promise<ModelCallResult> {
  const model = NOVA_MODELS[opts.tier]

  if (isOpenAIModel(model)) {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new NovaApiError('OPENAI_API_KEY not configured', 500)
    return callOpenAI(model, opts, apiKey)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new NovaApiError('ANTHROPIC_API_KEY not configured', 500)
  return callAnthropic(model, opts, apiKey)
}

export function extractTextFromResponse(result: ModelCallResult): string {
  if (result.provider === 'openai') {
    return (result.response.choices?.[0]?.message?.content ?? '').trim()
  }
  // Anthropic
  return (result.response.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim()
}
