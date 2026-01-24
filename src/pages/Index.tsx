import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FilterControls } from '@/components/FilterControls';
import { NFTGrid } from '@/components/NFTGrid';
import { PageLayout } from '@/components/Layout';
import {
  NFTType,
  SortType,
  NFTWithMetadata,
  fetchNFTListings,
  fetchStakingPoints,
  sortListings,
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

  const loadNFTs = async () => {
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
      toast.success('NFTs loaded successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load NFTs';
      setError(errorMessage);
      toast.error('Error loading NFTs', { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

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
      {/* Filter Controls Card */}
      <div className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-4 md:p-6 mb-6 animate-slide-up stagger-1">
        <FilterControls
          nftType={nftType}
          sortType={sortType}
          hideZeroPoints={hideZeroPoints}
          onNFTTypeChange={setNftType}
          onSortTypeChange={setSortType}
          onToggleZeroPoints={() => setHideZeroPoints(!hideZeroPoints)}
          onLoadNFTs={loadNFTs}
          loading={loading}
        />
      </div>

      {/* NFT Grid */}
      <div className="animate-slide-up stagger-2">
        <NFTGrid 
          listings={displayListings} 
          loading={loading} 
          error={error} 
        />
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
