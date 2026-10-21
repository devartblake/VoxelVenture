"use client";

import { useEffect } from 'react';
import { apiOn } from '@/lib/data/api';
import { findBuilding, parseDeepLink } from '@/lib/game/shareLink';
import { captureRef } from '@/lib/business/referral';
import { rememberLink } from '@/lib/game/spawn';
import { useMarket } from '@/lib/state/marketStore';
import { usePanel } from '@/lib/state/panelStore';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';

// A link like /?plot=12&city=20260101 (or /b/12): once the city is ready, the camera glides to that building and its card opens. The address is then tidied
// to plain "/" so a reload (or a copied address) does not keep re-opening it. A link for another city (a single-player game on its own seed) says so
// instead of regenerating the city, which would throw away the player's own buildings. /?market=edit (the admin Overview's link) opens the
// pop-up market's panel on its weekly layout editor, which itself checks for an admin session (components/ui/panel/MarketPanel.jsx). Renders nothing.
export default function DeepLink() {
  useEffect(() => {
    captureRef(); // a shared link's ?ref= credits whoever shared it if this visitor signs up (lib/business/referral.js)
    if (new URLSearchParams(window.location.search).get('market') === 'edit') return openMarketEditor();
    const { plot: id, city } = parseDeepLink(window.location.search);
    if (!id) return undefined;
    rememberLink(window.location.search); // the avatar starts beside the building, even if it is placed after the address is tidied
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      const st = useCityStore.getState();
      if (city != null && city !== st.layout.seed && !apiOn()) {
        st.notify(`That link is for city #${city}; you are in city #${st.layout.seed}.`);
        return;
      }
      const hit = findBuilding(id, st.plots, st.layout);
      if (!hit) {
        st.notify(`Building ${id} is not in this city.`);
        return;
      }
      if (hit.kind === 'plot') {
        useWorld.getState().focusOn(hit.plot.x, hit.plot.z, 30);
        st.setSelectedPlot(hit.plot);
      } else {
        useWorld.getState().focusOn(hit.mall.x, hit.mall.z, 28);
        usePanel.getState().openMall(hit.mall.id);
      }
    };
    // wait for the saved game and the page's first frames, so the camera is ready to move
    const timer = setTimeout(() => {
      Promise.resolve(useCityStore.persist.rehydrate()).then(() => setTimeout(apply, 400));
      try {
        const rest = new URLSearchParams(window.location.search);
        for (const k of ['plot', 'building', 'city']) rest.delete(k);
        window.history.replaceState(null, '', `${window.location.pathname}${rest.size ? `?${rest}` : ''}`);
      } catch {
        /* the address stays as it is */
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return null;
}

// /?market=edit: once the city is ready, the camera goes to the market and its panel opens on the editor (or on "Sign in as an admin").
function openMarketEditor() {
  let cancelled = false;
  const timer = setTimeout(() => {
    try {
      const rest = new URLSearchParams(window.location.search);
      rest.delete('market');
      window.history.replaceState(null, '', `${window.location.pathname}${rest.size ? `?${rest}` : ''}`);
    } catch {
      /* the address stays as it is */
    }
    Promise.resolve(useCityStore.persist.rehydrate()).then(() =>
      setTimeout(() => {
        if (cancelled) return;
        const site = useCityStore.getState().layout.reserved.find((r) => r.market);
        if (!site) return;
        useWorld.getState().focusOn((site.x0 + site.x1) / 2, (site.z0 + site.z1) / 2, 40);
        useMarket.setState({ adminOpen: true });
        usePanel.getState().editReserved(site.id);
      }, 400)
    );
  }, 600);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
