import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COLLECTION_SLUGS, NFTType, ETH_PRICE_USD, formatNumber } from '@/utils/api';
import { ExternalLink, RefreshCw, Calculator, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SaleEvent {
  tokenId: string;
  name: string;
  imageUrl: string;
  openseaUrl: string;
  priceEth: number;
  currency: string;
  timestamp: number;
  stakingPoints: number;
  transaction: string;
}

interface SalesHistoryProps {
  nftType: NFTType;
}

type TimeRange = '24h' | '7d' | '30d' | 'all';

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  all: Number.POSITIVE_INFINITY,
};

function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000) - ts;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

export function SalesHistory({ nftType }: SalesHistoryProps) {
  const [sales, setSales] = useState<SaleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [userPoints, setUserPoints] = useState<string>('');

  const loadSales = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('opensea-sales', {
        body: {
          collectionSlug: COLLECTION_SLUGS[nftType],
          nftType,
          limit: 50,
        },
      });
      if (fnError) throw fnError;
      setSales(data?.sales || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftType]);

  // Filter sales by time range
  const filteredSales = useMemo(() => {
    const cutoff = Math.floor(Date.now() / 1000) - TIME_RANGE_SECONDS[timeRange];
    return sales.filter((s) => s.timestamp >= cutoff);
  }, [sales, timeRange]);

  // Calculate suggested price based on user points
  const suggestion = useMemo(() => {
    const pts = parseFloat(userPoints);
    if (!pts || pts <= 0) return null;

    // Use sales with valid points to compute price-per-point ratios
    const valid = filteredSales.filter((s) => s.stakingPoints > 0 && s.priceEth > 0);
    if (valid.length === 0) return null;

    const ratios = valid.map((s) => s.priceEth / s.stakingPoints).sort((a, b) => a - b);
    // Median ratio = fair price; top quartile = best/optimistic price
    const median = ratios[Math.floor(ratios.length / 2)];
    const topQuartile = ratios[Math.floor(ratios.length * 0.75)];

    return {
      fairEth: median * pts,
      bestEth: topQuartile * pts,
      sampleSize: valid.length,
    };
  }, [userPoints, filteredSales]);

  return (
    <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base">Recent Sales</h3>
          <p className="text-xs text-muted-foreground">{nftType} Seeds</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={loadSales}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Pricing Calculator */}
      <div className="p-3 border-b border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Selling Price Calculator</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ml-auto inline-flex items-center justify-center rounded-full hover:bg-secondary p-0.5 transition-smooth"
                title="How does this work?"
              >
                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-xs">
              <div className="space-y-2">
                <h4 className="font-bold text-sm flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-primary" />
                  How it works
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  Enter your Seed's <span className="font-semibold text-foreground">staking points</span> and pick a time range.
                  We analyze recent sales to estimate what your Seed could realistically sell for.
                </p>
                <ul className="space-y-1 leading-relaxed">
                  <li>
                    <span className="font-semibold text-primary">Fair price</span>
                    <span className="text-muted-foreground"> — median ETH/point ratio. A balanced asking price.</span>
                  </li>
                  <li>
                    <span className="font-semibold text-accent-foreground">Best price</span>
                    <span className="text-muted-foreground"> — top 25% of recent sales. Optimistic but achievable.</span>
                  </li>
                </ul>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                  Tip: longer time ranges give more stable estimates.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="h-8 text-xs w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Your points"
            value={userPoints}
            onChange={(e) => setUserPoints(e.target.value)}
            className="h-8 text-xs flex-1"
            min="0"
          />
        </div>

        {suggestion && (
          <div className="rounded-md bg-card/60 p-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fair price:</span>
              <span className="font-bold text-primary">
                {suggestion.fairEth.toFixed(4)} ETH
                <span className="text-muted-foreground ml-1">
                  (${(suggestion.fairEth * ETH_PRICE_USD).toFixed(2)})
                </span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best price:</span>
              <span className="font-bold text-accent-foreground">
                {suggestion.bestEth.toFixed(4)} ETH
                <span className="text-muted-foreground ml-1">
                  (${(suggestion.bestEth * ETH_PRICE_USD).toFixed(2)})
                </span>
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground pt-0.5">
              Based on {suggestion.sampleSize} recent sales
            </div>
          </div>
        )}
        {!suggestion && userPoints && (
          <div className="text-[10px] text-muted-foreground">
            Not enough sales data in this period.
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 text-xs text-destructive bg-destructive/10">{error}</div>
      )}

      <ScrollArea className="flex-1 min-h-0" type="always">
        <div className="divide-y divide-border">
          {loading && filteredSales.length === 0 && (
            <div className="p-3 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredSales.length === 0 && !error && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No sales found in this period.
            </div>
          )}

          {filteredSales.map((sale, idx) => {
            const usd = sale.priceEth * ETH_PRICE_USD;
            return (
              <a
                key={`${sale.transaction}-${sale.tokenId}-${idx}`}
                href={sale.openseaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 hover:bg-secondary/50 transition-smooth group"
              >
                <img
                  src={sale.imageUrl}
                  alt={sale.name}
                  className="w-10 h-10 rounded object-cover bg-secondary flex-shrink-0"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">
                      #{sale.tokenId}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                      {timeAgo(sale.timestamp)}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-smooth" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-primary">
                        {sale.priceEth.toFixed(4)} {sale.currency}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ${usd.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-xs text-accent-foreground bg-accent/30 px-1.5 py-0.5 rounded">
                      {formatNumber(sale.stakingPoints)} pts
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
