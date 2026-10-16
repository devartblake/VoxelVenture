"use client";

import { useEffect } from 'react';
import CityCanvas from '@/components/city/CityCanvas';
import Header from '@/components/ui/Header';
import { MiniMapButton } from '@/components/ui/Legend';
import InteractPrompt from '@/components/ui/InteractPrompt';
import Toast from '@/components/ui/Toast';
import SidePanel from '@/components/ui/panel/SidePanel';
import Toolbar from '@/components/ui/panel/Toolbar';
import { useCityStore } from '@/lib/state/store';
import { dayKey } from '@/lib/game/daily';
import { useView } from '@/lib/state/viewStore';
import InteriorModal from '@/components/interior/InteriorModal';
import TouchControls from '@/components/ui/TouchControls';
import AuthDialog from '@/components/ui/AuthDialog';
import { useAccount } from '@/lib/state/accountStore';
import { startSync } from '@/lib/data/sync';
import { hydrateMarket } from '@/lib/state/marketStore';
import { startPresence } from '@/lib/data/presence';
import StatsPill from '@/components/ui/StatsPill';
import Compass from '@/components/ui/Compass';
import VehicleHud from '@/components/ui/VehicleHud';
import WorldMap from '@/components/ui/WorldMap';
import DeepLink from '@/components/DeepLink';
import SoundEngine from '@/components/SoundEngine';
import AmbientControls from '@/components/ui/AmbientControls';

export default function Home() {
  // The save is loaded after mount (so the first render matches the server's), then today's date is
  // set, which unlocks the daily chest and Plot of the Day. The date is re-checked every minute so
  // a tab left open past midnight rolls over.
  useEffect(() => {
    useView.getState().hydrate();
    hydrateMarket();
    startPresence();
    // with a game server: who is signed in, and the owners of every plot (browsing never asks for a sign-in)
    useAccount.getState().hydrate().then(() => startSync());
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.resolve(useCityStore.persist.rehydrate()).then(() => {
      if (alive) useCityStore.getState().setDay(dayKey());
    });
    const timer = setInterval(() => {
      const today = dayKey();
      if (useCityStore.getState().day && useCityStore.getState().day !== today) useCityStore.getState().setDay(today);
    }, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#090d16]">
      <Header />
      <CityCanvas />
      <MiniMapButton />
      <StatsPill />
      <Compass />
      <Toolbar />
      <SidePanel />
      <InteractPrompt />
      <Toast />
      <VehicleHud />
      <TouchControls />
      <InteriorModal />
      <WorldMap />
      <DeepLink />
      <SoundEngine />
      <AmbientControls />
      <AuthDialog />
    </main>
  );
}
