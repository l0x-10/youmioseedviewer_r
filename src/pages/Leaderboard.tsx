import { useState, useEffect, useMemo } from 'react';
import { Trophy, Search, ExternalLink, Tag, Loader2, Crown, Medal, Award, RefreshCw, ChevronLeft, ChevronRight, Info } from 'lucide-react';
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
import { PageLayout } from '@/components/Layout';
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
  const [zeroPointsCount, setZeroPointsCount] = useState<number>(0);
  const [refreshProgress, setRefreshProgress] = useState<string>('');

  // Calculate totals
  const totalPoints = useMemo(() => allNFTs.reduce((sum, nft) => sum + nft.points, 0), [allNFTs]);
  const mythicPoints = useMemo(() => allNFTs.filter(n => n.nftType === 'Mythic').reduce((sum, nft) => sum + nft.points, 0), [allNFTs]);
  const ancientPoints = useMemo(() => allNFTs.filter(n => n.nftType === 'Ancient').reduce((sum, nft) => sum + nft.points, 0), [allNFTs]);

  // Filter by type, listed status and search
  const filteredNFTs = useMemo(() => {
    let result = allNFTs;
    
    if (typeFilter !== 'all') {
      result = result.filter(nft => nft.nftType === typeFilter);
    }
    
    if (listedFilter === 'listed') {
      result = result.filter(nft => nft.isListed);
    } else if (listedFilter === 'not-listed') {
      result = result.filter(nft => !nft.isListed);
    }
    
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, listedFilter, typeFilter]);

  const searchedNFTPosition = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const exactMatch = allNFTs.findIndex(nft => nft.tokenId === searchQuery.trim());
    return exactMatch !== -1 ? exactMatch + 1 : null;
  }, [allNFTs, searchQuery]);

  const loadFromCache = async (): Promise<{ zeros: number; total: number }> => {
    setLoading(true);
    try {
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
      
      const zeros = nfts.filter(n => n.points === 0).length;
      setZeroPointsCount(zeros);

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

      return { zeros, total: nfts.length };
    } catch (err) {
      console.error('Error loading from cache:', err);
      toast.error('Failed to load leaderboard');
      return { zeros: 0, total: 0 };
    } finally {
      setLoading(false);
    }
  };

  const getDataStatus = () => {
    if (refreshing) return { label: 'Updating…', variant: 'secondary' as const };
    if (cacheMeta?.status === 'running') return { label: 'Update running…', variant: 'secondary' as const };
    if (cacheMeta?.status === 'error') return { label: 'Update error', variant: 'destructive' as const };
    if (zeroPointsCount > 0) return { label: `Missing: ${zeroPointsCount}`, variant: 'outline' as const };
    return { label: 'All loaded', variant: 'secondary' as const };
  };

  const runZeroRepair = async () => {
    const maxIterations = 12;
    let iterations = 0;
    let lastRemaining: number | null = null;
    let noProgressStreak = 0;

    while (iterations < maxIterations) {
      iterations++;

      const { data, error } = await supabase.functions.invoke('leaderboard-retry-zeros', {
        body: {},
      });

      if (error) throw error;

      const remaining = typeof data?.remainingZeros === 'number' ? data.remainingZeros : null;
      const message = data?.message || 'Fixing missing points…';
      setRefreshProgress(message);

      if (data?.completed) return { completed: true as const, remaining: remaining ?? 0 };

      if (remaining !== null) {
        if (lastRemaining !== null && remaining >= lastRemaining) {
          noProgressStreak++;
        } else {
          noProgressStreak = 0;
        }
        lastRemaining = remaining;

        if (noProgressStreak >= 2) {
          return { completed: false as const, remaining };
        }
      }

      await new Promise(r => setTimeout(r, 600));
    }

    return { completed: false as const, remaining: lastRemaining ?? 0 };
  };

  const triggerRefresh = async () => {
    setRefreshing(true);
    setRefreshProgress('Starting...');
    setRefreshProgressPercent(0);
    toast.info('Updating leaderboard...');

    let currentCollection = 0;
    let currentOffset = 0;
    const maxIterations = 50;
    let iterations = 0;
    const totalNFTs = 6332;

    try {
      while (iterations < maxIterations) {
        iterations++;
        
        const { data, error } = await supabase.functions.invoke('leaderboard-refresh', {
          body: { currentCollection, currentOffset },
        });

        const status = (error as any)?.context?.status ?? (error as any)?.status;
        if (error && status === 409) {
          toast.info('Refresh is already running. Please wait...');
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

        if (data?.message) {
          setRefreshProgress(data.message);
        }
        
        if (data?.processedTotal !== undefined) {
          const percent = Math.round((data.processedTotal / totalNFTs) * 100);
          setRefreshProgressPercent(Math.min(percent, 99));
        }

        if (data?.completed) {
          setRefreshProgressPercent(100);
          setRefreshProgress('Checking missing points…');
          const { zeros } = await loadFromCache();

          if (zeros > 0) {
            const result = await runZeroRepair();
            await loadFromCache();

            if (result.completed) {
              toast.success('Leaderboard updated!');
            } else {
              toast.warning(`Updated, but ${result.remaining} seeds show 0 points.`);
            }
          } else {
            toast.success('Leaderboard updated.');
          }

          return;
        }

        if (data?.nextCollection !== undefined) {
          currentCollection = data.nextCollection;
          currentOffset = data.nextOffset ?? 0;
        } else {
          throw new Error('Invalid response from refresh function');
        }

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
    return <span className="w-5 text-center font-mono text-muted-foreground text-sm">#{rank}</span>;
  };

  const formatLastUpdated = () => {
    if (!cacheMeta?.lastCompletedAt) return 'Never';
    const date = new Date(cacheMeta.lastCompletedAt);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <PageLayout>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 animate-slide-up stagger-1">
        <div className="bg-card/80 backdrop-blur-md rounded-xl p-4 md:p-5 text-center hover-lift border border-primary/20">
          <p className="text-xs md:text-sm text-muted-foreground mb-1">Total Points</p>
          <p className="text-xl md:text-2xl lg:text-3xl font-bold text-primary">{totalPoints.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{allNFTs.length} seeds</p>
        </div>
        <div className="bg-card/80 backdrop-blur-md rounded-xl p-4 md:p-5 text-center hover-lift border border-purple-500/20">
          <p className="text-xs md:text-sm text-muted-foreground mb-1">Mythic Points</p>
          <p className="text-xl md:text-2xl lg:text-3xl font-bold text-purple-500">{mythicPoints.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{allNFTs.filter(n => n.nftType === 'Mythic').length} seeds</p>
        </div>
        <div className="bg-card/80 backdrop-blur-md rounded-xl p-4 md:p-5 text-center hover-lift border border-amber-500/20">
          <p className="text-xs md:text-sm text-muted-foreground mb-1">Ancient Points</p>
          <p className="text-xl md:text-2xl lg:text-3xl font-bold text-amber-500">{ancientPoints.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{allNFTs.filter(n => n.nftType === 'Ancient').length} seeds</p>
        </div>
      </div>

      {/* Controls Card */}
      <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-4 md:p-6 mb-6 animate-slide-up stagger-2">
        {/* Refresh Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getDataStatus().variant} className="text-xs">
              {getDataStatus().label}
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated: {formatLastUpdated()}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-1 rounded-full hover:bg-muted/50 transition-colors">
                    <Info className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[250px] text-center">
                  <p className="text-xs">Refresh updates the leaderboard and fixes missing points.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="flex items-center gap-2">
            {refreshing && (
              <div className="flex items-center gap-2 min-w-[120px] md:min-w-[180px]">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${refreshProgressPercent}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-primary min-w-[35px]">
                  {refreshProgressPercent}%
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={triggerRefresh}
              disabled={refreshing}
              className="hover:scale-105 transition-transform"
            >
              <RefreshCw className={`w-4 h-4 mr-1 md:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative">
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
          
          <div className="flex flex-wrap gap-2 justify-center">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-[110px] md:w-[130px] text-xs md:text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Mythic">Mythic</SelectItem>
                <SelectItem value="Ancient">Ancient</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={listedFilter} onValueChange={(v) => setListedFilter(v as ListedFilter)}>
              <SelectTrigger className="w-[110px] md:w-[130px] text-xs md:text-sm">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="listed">Listed</SelectItem>
                <SelectItem value="not-listed">Not Listed</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={rankMode} onValueChange={(v) => setRankMode(v as RankMode)}>
              <SelectTrigger className="w-[120px] md:w-[140px] text-xs md:text-sm">
                <SelectValue placeholder="Rank Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global Rank</SelectItem>
                <SelectItem value="filtered">Filtered Rank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {(typeFilter !== 'all' || listedFilter !== 'all') && (
            <div className="flex items-center justify-center gap-2 text-xs md:text-sm flex-wrap">
              <span className="text-muted-foreground">Showing:</span>
              {typeFilter !== 'all' && (
                <Badge variant="secondary" className={`text-xs ${typeFilter === 'Mythic' ? 'bg-purple-500/20 text-purple-600' : 'bg-amber-500/20 text-amber-600'}`}>
                  {typeFilter}
                </Badge>
              )}
              {listedFilter !== 'all' && (
                <Badge variant="outline" className="text-xs">
                  {listedFilter === 'listed' ? 'Listed' : 'Not Listed'}
                </Badge>
              )}
              <span className="text-muted-foreground">({filteredNFTs.length})</span>
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
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-8 md:p-12 text-center animate-fade-in">
          <Loader2 className="w-10 h-10 md:w-12 md:h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-base md:text-lg text-muted-foreground">Loading leaderboard...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && allNFTs.length === 0 && (
        <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-8 md:p-12 text-center animate-fade-in">
          <Trophy className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-base md:text-lg text-muted-foreground mb-4">No leaderboard data yet</p>
          <Button onClick={triggerRefresh} disabled={refreshing} className="hover:scale-105 transition-transform">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Loading data...' : 'Load Leaderboard'}
          </Button>
        </div>
      )}

      {/* Leaderboard Table */}
      {!loading && filteredNFTs.length > 0 && (
        <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card overflow-hidden animate-slide-up stagger-3">
          <div className="px-3 md:px-4 py-2 md:py-3 bg-muted/30 border-b border-border flex items-center justify-between text-xs md:text-sm">
            <span className="text-muted-foreground">
              {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredNFTs.length)} of {filteredNFTs.length}
            </span>
            <span className="text-muted-foreground">
              Page {currentPage}/{totalPages}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-foreground">Rank</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-foreground">Seed</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-foreground hidden sm:table-cell">Type</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-right text-xs md:text-sm font-semibold text-foreground">Points</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm font-semibold text-foreground hidden md:table-cell">Status</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm font-semibold text-foreground">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedNFTs.map((nft) => {
                  const globalRank = allNFTs.findIndex(n => n.tokenId === nft.tokenId && n.nftType === nft.nftType) + 1;
                  const filteredRank = filteredNFTs.findIndex(n => n.tokenId === nft.tokenId && n.nftType === nft.nftType) + 1;
                  const displayRank = rankMode === 'global' ? globalRank : filteredRank;
                  const isHighlighted = searchQuery.trim() && nft.tokenId.includes(searchQuery.trim());

                  return (
                    <tr
                      key={`${nft.nftType}-${nft.tokenId}`}
                      className={`transition-colors hover:bg-muted/30 ${isHighlighted ? 'bg-primary/10' : ''}`}
                    >
                      <td className="px-2 md:px-4 py-2 md:py-3">
                        <div className="flex items-center gap-1">{getRankIcon(displayRank)}</div>
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3">
                        <div className="flex items-center gap-2">
                          {nft.imageUrl ? (
                            <img src={nft.imageUrl} alt={`Seed #${nft.tokenId}`} className="w-8 h-8 md:w-10 md:h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-muted flex items-center justify-center">
                              <span className="text-[10px] md:text-xs text-muted-foreground">#{nft.tokenId}</span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-medium text-xs md:text-sm">#{nft.tokenId}</span>
                            <Badge
                              variant="secondary"
                              className={`sm:hidden text-[10px] w-fit ${nft.nftType === 'Mythic' ? 'bg-purple-500/20 text-purple-600' : 'bg-amber-500/20 text-amber-600'}`}
                            >
                              {nft.nftType}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 hidden sm:table-cell">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${nft.nftType === 'Mythic' ? 'bg-purple-500/20 text-purple-600' : 'bg-amber-500/20 text-amber-600'}`}
                        >
                          {nft.nftType}
                        </Badge>
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-right">
                        <span className="font-bold text-primary text-xs md:text-sm">{nft.points.toLocaleString()}</span>
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-center hidden md:table-cell">
                        {nft.isListed ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            Listed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">Not Listed</Badge>
                        )}
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-center">
                        {nft.openseaUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(nft.openseaUrl!, '_blank')}
                            title="View on OpenSea"
                            className="h-8 w-8 p-0"
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
            <div className="px-3 md:px-4 py-2 md:py-3 bg-muted/30 border-t border-border flex items-center justify-center gap-1 md:gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 px-2 md:px-3 text-xs"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
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
                      className="h-8 w-8 p-0 text-xs"
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
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 px-2 md:px-3 text-xs"
              >
                Last
              </Button>
            </div>
          )}
        </div>
      )}

      {/* No search results */}
      {!loading && filteredNFTs.length === 0 && allNFTs.length > 0 && (
        <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-8 md:p-12 text-center animate-fade-in">
          <Search className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-base md:text-lg text-muted-foreground">No seeds found matching "{searchQuery}"</p>
        </div>
      )}
    </PageLayout>
  );
}
