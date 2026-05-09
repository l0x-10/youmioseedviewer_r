import { useState, useEffect } from 'react';
import { ArrowUp, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FilterControls } from '@/components/FilterControls';
import { NFTGrid } from '@/components/NFTGrid';
import { SalesHistory } from '@/components/SalesHistory';
import { AdBanner } from '@/components/AdBanner';
import { PageLayout } from '@/components/Layout';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useEthPrice } from '@/hooks/useEthPrice';
import {
  NFTType,
  SortType,
  NFTWithMetadata,
  fetchNFTListings,
  fetchStakingPoints,
  sortListings,
  setEthPriceUSD,
} from '@/utils/api';

export default function Index() {
  const [nftType, setNftType] = useState<NFTType>('Mythic');
  const [sortType, setSortType] = useState<SortType>('lowestprice');
  const [hideZeroPoints, setHideZeroPoints] = useState(false);
  const [listings, setListings] = useState<NFTWithMetadata[]>([]);
  const [displayListings, setDisplayListings] = useState<NFTWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { ethPrice } = useEthPrice();

  // Update global ETH price when it changes
  useEffect(() => {
    setEthPriceUSD(ethPrice);
  }, [ethPrice]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadNFTs = async (silent = false) => {
    setLoading(true);
    setError(null);

    try {
      const fetchedListings = await fetchNFTListings(nftType);
      setListings(fetchedListings);

      await Promise.all(
        fetchedListings.map(async (listing) => {
          if (listing.tokenId) {
            const points = await fetchStakingPoints(listing.tokenId, nftType);
            listing.stakingPoints = points;
          }
        })
      );

      setListings([...fetchedListings]);
      if (!silent) toast.success('NFTs loaded successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load NFTs';
      setError(errorMessage);
      if (!silent) toast.error('Error loading NFTs', { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  // Auto-load NFTs when nftType changes
  useEffect(() => {
    loadNFTs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftType]);

  useEffect(() => {
    let filtered = [...listings];

    if (hideZeroPoints) {
      filtered = filtered.filter(listing => 
        listing.stakingPoints && listing.stakingPoints > 0
      );
    }

    filtered = sortListings(filtered, sortType);
    setDisplayListings(filtered);
  }, [listings, hideZeroPoints, sortType]);

  return (
    <PageLayout>
      {/* Centered mobile ad — only below xl */}
      <div className="xl:hidden flex justify-center mb-4 animate-fade-in">
        <AdBanner variant="mobile" />
      </div>

      {/* Filter Controls Card */}
      <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-4 md:p-6 mb-6 animate-slide-up stagger-1">
        <div className="flex flex-wrap gap-3 items-center justify-center">
          <FilterControls
            nftType={nftType}
            sortType={sortType}
            hideZeroPoints={hideZeroPoints}
            onNFTTypeChange={setNftType}
            onSortTypeChange={setSortType}
            onToggleZeroPoints={() => setHideZeroPoints(!hideZeroPoints)}
            onLoadNFTs={() => loadNFTs(false)}
            loading={loading}
          />
          <Sheet>
            <SheetTrigger asChild>
              <Button
                className="xl:hidden gap-2 gradient-primary shadow-md hover:scale-105 transition-transform border border-primary/40 font-semibold"
                title="Recent Sales"
              >
                <History className="w-4 h-4" />
                <span className="whitespace-nowrap">Recent Sales</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
              <div className="flex-1 min-h-0 p-3 pt-10">
                <SalesHistory nftType={nftType} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Layout: [left ad] [grid] [recent sales] [right ad] only on xl+ */}
      <div className="grid grid-cols-1 xl:grid-cols-[120px_1fr_300px_120px] gap-4 lg:gap-6 animate-slide-up stagger-2">
        <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
          <AdBanner variant="skyscraper" />
        </aside>

        <div className="min-w-0">
          <NFTGrid 
            listings={displayListings} 
            loading={loading} 
            error={error} 
          />
        </div>

        <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start xl:h-[calc(100vh-2rem)]">
          <SalesHistory nftType={nftType} />
        </aside>

        <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
          <AdBanner variant="skyscraper" />
        </aside>
      </div>

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-24 right-4 md:right-6 rounded-full w-10 h-10 md:w-12 md:h-12 p-0 shadow-lg gradient-primary z-50 hover:scale-110 transition-transform animate-scale-in"
          title="Scroll to top"
        >
          <ArrowUp className="w-4 h-4 md:w-5 md:h-5" />
        </Button>
      )}
    </PageLayout>
  );
}
