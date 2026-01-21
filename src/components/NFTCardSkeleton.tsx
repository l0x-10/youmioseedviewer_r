import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function NFTCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      {/* Image skeleton */}
      <Skeleton className="w-full h-64" />
      
      {/* Content skeleton */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <Skeleton className="h-6 w-3/4" />
        
        {/* Price row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-4" />
        </div>
        
        {/* Points badge */}
        <Skeleton className="h-8 w-28 rounded-md" />
        
        {/* Ratio badge */}
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
    </Card>
  );
}

export function NFTGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <NFTCardSkeleton key={index} />
      ))}
    </div>
  );
}
