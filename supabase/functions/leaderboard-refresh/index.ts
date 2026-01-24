import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const OPENSEA_API_KEY = Deno.env.get('OPENSEA_API_KEY') ?? '';
const STAKING_API_BASE = 'https://staking.youmio.ai/api';

const COLLECTIONS = [
  { nftType: 'Ancient', slug: 'ancientseed' },
  { nftType: 'Mythic', slug: 'mythicseed' },
] as const;

type NFTType = 'Ancient' | 'Mythic';

interface NFTItem {
  identifier: string;
  image_url: string | null;
  opensea_url: string | null;
}

async function fetchAllNFTs(collectionSlug: string): Promise<NFTItem[]> {
  const allNFTs: NFTItem[] = [];
  let nextCursor: string | null = null;
  let pageCount = 0;
  const maxPages = 50;
  const limit = 200;

  do {
    pageCount++;
    let url = `${OPENSEA_API_BASE}/collection/${collectionSlug}/nfts?limit=${limit}`;
    if (nextCursor) url += `&next=${nextCursor}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-API-KEY': OPENSEA_API_KEY },
    });

    if (!response.ok) {
      console.error(`[Refresh] OpenSea error page ${pageCount}: ${response.status}`);
      break;
    }

    const data = await response.json();
    const nfts = data.nfts || [];
    allNFTs.push(...nfts.map((n: any) => ({
      identifier: n.identifier,
      image_url: n.image_url,
      opensea_url: n.opensea_url,
    })));

    nextCursor = data.next || null;
    if (pageCount >= maxPages) break;
  } while (nextCursor);

  console.log(`[Refresh] Fetched ${allNFTs.length} NFTs for ${collectionSlug}`);
  return allNFTs;
}

async function fetchListedTokenIds(collectionSlug: string): Promise<Set<string>> {
  const listedIds = new Set<string>();
  let nextCursor: string | null = null;
  let pageCount = 0;
  const maxPages = 20;

  do {
    pageCount++;
    let url = `${OPENSEA_API_BASE}/listings/collection/${collectionSlug}/all`;
    if (nextCursor) url += `?next=${nextCursor}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-API-KEY': OPENSEA_API_KEY },
    });

    if (!response.ok) break;

    const data = await response.json();
    const listings = data.listings || [];
    for (const listing of listings) {
      const tokenId = listing.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria;
      if (tokenId) listedIds.add(tokenId);
    }

    nextCursor = data.next || null;
    if (pageCount >= maxPages) break;
  } while (nextCursor);

  console.log(`[Refresh] Found ${listedIds.size} listed NFTs for ${collectionSlug}`);
  return listedIds;
}

async function fetchPointsWithRetry(tokenId: string, nftType: NFTType, retries = 3): Promise<number> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = `${STAKING_API_BASE}/seeds/points?id=${encodeURIComponent(tokenId)}&type=${encodeURIComponent(nftType)}`;
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        const points = data.points ?? 0;
        // If we got 0 points and have retries left, try again after a delay
        if (points === 0 && attempt < retries) {
          await new Promise(r => setTimeout(r, 100 * attempt));
          continue;
        }
        return points;
      } else {
        await res.text();
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 100 * attempt));
          continue;
        }
      }
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 100 * attempt));
        continue;
      }
    }
  }
  return 0;
}

