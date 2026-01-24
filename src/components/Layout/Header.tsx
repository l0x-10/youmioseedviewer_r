import { Link, useLocation } from 'react-router-dom';
import { Scroll, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Header() {
  const location = useLocation();
  const isLeaderboard = location.pathname === '/leaderboard';

  return (
    <header className="bg-card/80 backdrop-blur-md rounded-xl shadow-card p-4 md:p-6 mb-6 md:mb-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <ThemeToggle />
        
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
          <Link to="/leaderboard">
            <Button 
              variant="outline" 
              size="sm"
              className="gap-1 md:gap-2 text-xs md:text-sm hover:scale-105 transition-transform"
            >
              <Trophy className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </Button>
          </Link>
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
