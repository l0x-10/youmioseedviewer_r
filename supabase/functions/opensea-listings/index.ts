const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const API_KEY = Deno.env.get('OPENSEA_API_KEY') || '';

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If success or client error (4xx), return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      
      // Server error (5xx) - retry with backoff
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`[OpenSea] Server error ${response.status}, retry ${attempt}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s, 3s
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`[OpenSea] Network error, retry ${attempt}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { collectionSlug } = await req.json();
    
    if (!collectionSlug) {
      return new Response(
        JSON.stringify({ error: 'Collection slug is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[OpenSea] Fetching listings for: ${collectionSlug}`);
    
    let allListings: any[] = [];
    let nextCursor: string | null = null;
    let pageCount = 0;
    const maxPages = 20;
    
    do {
      pageCount++;
      console.log(`[OpenSea] Page ${pageCount}...`);
      
      const url = nextCursor 
        ? `${OPENSEA_API_BASE}/listings/collection/${collectionSlug}/all?next=${nextCursor}`
        : `${OPENSEA_API_BASE}/listings/collection/${collectionSlug}/all`;
      
      const response = await fetchWithRetry(url, {
        headers: {
          'Accept': 'application/json',
          'X-API-KEY': API_KEY,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenSea] API error: ${response.status}`, errorText);
        
        if (allListings.length > 0) {
          console.log(`[OpenSea] Returning ${allListings.length} listings before error`);
          break;
        }
        
        return new Response(
          JSON.stringify({ 
            error: `OpenSea API error: ${response.status}`,
            details: errorText,
            hint: 'OpenSea API may be temporarily unavailable. Please try again in a few minutes.'
          }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const pageListings = data.listings || [];
      allListings = allListings.concat(pageListings);
      
      console.log(`[OpenSea] Page ${pageCount}: ${pageListings.length} (total: ${allListings.length})`);
      
      nextCursor = data.next || null;
      
      if (pageCount >= maxPages) break;
      
    } while (nextCursor);

    console.log(`[OpenSea] ✅ Total ${allListings.length} listings`);

    return new Response(
      JSON.stringify({ listings: allListings }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[OpenSea] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Please try again in a few minutes.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
