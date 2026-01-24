import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { ScrollToTop } from '@/components/ScrollToTop';

interface PageLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
}

export function PageLayout({ children, showHeader = true }: PageLayoutProps) {
  return (
    <div className="min-h-screen pb-20">
      <div className="container mx-auto px-3 md:px-4 py-4 md:py-6">
        {showHeader && <Header />}
        <main className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          {children}
        </main>
      </div>
      <Footer />
      <ScrollToTop />
    </div>
  );
}
