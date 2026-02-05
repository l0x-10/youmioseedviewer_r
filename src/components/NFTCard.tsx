import { useState, useEffect } from 'react';
import { ExternalLink, TrendingUp, Star, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  NFTWithMetadata, 
  getNFTName, 
  formatPrice, 
  calculatePointsPerUSD,
  formatNumber,
  getPriceInUSD,
  getImageUrl,
  getOpenSeaUrl
} from '@/utils/api';

interface NFTCardProps {
  listing: NFTWithMetadata;
  isBestDeal?: boolean;
}

export function NFTCard({ listing, isBestDeal }: NFTCardProps) {
  const [imageUrl, setImageUrl] = useState<string>(
    listing.cachedImageUrl || ''
  );
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const name = getNFTName(listing);
  const price = formatPrice(listing);
  const priceUSD = getPriceInUSD(listing);
  const points = listing.stakingPoints;
  const pointsPerUSD = calculatePointsPerUSD(listing);
  const openSeaUrl = getOpenSeaUrl(listing);

  useEffect(() => {
    if (!listing.cachedImageUrl) {
      getImageUrl(listing).then(url => {
        setImageUrl(url);
        listing.cachedImageUrl = url;
      });
    }
  }, [listing]);

  const handleCardClick = () => {
    if (openSeaUrl) {
      window.open(openSeaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  // Fallback placeholder
  const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"%3E%3Crect fill="%23667eea" width="300" height="300"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="white" font-size="20" font-family="Arial" dy=".3em"%3E${encodeURIComponent(name)}%3C/text%3E%3C/svg%3E`;

  return (
    <Card 
      className={`overflow-hidden transition-smooth cursor-pointer hover:shadow-card-hover hover:-translate-y-2 ${
        isBestDeal ? 'ring-2 ring-accent shadow-glow' : ''
      }`}
      onClick={handleCardClick}
    >
      <div className="relative w-full h-64 overflow-hidden bg-secondary">
        {listing.nftType && (
          <Badge 
            className="absolute top-3 right-3 z-10 gradient-primary text-primary-foreground font-bold uppercase text-xs shadow-lg"
          >
            {listing.nftType}
          </Badge>
        )}
        {isBestDeal && (
          <Badge 
            className="absolute top-3 left-3 z-10 gradient-accent text-accent-foreground font-bold uppercase text-xs shadow-lg"
          >
            🏆 Best Deal
          </Badge>
        )}
        {(imageLoading || !imageUrl) && (
          <div className="absolute inset-0 bg-secondary animate-pulse flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        )}
        {imageError && (
          <div className="absolute inset-0 bg-secondary flex items-center justify-center">
            <span className="text-muted-foreground text-sm">{name}</span>
          </div>
        )}
        <img
          src={imageUrl || placeholderSvg}
          alt={name}
          className={`w-full h-full object-cover transition-smooth hover:scale-105 ${imageLoading || imageError ? 'opacity-0' : 'opacity-100'}`}
          loading="lazy"
          onLoad={handleImageLoad}
          onError={handleImageError}
          crossOrigin="anonymous"
        />
      </div>

      <div className="p-4 space-y-3">
        {/* NFT Name */}
        <div className="flex items-center justify-between">
          <h3 
            className="text-lg font-semibold text-foreground truncate flex-1" 
            title={name}
          >
            {name}
          </h3>
          <ExternalLink className="w-4 h-4 text-muted-foreground ml-2 flex-shrink-0" />
        </div>

        <Separator className="bg-border/50" />

        {/* Price Section */}
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="text-base font-bold text-primary">{price}</span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-muted-foreground">
            ~${priceUSD.toFixed(0)}
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Points Badge */}
          {points !== undefined && points !== null && (
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold ${
              points > 0 
                ? 'bg-success/15 text-success border border-success/20' 
                : 'bg-muted/50 text-muted-foreground border border-border'
            }`}>
              <Star className="w-3.5 h-3.5" />
              <span>{formatNumber(points)} pts</span>
            </div>
          )}

          {/* Points per USD */}
          {pointsPerUSD > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent/15 text-accent border border-accent/20 text-sm font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{formatNumber(Math.round(pointsPerUSD))} pts/$1</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
