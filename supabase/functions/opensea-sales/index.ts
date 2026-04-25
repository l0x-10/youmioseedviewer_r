const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const STAKING_API_BASE = 'https://staking.youmio.ai/api';
const API_KEY = Deno.env.get('OPENSEA_API_KEY') || '';

async function fetchPoints(tokenId: string, nftType: string): Promise<number> {
  try {
    const res = await fetch(`${STAKING_API_BASE}/seeds/points?id=${tokenId}&type=${nftType}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.points ?? data.totalPoints ?? data.stakingPoints ?? 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { collectionSlug, nftType, limit = 30 } = await req.json();
    if (!collectionSlug || !nftType) {
      return new Response(
        JSON.stringify({ error: 'collectionSlug and nftType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[OpenSea Sales] Fetching sales for ${collectionSlug}`);

    const url = `${OPENSEA_API_BASE}/events/collection/${collectionSlug}?event_type=sale&limit=${limit}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-API-KEY': API_KEY },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[OpenSea Sales] API error ${res.status}:`, errText);
      return new Response(
        JSON.stringify({ error: `OpenSea API error: ${res.status}`, details: errText }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    const events = data.asset_events || [];

    // Map basic sale info
    const sales = events.map((e: any) => {
      const decimals = e.payment?.decimals ?? 18;
      const quantity = e.payment?.quantity ?? '0';
      const priceEth = parseFloat(quantity) / Math.pow(10, decimals);
      return {
        tokenId: e.nft?.identifier ?? '',
        name: e.nft?.name ?? '',
        imageUrl: e.nft?.display_image_url ?? e.nft?.image_url ?? '',
        openseaUrl: e.nft?.opensea_url ?? '',
        priceEth,
        currency: e.payment?.symbol ?? 'ETH',
        timestamp: e.event_timestamp ?? e.closing_date ?? 0,
        transaction: e.transaction ?? '',
      };
    }).filter((s: any) => s.tokenId);

    // Fetch staking points in parallel (with limited concurrency)
    const points = await Promise.all(
      sales.map((s: any) => fetchPoints(s.tokenId, nftType))
    );
    sales.forEach((s: any, i: number) => { s.stakingPoints = points[i]; });

    console.log(`[OpenSea Sales] Returning ${sales.length} sales`);

    return new Response(
      JSON.stringify({ sales }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[OpenSea Sales] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
