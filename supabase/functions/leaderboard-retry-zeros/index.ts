import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAKING_API_BASE = 'https://staking.youmio.ai/api';

type NFTType = 'Ancient' | 'Mythic';

interface ZeroPointEntry {
  token_id: string;
  nft_type: NFTType;
  collection_slug: string;
}

async function fetchPointsWithRetry(tokenId: string, nftType: NFTType, retries = 5): Promise<number> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = `${STAKING_API_BASE}/seeds/points?id=${encodeURIComponent(tokenId)}&type=${encodeURIComponent(nftType)}`;
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        const points = data.points ?? data.totalPoints ?? data.stakingPoints ?? 0;
        
        // If we got valid points (> 0), return immediately
        if (points > 0) {
          return points;
        }
        
        // If still 0 and have retries left, wait with exponential backoff
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 200 * attempt));
          continue;
        }
      } else {
        await res.text(); // Consume body
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 200 * attempt));
          continue;
        }
      }
    } catch (err) {
      console.error(`[RetryZeros] Error fetching ${tokenId}:`, err);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 200 * attempt));
        continue;
      }
    }
  }
  return 0;
}

async function processChunk(
  entries: ZeroPointEntry[],
  supabase: any
): Promise<{ updated: number; stillZero: number }> {
  const concurrency = 15; // Lower concurrency for more reliable results
  let updated = 0;
  let stillZero = 0;
  
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    
    const results = await Promise.all(batch.map(async (entry) => {
      const points = await fetchPointsWithRetry(entry.token_id, entry.nft_type, 5);
      return { ...entry, points };
    }));
    
    // Update entries that got valid points
    for (const result of results) {
      if (result.points > 0) {
        const { error } = await supabase
          .from('leaderboard_entries')
          .update({ points: result.points, updated_at: new Date().toISOString() })
          .eq('collection_slug', result.collection_slug)
          .eq('token_id', result.token_id);
        
        if (!error) {
          updated++;
        }
      } else {
        stillZero++;
      }
    }
    
    // Small delay between batches
    if (i + concurrency < entries.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return { updated, stillZero };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Parse request body for chunked processing
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine for initial request
  }

  const currentOffset = body.currentOffset ?? 0;
  const CHUNK_SIZE = 200; // Process 200 zero-point entries per call

  try {
    // Count total zeros
    const { count: totalZeros } = await supabase
      .from('leaderboard_entries')
      .select('*', { count: 'exact', head: true })
      .eq('points', 0);

    if (totalZeros === 0 || totalZeros === null) {
      console.log('[RetryZeros] No zero-point entries found!');
      return new Response(JSON.stringify({
        ok: true,
        completed: true,
        message: 'All entries have points!',
        totalZeros: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[RetryZeros] Found ${totalZeros} entries with 0 points. Processing offset ${currentOffset}...`);

    // Fetch chunk of zero-point entries (prioritize Ancient first)
    const { data: zeroEntries, error } = await supabase
      .from('leaderboard_entries')
      .select('token_id, nft_type, collection_slug')
      .eq('points', 0)
      .order('nft_type', { ascending: true }) // Ancient before Mythic
      .order('token_id', { ascending: true })
      .range(0, CHUNK_SIZE - 1); // Always get from start since we're updating

    if (error) throw error;

    if (!zeroEntries || zeroEntries.length === 0) {
      console.log('[RetryZeros] No more zero-point entries to process!');
      return new Response(JSON.stringify({
        ok: true,
        completed: true,
        message: 'All entries processed!',
        totalZeros: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[RetryZeros] Processing ${zeroEntries.length} entries...`);

    // Process the chunk
    const { updated, stillZero } = await processChunk(zeroEntries as ZeroPointEntry[], supabase);

    console.log(`[RetryZeros] Updated ${updated} entries, ${stillZero} still at 0`);

    // Check remaining zeros
    const { count: remainingZeros } = await supabase
      .from('leaderboard_entries')
      .select('*', { count: 'exact', head: true })
      .eq('points', 0);

    const hasMore = (remainingZeros ?? 0) > 0;
    const progress = Math.round(((totalZeros - (remainingZeros ?? 0)) / totalZeros) * 100);

    return new Response(JSON.stringify({
      ok: true,
      completed: !hasMore,
      updatedThisChunk: updated,
      stillZeroThisChunk: stillZero,
      remainingZeros: remainingZeros ?? 0,
      totalZeros,
      progress,
      message: hasMore 
        ? `Fixed ${updated} entries. ${remainingZeros} remaining...`
        : 'All entries have points!',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RetryZeros] Error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
