import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const DONATION_WALLET = '0x2d96908f3FC1f03213300a4D249C2D2ac5cF4154';

export function Footer() {
  const handleDonate = () => {
    navigator.clipboard.writeText(DONATION_WALLET);
    toast.success('Wallet address copied!', {
      description: 'Thank you for your support! 💖',
    });
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border py-3 px-4 md:px-6 z-40">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <small className="text-muted-foreground text-center sm:text-left text-xs md:text-sm">
          © <a
            href="https://discord.com/users/1057664293065211976"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-semibold transition-colors"
          >
            @l0x_10
          </a> All rights reserved.
        </small>

        <Button
          onClick={handleDonate}
          variant="outline"
          size="sm"
          className="group relative overflow-hidden bg-gradient-to-r from-success/20 to-success/10 hover:from-success/30 hover:to-success/20 text-success border-success/30 hover:border-success/50 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-success/20"
          title="Copy wallet address for donations"
        >
          <Gift className="w-4 h-4 mr-2 transition-transform group-hover:rotate-12 group-hover:scale-110" />
          <span className="relative z-10">Donate</span>
          <span className="absolute inset-0 bg-gradient-to-r from-success/0 via-success/10 to-success/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        </Button>
      </div>
    </footer>
  );
}
