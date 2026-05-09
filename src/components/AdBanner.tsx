import rollercoinSkyscraper from '@/assets/ads/rollercoin-120x600.gif';
import rollercoinMobile from '@/assets/ads/rollercoin-320x50.gif';

const REF_URL = 'https://rollercoin.com/?r=lmc81sgb';

interface AdBannerProps {
  className?: string;
  variant?: 'skyscraper' | 'mobile';
}

/**
 * Rollercoin referral banner.
 * - skyscraper (120x600): used as sticky side ads on large screens.
 * - mobile (320x50): used at the top on small screens only.
 */
export function AdBanner({ className = '', variant = 'skyscraper' }: AdBannerProps) {
  const isMobile = variant === 'mobile';
  const src = isMobile ? rollercoinMobile : rollercoinSkyscraper;
  const width = isMobile ? 320 : 120;
  const height = isMobile ? 50 : 600;

  return (
    <a
      href={REF_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`block rounded-lg overflow-hidden shadow-card hover:shadow-lg transition-shadow ${className}`}
      title="Rollercoin - Play and mine crypto"
    >
      <img
        src={src}
        alt="Rollercoin - Play and mine crypto"
        width={width}
        height={height}
        loading="lazy"
        className="block mx-auto"
      />
    </a>
  );
}
