import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY = 'eth_price_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheData {
  price: number;
  timestamp: number;
}

export function useEthPrice() {
  const [ethPrice, setEthPrice] = useState<number>(2500);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrice = async () => {
      // Check cache first
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data: CacheData = JSON.parse(cached);
        if (Date.now() - data.timestamp < CACHE_DURATION) {
          setEthPrice(data.price);
          setLoading(false);
          return;
        }
      }

      try {
        const { data, error } = await supabase.functions.invoke('eth-price');
        
        if (!error && data?.price) {
          setEthPrice(data.price);
          // Cache the result
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            price: data.price,
            timestamp: Date.now(),
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch ETH price, using fallback:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
  }, []);

  return { ethPrice, loading };
}
