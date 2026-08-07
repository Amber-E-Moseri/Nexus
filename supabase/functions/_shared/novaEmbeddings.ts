// Nova embedding helpers — calls OpenAI Embeddings API.
// Used by nova-jobs/embedContent.ts (batch) and nova-orchestrate/ask.ts (query-time).
// Model is fixed at text-embedding-3-small (1536 dims) to match nova_embeddings DDL.

export const EMBEDDING_MODEL = Deno.env.get('NOVA_EMBEDDING_MODEL') ?? 'text-embedding-3-small'
export const EMBEDDING_DIMENSION = 1536 // fixed — matches vector(1536) in nova_embeddings

export async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured for embeddings')

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`Embeddings API error ${resp.status}: ${(err as any).error?.message ?? ''}`)
  }

  const result = await resp.json()
  return (result.data[0].embedding) as number[]
}

// Split content into ~400-token chunks (rough char estimate: ~4 chars/token)
export function chunkText(text: string, maxChars = 1600): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChars && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)]
}

export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
