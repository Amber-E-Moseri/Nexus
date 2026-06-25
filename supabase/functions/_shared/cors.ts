// Shared CORS headers for edge functions
// Usage: import { corsHeaders } from '../_shared/cors.ts'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

export const corsHeaders = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Vary': 'Origin',
    }
  : {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    }

export function jsonResponse(status: number, body: Record<string, unknown>, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function corsOptionsResponse() {
  return new Response('ok', {
    status: 200,
    headers: corsHeaders,
  })
}
