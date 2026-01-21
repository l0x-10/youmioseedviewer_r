import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Search, ArrowLeft, ExternalLink, Tag, Loader2, Crown, Medal, Award, RefreshCw, ChevronLeft, ChevronRight, Filter, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { NFTType } from '@/utils/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LeaderboardNFT {
  tokenId: string;
  nftType: NFTType;
  points: number;
  imageUrl: string | null;
  openseaUrl: string | null;
  isListed: boolean;
}

interface CacheMeta {
  status: string;
  lastCompletedAt: string | null;
}

type ListedFilter = 'all' | 'listed' | 'not-listed';
type TypeFilter = 'all' | 'Mythic' | 'Ancient';
type RankMode = 'global' | 'filtered';

const ITEMS_PER_PAGE = 10;

export default function Leaderboard() {
  const [allNFTs, setAllNFTs] = useState<LeaderboardNFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cacheMeta, setCacheMeta] = useState<CacheMeta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [listedFilter, setListedFilter] = useState<ListedFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [rankMode, setRankMode] = useState<RankMode>('global');
  const [refreshProgressPercent, setRefreshProgressPercent] = useState(0);

  // Calculate totals
  const totalPoints = useMemo(() => allNFTs.reduce((sum, nft) => sum + nft.points, 0), [allNFTs]);
  const mythicPoints = useMemo(() => allNFTs.filter(n => n.nftType === 'Mythic').reduce((sum, nft) => sum + nft.points, 0), [allNFTs]);
  const ancientPoints = useMemo(() => allNFTs.filter(n => n.nftType === 'Ancient').reduce((sum, nft) => sum + nft.points, 0), [allNFTs]);

  // Filter by type, listed status and search
  const filteredNFTs = useMemo(() => {
    let result = allNFTs;
    
    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter(nft => nft.nftType === typeFilter);
    }
    
    // Filter by listed status
    if (listedFilter === 'listed') {
      result = result.filter(nft => nft.isListed);
    } else if (listedFilter === 'not-listed') {
      result = result.filter(nft => !nft.isListed);
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      result = result.filter(nft => nft.tokenId.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    return result;
  }, [allNFTs, searchQuery, listedFilter, typeFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredNFTs.length / ITEMS_PER_PAGE);
  const paginatedNFTs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNFTs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredNFTs, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, listedFilter, typeFilter]);

  // Find searched NFT position
  const searchedNFTPosition = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const exactMatch = allNFTs.findIndex(nft => nft.tokenId === searchQuery.trim());
    return exactMatch !== -1 ? exactMatch + 1 : null;
  }, [allNFTs, searchQuery]);

  const loadFromCache = async () => {
    setLoading(true);
    try {
      // Fetch ALL cached leaderboard entries (paginate to avoid 1000 row limit)
      let allEntries: any[] = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data: entries, error } = await supabase
          .from('leaderboard_entries')
          .select('*')
          .order('points', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!entries || entries.length === 0) break;
        
        allEntries = [...allEntries, ...entries];
        if (entries.length < pageSize) break;
        from += pageSize;
      }

      const nfts: LeaderboardNFT[] = allEntries.map((e: any) => ({
        tokenId: e.token_id,
        nftType: e.nft_type as NFTType,
        points: Number(e.points),
        imageUrl: e.image_url,
        openseaUrl: e.opensea_url,
        isListed: e.is_listed,
      }));

      setAllNFTs(nfts);

      // Fetch cache meta
      const { data: meta } = await supabase
        .from('leaderboard_meta')
        .select('*')
        .eq('cache_key', 'leaderboard_v1')
        .maybeSingle();

      if (meta) {
        setCacheMeta({
          status: meta.status,
          lastCompletedAt: meta.last_completed_at,
        });
      }

      if (nfts.length === 0) {
        toast.info('No cached data yet. Click refresh to load leaderboard.');
      }
    } catch (err) {
      console.error('Error loading from cache:', err);
      toast.error('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
   };

  const [refreshProgress, setRefreshProgress] = useState<string>('');

  const triggerRefresh = async () => {
    setRefreshing(true);
    setRefreshProgress('Starting...');
    setRefreshProgressPercent(0);
    toast.info('Starting refresh... This may take a few minutes.');

    let currentCollection = 0;
    let currentOffset = 0;
    const maxIterations = 50; // Safety limit
    let iterations = 0;
    
    // Total NFTs: 777 Ancient + 5555 Mythic = 6332
    const totalNFTs = 6332;

    try {
      while (iterations < maxIterations) {
        iterations++;
        
        const { data, error } = await supabase.functions.invoke('leaderboard-refresh', {
          body: { currentCollection, currentOffset },
        });

        // Handle 409 conflict (already running)
        const status = (error as any)?.context?.status ?? (error as any)?.status;
        if (error && status === 409) {
          toast.info('Refresh is already running. Please wait...');
          // Poll until complete
          await new Promise(r => setTimeout(r, 3000));
          const { data: meta } = await supabase
            .from('leaderboard_meta')
            .select('status')
            .eq('cache_key', 'leaderboard_v1')
            .maybeSingle();
          
          if (meta?.status === 'idle') {
            toast.success('Leaderboard refreshed!');
            setRefreshProgressPercent(100);
            await loadFromCache();
            return;
          }
          continue;
        }

        if (error) throw error;

        // Update progress message and percentage
        if (data?.message) {
          setRefreshProgress(data.message);
        }
        
        // Calculate progress based on current position
        if (data?.processedTotal !== undefined) {
          const percent = Math.round((data.processedTotal / totalNFTs) * 100);
          setRefreshProgressPercent(Math.min(percent, 99));
        }

        // Check if completed
        if (data?.completed) {
          setRefreshProgressPercent(100);
          toast.success('Leaderboard refreshed successfully!');
          await loadFromCache();
          return;
        }

        // Move to next chunk
        if (data?.nextCollection !== undefined) {
          currentCollection = data.nextCollection;
          currentOffset = data.nextOffset ?? 0;
        } else {
          // No next chunk info, something went wrong
          throw new Error('Invalid response from refresh function');
        }

        // Small delay between chunks
        await new Promise(r => setTimeout(r, 500));
      }

      toast.warning('Refresh took too long. Please try again.');
    } catch (err) {
      console.error('Refresh error:', err);
      toast.error('Refresh failed. Try again later.');
    } finally {
      setRefreshing(false);
      setRefreshProgress('');
      setRefreshProgressPercent(0);
    }
  };

  useEffect(() => {
    loadFromCache();
  }, []);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 text-center font-mono text-muted-foreground">#{rank}</span>;
  };

  const formatLastUpdated = () => {
    if (!cacheMeta?.lastCompletedAt) return 'Never';
    const date = new Date(cacheMeta.lastCompletedAt);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="bg-card rounded-xl shadow-card p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Viewer
                </Button>
              </Link>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-3">
              {refreshing && (
                <div className="flex items-center gap-2 min-w-[200px]">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${refreshProgressPercent}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-primary min-w-[40px]">
                    {refreshProgressPercent}%
                  </span>
                </div>
              )}
              {refreshProgress && !refreshing && (
                <span className="text-xs text-primary font-medium animate-pulse">
                  {refreshProgress}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Updated: {formatLastUpdated()}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="p-1 rounded-full hover:bg-muted/50 transition-colors">
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px] text-center">
                    <p className="text-sm">
                      Points are fetched from an external API. You may need to refresh 2-3 times to get the most accurate data.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mb-6">
            <Trophy className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Seed Leaderboard</h1>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Points</p>
              <p className="text-2xl font-bold text-primary">{totalPoints.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{allNFTs.length} seeds</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Mythic Points</p>
              <p className="text-2xl font-bold text-purple-500">{mythicPoints.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{allNFTs.filter(n => n.nftType === 'Mythic').length} seeds</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500/20 to-amber-500/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Ancient Points</p>
              <p className="text-2xl font-bold text-amber-500">{ancientPoints.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{allNFTs.filter(n => n.nftType === 'Ancient').length} seeds</p>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col gap-3 max-w-3xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by Seed ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchedNFTPosition && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Badge variant="secondary" className="text-xs">Rank #{searchedNFTPosition}</Badge>
                </div>
              )}
            </div>
            
            {/* Filter Controls */}
            <div className="flex flex-wrap gap-3 justify-center">
              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Mythic">Mythic</SelectItem>
                  <SelectItem value="Ancient">Ancient</SelectItem>
                </SelectContent>
              </Select>
              
              {/* State Filter */}
              <Select value={listedFilter} onValueChange={(v) => setListedFilter(v as ListedFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  <SelectItem value="listed">Listed</SelectItem>
                  <SelectItem value="not-listed">Not Listed</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Rank Mode */}
              <Select value={rankMode} onValueChange={(v) => setRankMode(v as RankMode)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Rank Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global Rank</SelectItem>
                  <SelectItem value="filtered">Filtered Rank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Active Filters Summary */}
            {(typeFilter !== 'all' || listedFilter !== 'all') && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">Showing:</span>
                {typeFilter !== 'all' && (
                  <Badge variant="secondary" className={typeFilter === 'Mythic' ? 'bg-purple-500/20 text-purple-600' : 'bg-amber-500/20 text-amber-600'}>
                    {typeFilter}
                  </Badge>
                )}
                {listedFilter !== 'all' && (
                  <Badge variant="outline">
                    {listedFilter === 'listed' ? 'Listed' : 'Not Listed'}
                  </Badge>
                )}
                <span className="text-muted-foreground">({filteredNFTs.length} seeds)</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setTypeFilter('all'); setListedFilter('all'); }}
                  className="text-xs h-6 px-2"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="bg-card rounded-xl shadow-card p-12 text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Loading leaderboard...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && allNFTs.length === 0 && (
          <div className="bg-card rounded-xl shadow-card p-12 text-center">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground mb-4">No leaderboard data yet</p>
            <Button onClick={triggerRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Loading data...' : 'Load Leaderboard'}
            </Button>
          </div>
        )}

        {/* Leaderboard Table */}
        {!loading && filteredNFTs.length > 0 && (
          <div className="bg-card rounded-xl shadow-card overflow-hidden">
            {/* Results info */}
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredNFTs.length)} of {filteredNFTs.length} seeds
              </span>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Rank</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Seed</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Type</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Points</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedNFTs.map((nft, index) => {
                    const globalRank = allNFTs.findIndex(n => n.tokenId === nft.tokenId && n.nftType === nft.nftType) + 1;
                    const filteredRank = filteredNFTs.findIndex(n => n.tokenId === nft.tokenId && n.nftType === nft.nftType) + 1;
                    const displayRank = rankMode === 'global' ? globalRank : filteredRank;
                    const isHighlighted = searchQuery.trim() && nft.tokenId.includes(searchQuery.trim());

                    return (
                      <tr
                        key={`${nft.nftType}-${nft.tokenId}`}
                        className={`transition-colors hover:bg-muted/30 ${isHighlighted ? 'bg-primary/10' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">{getRankIcon(displayRank)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {nft.imageUrl ? (
                              <img src={nft.imageUrl} alt={`Seed #${nft.tokenId}`} className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">#{nft.tokenId}</span>
                              </div>
                            )}
                            <span className="font-medium">#{nft.tokenId}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="secondary"
                            className={nft.nftType === 'Mythic' ? 'bg-purple-500/20 text-purple-600' : 'bg-amber-500/20 text-amber-600'}
                          >
                            {nft.nftType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-primary">{nft.points.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {nft.isListed ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                              <Tag className="w-3 h-3 mr-1" />
                              Listed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">Not Listed</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {nft.openseaUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(nft.openseaUrl!, '_blank')}
                              title="View on OpenSea"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 bg-muted/30 border-t border-border flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                {/* Page numbers */}
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-8"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </Button>
              </div>
            )}
          </div>
        )}

        {/* No search results */}
        {!loading && filteredNFTs.length === 0 && allNFTs.length > 0 && (
          <div className="bg-card rounded-xl shadow-card p-12 text-center">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">No seeds found matching "{searchQuery}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
