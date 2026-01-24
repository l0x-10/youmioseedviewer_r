import { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-20 right-4 z-50 w-8 h-8 rounded-full bg-primary/30 hover:bg-primary/50 backdrop-blur-sm border border-primary/20 flex items-center justify-center transition-all duration-300 hover:scale-110 opacity-60 hover:opacity-100"
      aria-label="Scroll to top"
    >
      <ChevronUp className="w-4 h-4 text-foreground" />
    </button>
  );
}
