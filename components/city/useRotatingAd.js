import { useEffect, useState } from 'react';
import { adAt, msToNext, rotates } from '@/lib/game/adRotation';

// The ad a slot is showing right now (see lib/game/adRotation.js): re-evaluated when the next turn starts, and only for a slot with more than one ad.
export function useRotatingAd(billboard) {
  const [now, setNow] = useState(() => Date.now());
  const multi = rotates(billboard);
  useEffect(() => {
    if (!multi) return undefined;
    let timer;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, msToNext() + 30);
    };
    tick();
    return () => clearTimeout(timer);
  }, [multi]);
  return multi ? adAt(billboard, now) : billboard.ad ?? null;
}