async function fetchPointsChunk(
  tokenIds: string[], 
  nftType: NFTType, 
  startIdx: number,
  maxToProcess: number
): Promise<{ pointsById: Record<string, number>; processed: number; hasMore: boolean }> {
  const pointsById: Record<string, number> = {};
  const endIdx = Math.min(startIdx + maxToProcess, tokenIds.length);
  const chunk = tokenIds.slice(startIdx, endIdx);
  
  const concurrency = 25;
  let successCount = 0;
  
  for (let i = 0; i < chunk.length; i += concurrency) {
    const batch = chunk.slice(i, i + concurrency);
    await Promise.all(batch.map(async (tokenId) => {
      const points = await fetchPointsWithRetry(tokenId, nftType, 3);
      pointsById[tokenId] = points;
      if (points > 0) successCount++;
    }));
    
    // Small delay between batches to avoid overwhelming the API
    if (i + concurrency < chunk.length) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  console.log(`[Refresh] ${nftType} chunk ${startIdx}-${endIdx}: ${successCount}/${chunk.length} with points`);
  
  return {
    pointsById,
    processed: endIdx,
    hasMore: endIdx < tokenIds.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const cacheKey = 'leaderboard_v1';

  // Parse request body for chunked processing
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine for initial request
  }

  const currentCollection = body.currentCollection ?? 0;
  const currentOffset = body.currentOffset ?? 0;
  const CHUNK_SIZE = 800; // Process 800 NFTs per call (~40 seconds)

  // Check if already running (with a 5-minute timeout guard)
  const { data: existingMeta } = await supabase
    .from('leaderboard_meta')
    .select('status, last_started_at')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  // Only check for conflicts on initial call
  if (currentCollection === 0 && currentOffset === 0) {
    if (existingMeta?.status === 'running') {
      const startedAt = existingMeta.last_started_at ? new Date(existingMeta.last_started_at).getTime() : 0;
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      
      if (startedAt > fiveMinutesAgo) {
        return new Response(JSON.stringify({ ok: false, error: 'Refresh already running' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('[Refresh] Previous run was stale, restarting...');
    }

    // Mark as running
    await supabase.from('leaderboard_meta').upsert({
      cache_key: cacheKey,
      status: 'running',
      last_started_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: 'cache_key' });
  }

  try {
    const collection = COLLECTIONS[currentCollection];
    
    if (!collection) {
      // All collections done!
      await supabase.from('leaderboard_meta').upsert({
        cache_key: cacheKey,
        status: 'idle',
        last_completed_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: 'cache_key' });

      console.log('[Refresh] All collections completed!');
      return new Response(JSON.stringify({ 
        ok: true, 
        completed: true,
        message: 'Refresh complete!'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { nftType, slug } = collection;
    console.log(`[Refresh] Processing ${nftType} (offset: ${currentOffset})...`);

    // On first chunk of collection, fetch NFT list and listings
    let nfts: NFTItem[] = [];
    let listedIds: Set<string> = new Set();

    if (currentOffset === 0) {
      nfts = await fetchAllNFTs(slug);
      listedIds = await fetchListedTokenIds(slug);
      
      // Store NFT metadata first (without points)
      const batchSize = 200;
      for (let i = 0; i < nfts.length; i += batchSize) {
        const batch = nfts.slice(i, i + batchSize);
        const rows = batch.map((nft) => ({
          collection_slug: slug,
          nft_type: nftType,
          token_id: nft.identifier,
          image_url: nft.image_url,
          opensea_url: nft.opensea_url,
          is_listed: listedIds.has(nft.identifier),
        }));

        await supabase.from('leaderboard_entries').upsert(rows, {
          onConflict: 'collection_slug,token_id',
          ignoreDuplicates: false,
        });
      }
      console.log(`[Refresh] Stored ${nfts.length} ${nftType} NFT metadata`);
    }

    // Get ALL token IDs for this collection from DB (paginate to avoid 1000-row limit)
    const tokenIds: string[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: entriesPage, error: entriesError } = await supabase
        .from('leaderboard_entries')
        .select('token_id')
        .eq('nft_type', nftType)
        .order('token_id')
        .range(from, from + pageSize - 1);

      if (entriesError) {
        console.error('[Refresh] Failed to load token_ids:', entriesError);
        throw entriesError;
      }

      if (!entriesPage || entriesPage.length === 0) break;
      tokenIds.push(...entriesPage.map((e: any) => e.token_id));
      if (entriesPage.length < pageSize) break;
      from += pageSize;
    }
    
    if (tokenIds.length === 0) {
      // No tokens, move to next collection
      return new Response(JSON.stringify({ 
        ok: true, 
        completed: false,
        nextCollection: currentCollection + 1,
        nextOffset: 0,
        message: `No ${nftType} tokens found, moving to next collection`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch points for this chunk
    const { pointsById, processed, hasMore } = await fetchPointsChunk(
      tokenIds, 
      nftType, 
      currentOffset, 
      CHUNK_SIZE
    );

    // Update points in DB
    const updates = Object.entries(pointsById).map(([token_id, points]) => ({
      collection_slug: slug,
      token_id,
      points,
      nft_type: nftType,
    }));

    if (updates.length > 0) {
      const { error } = await supabase.from('leaderboard_entries').upsert(updates, {
        onConflict: 'collection_slug,token_id',
      });
      if (error) console.error('[Refresh] Update error:', error);
    }

    console.log(`[Refresh] Updated ${updates.length} ${nftType} entries with points`);

    // Calculate total processed across all collections
    // Ancient: 777, Mythic: 5555
    const ancientTotal = 777;
    const mythicTotal = 5555;
    let processedTotal = 0;
    
    if (currentCollection === 0) {
      // Processing Ancient
      processedTotal = processed;
    } else if (currentCollection === 1) {
      // Processing Mythic
      processedTotal = ancientTotal + processed;
    } else {
      // All done
      processedTotal = ancientTotal + mythicTotal;
    }

    if (hasMore) {
      // More to process in this collection
      return new Response(JSON.stringify({ 
        ok: true, 
        completed: false,
        nextCollection: currentCollection,
        nextOffset: processed,
        processedTotal,
        progress: `${nftType}: ${processed}/${tokenIds.length}`,
        message: `Processing ${nftType}... ${processed}/${tokenIds.length}`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Move to next collection
      console.log(`[Refresh] ${nftType} complete!`);
      processedTotal = currentCollection === 0 ? ancientTotal : ancientTotal + mythicTotal;
      
      return new Response(JSON.stringify({ 
        ok: true, 
        completed: false,
        nextCollection: currentCollection + 1,
        nextOffset: 0,
        processedTotal,
        message: `${nftType} complete! Moving to next...`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[Refresh] Error:', error);

    await supabase.from('leaderboard_meta').upsert({
      cache_key: cacheKey,
      status: 'error',
      last_error: error instanceof Error ? error.message : 'Unknown error',
    }, { onConflict: 'cache_key' });

    return new Response(JSON.stringify({ ok: false, error: 'Refresh failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
