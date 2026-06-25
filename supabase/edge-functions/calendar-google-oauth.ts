// Google Calendar OAuth Callback Handler
// Exchanges authorization code for access/refresh tokens

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const spaceId = url.searchParams.get('space_id');

    // Handle OAuth errors from Google
    if (error) {
      console.error('Google OAuth error:', error);
      const errorDescription = url.searchParams.get('error_description') || 'Authorization failed';
      return new Response(
        JSON.stringify({ error, error_description: errorDescription }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!code || !spaceId) {
      return new Response(
        JSON.stringify({ error: 'Missing code or space_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForToken(code, supabaseUrl);

    if (!tokenResponse.access_token) {
      throw new Error('Failed to get access token from Google');
    }

    // Get user info to verify the token works
    const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);
    const googleCalendarId = userInfo.email || 'primary';

    // Get the space details
    const { data: space, error: spaceError } = await supabase
      .from('departments')
      .select('id, organization_id')
      .eq('id', spaceId)
      .single();

    if (spaceError || !space) {
      console.error('Space not found:', spaceError);
      return new Response(
        JSON.stringify({ error: 'Space not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('User not authenticated:', userError);
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Encrypt tokens before storing (application should decrypt on use)
    // For now, we'll store them as-is and rely on database-level encryption
    // In production, use a proper encryption library

    // Check if sync already exists
    const { data: existingSync } = await supabase
      .from('google_calendar_sync')
      .select('id')
      .eq('org_id', space.organization_id)
      .eq('space_id', spaceId)
      .single();

    // Upsert the sync configuration
    const { data: syncConfig, error: syncError } = await supabase
      .from('google_calendar_sync')
      .upsert(
        {
          org_id: space.organization_id,
          space_id: spaceId,
          google_calendar_id: googleCalendarId,
          google_access_token: tokenResponse.access_token,
          google_refresh_token: tokenResponse.refresh_token || null,
          token_expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
          sync_enabled: true,
          sync_direction: 'both',
          connected_by: user.id,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,space_id,google_calendar_id' }
      )
      .select()
      .single();

    if (syncError) {
      console.error('Failed to store sync config:', syncError);
      throw syncError;
    }

    // Log the action
    await supabase
      .from('activity_log')
      .insert({
        user_id: user.id,
        action: 'calendar_google_connected',
        entity_type: 'google_calendar_sync',
        entity_id: syncConfig.id,
        metadata: {
          space_id: spaceId,
          google_calendar_id: googleCalendarId,
        },
      })
      .select()
      .single();

    // Redirect to success page or return success response
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
    const successUrl = `${frontendUrl}/calendar/settings?sync=success&space=${spaceId}`;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Google Calendar connected successfully',
        sync_config: syncConfig,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

/**
 * Exchange authorization code for access tokens
 */
async function exchangeCodeForToken(code: string, supabaseUrl: string): Promise<GoogleTokenResponse> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const redirectUri = `${supabaseUrl}/functions/v1/calendar-google-oauth`;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!response.ok) {
    const error = (await response.json()) as OAuthError;
    throw new Error(`Google OAuth error: ${error.error} - ${error.error_description}`);
  }

  return response.json();
}

/**
 * Fetch authenticated user info from Google
 */
async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  return response.json();
}
