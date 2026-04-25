import { Link, useLocation } from 'react-router-dom';
import { Scroll, Trophy, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export function Header() {
  const location = useLocation();
  const isLeaderboard = location.pathname === '/leaderboard';

  return (
    <header className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-4 md:p-6 mb-6 md:mb-8 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 md:gap-2">
          <ThemeToggle />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:h-9 md:w-9"
                title="About this site"
              >
                <Info className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 text-sm">
              <div className="space-y-2">
                <h4 className="font-bold text-base flex items-center gap-2">
                  <Scroll className="w-4 h-4 text-primary" />
                  Youmio Seed Viewer
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Browse all <span className="font-semibold text-foreground">Mythic</span> and{' '}
                  <span className="font-semibold text-foreground">Ancient</span> Youmio Seeds
                  currently listed for sale on OpenSea — sorted by best value.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
                  <li>See live ETH/USD prices for each Seed</li>
                  <li>Filter by points-per-dollar to find best deals</li>
                  <li>Track recent sales in the side panel</li>
                  <li>Use the calculator to price your own Seed fairly</li>
                </ul>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                  Data refreshes automatically when you switch collections.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        <Link 
          to="/" 
          className="flex items-center gap-2 md:gap-3 group"
        >
          <Scroll className="w-6 h-6 md:w-8 md:h-8 text-primary transition-transform group-hover:scale-110 group-hover:rotate-6" />
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground whitespace-nowrap">
            Youmio Seed
          </h1>
        </Link>
        
        {!isLeaderboard ? (
          <Button
            variant="outline"
            size="sm"
            disabled
            className="gap-1 md:gap-2 text-xs md:text-sm opacity-60 cursor-not-allowed"
            title="Leaderboard is coming soon"
          >
            <Trophy className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Leaderboard</span>
            <span className="text-[9px] md:text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              Soon
            </span>
          </Button>
        ) : (
          <Link to="/">
            <Button 
              variant="outline" 
              size="sm"
              className="gap-1 md:gap-2 text-xs md:text-sm hover:scale-105 transition-transform"
            >
              <Scroll className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Viewer</span>
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
