"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { useCityStore } from '@/lib/state/store';
import { usePanel } from '@/lib/state/panelStore';
import { useView } from '@/lib/state/viewStore';
import { avatarState } from '@/lib/sim/avatarState';
import { tourById } from '@/lib/tour/tours';
import { FLY_MS, angleDelta, cameraFor, ease, tourParams } from '@/lib/tour/plan';
import { endTour, markTour } from '@/lib/tour/mode';

// The previews load only when a tour opens one (the dashboard brings the owner's page's funnel with it)
const FiguresPreview = dynamic(() => import('./Previews').then((m) => m.FiguresPreview), { ssr: false });
const ClaimPreview = dynamic(() => import('./Previews').then((m) => m.ClaimPreview), { ssr: false });
const CartPreview = dynamic(() => import('./Previews').then((m) => m.CartPreview), { ssr: false });

// The guided demo tour (docs/product/pilot_tour.md): /?tour=pilot flies the camera from stop to stop of a tour (lib/tour/tours.js), with a caption
// card, Back / Pause / Next / Exit, the keyboard (← → or Page Up / Page Down, Space, Esc) and touch-sized buttons. Each stop can open something
// when the camera arrives: a building's card, its room, a public page in a frame, or a preview of the owner's dashboard, the claim form or the
// cart. Nothing is changed: lib/tour/mode.js makes the tab read-only while the tour runs. With reduced motion the camera cuts instead of flying.
// ?tourSpeed=<n> runs it n times faster (the recorder and the tests), ?tourStop=<n> starts at stop n. Renders nothing without ?tour=.
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const TICK_MS = 200;

export default function TourPlayer() {
  const [tour, setTour] = useState(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // which stop the camera has reached, and how long the current stop has run: both kept with their stop's index, so a step back or on never
  // reads the stop before's (an arrival or a run-out clock from the stop before would open or skip the new one at once)
  const [arrivedAt, setArrivedAt] = useState(-1);
  const [clock, setClock] = useState({ at: -1, ms: 0 });
  const [overlay, setOverlay] = useState(null); // { kind, plot?, lot?, src? }
  const speed = useRef(1);
  const fly = useRef(0);

  // start once the page and its camera are ready (the view store is read from the address and the saved choice after mount)
  useEffect(() => {
    const { id, speed: s, start } = tourParams(window.location.search);
    if (!id) return undefined;
    const t = tourById(id);
    if (!t) {
      useCityStore.getState().notify(`There is no tour called "${id}".`);
      return undefined;
    }
    markTour(t.id);
    speed.current = s;
    let timer = null;
    const go = () => {
      usePanel.getState().close();
      setIndex(Math.min(start, t.stops.length - 1));
      setTour(t);
    };
    const wait = () => (useView.getState().ready ? (timer = setTimeout(go, 1500)) : (timer = setTimeout(wait, 200)));
    wait();
    return () => clearTimeout(timer);
  }, []);

  const stop = tour?.stops[index] ?? null;
  const last = tour ? index === tour.stops.length - 1 : false;
  const arrived = arrivedAt === index;
  const elapsed = clock.at === index ? clock.ms : 0;

  // what a stop opened goes when the tour moves on
  const closeAll = useCallback(() => {
    setOverlay(null);
    const st = useCityStore.getState();
    if (st.activeInteriorPlot) st.closeInterior();
    if (st.selectedPlot) st.clearSelectedPlot();
  }, []);

  // fly the camera to the stop, then open its action
  useEffect(() => {
    if (!stop) return undefined;
    closeAll();
    const st = useCityStore.getState();
    const cam = cameraFor(stop, { plots: st.plots, layout: st.layout });
    if (!cam) {
      st.notify(`The tour's stop "${stop.title}" is not in this city.`);
      setArrivedAt(index);
      return undefined;
    }
    const view = useView.getState();
    const from = { x: view.free?.x ?? avatarState.x, z: view.free?.z ?? avatarState.z, azimuth: view.azimuth, pitch: view.pitch, distance: view.distance };
    if (view.view !== cam.view) {
      view.setView(cam.view); // the preset's field of view; its tilt and distance are flown to below
      useView.setState({ pitch: from.pitch, distance: from.distance });
    }
    const to = { x: cam.x, z: cam.z, azimuth: from.azimuth + angleDelta(from.azimuth, cam.azimuth), pitch: cam.pitch ?? from.pitch, distance: cam.distance ?? from.distance };
    const ms = reducedMotion() ? 0 : Math.max(300, FLY_MS / speed.current);
    const t0 = performance.now();
    const frame = (now) => {
      const k = ms ? ease(Math.min(1, (now - t0) / ms)) : 1;
      const at = (a, b) => a + (b - a) * k;
      // set directly, not through setView/setPitch: those save the player's camera choice, and a tour is not the player's choice
      useView.setState({ free: { x: at(from.x, to.x), z: at(from.z, to.z) }, azimuth: at(from.azimuth, to.azimuth), pitch: at(from.pitch, to.pitch), distance: at(from.distance, to.distance) });
      if (k < 1) fly.current = requestAnimationFrame(frame);
      else setArrivedAt(index);
    };
    cancelAnimationFrame(fly.current);
    fly.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(fly.current);
  }, [stop, index, closeAll]);

  // the action, once the camera is there
  useEffect(() => {
    if (!arrived || !stop?.action || !tour) return;
    const a = stop.action;
    const st = useCityStore.getState();
    const plot = a.plot != null ? st.plots.find((p) => p.id === a.plot) : null;
    if (a.kind === 'card' && plot) st.setSelectedPlot(plot);
    else if (a.kind === 'interior' && plot) useCityStore.setState({ activeInteriorPlot: plot }); // not openInterior: a tour's look inside is not a visit
    else if (a.kind === 'page') {
      const [route, hash] = a.path.split('#');
      setOverlay({ kind: 'page', src: `${route}?tour=${encodeURIComponent(tour.id)}${hash ? `#${hash}` : ''}` });
    }
    else if (plot) setOverlay({ kind: a.kind, plot, lot: a.claimPlot != null ? st.plots.find((p) => p.id === a.claimPlot) : null });
  }, [arrived, stop, tour]);

  // the clock: a stop stays for its duration (counted from when it starts, flight included), then the tour moves on; it stops at the last
  useEffect(() => {
    if (!stop || paused) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setClock((c) => ({ at: index, ms: (c.at === index ? c.ms : 0) + TICK_MS * speed.current }));
    }, TICK_MS);
    return () => clearInterval(t);
  }, [stop, index, paused]);
  useEffect(() => {
    if (stop && arrived && !last && elapsed >= stop.durationMs) setIndex((i) => i + 1);
  }, [elapsed, stop, arrived, last]);

  const exit = useCallback(() => {
    cancelAnimationFrame(fly.current);
    closeAll();
    setTour(null);
    endTour();
  }, [closeAll]);
  const next = useCallback(() => (last ? exit() : setIndex((i) => i + 1)), [last, exit]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const toggle = useCallback(() => setPaused((p) => !p), []);

  // the keyboard, ahead of the game's own keys (the arrows would walk the avatar and end the camera's look-around); also inside the page frame
  const onKey = useCallback(
    (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key;
      const act = k === 'ArrowRight' || k === 'PageDown' ? next : k === 'ArrowLeft' || k === 'PageUp' ? back : k === ' ' || k === 'Spacebar' ? toggle : k === 'Escape' ? exit : null;
      if (!act) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) act();
    },
    [next, back, toggle, exit],
  );
  useEffect(() => {
    if (!tour) return undefined;
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, onKey]);

  if (!tour || !stop) return null;
  const progress = Math.min(1, elapsed / stop.durationMs);
  return (
    <>
      {overlay && <Overlay overlay={overlay} seed={tour.seed} onKey={onKey} />}
      <section
        className="fixed inset-x-2 bottom-2 z-[210] mx-auto max-w-xl rounded-2xl border border-sx-stroke bg-sx-panel/95 p-3 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-md sm:inset-x-4 sm:bottom-5 sm:p-4"
        aria-label={`${tour.title}: stop ${index + 1} of ${tour.stops.length}`}
        data-testid="tour-caption"
        data-tour-id={tour.id}
        data-tour-step={index + 1}
        data-tour-stops={tour.stops.length}
        data-tour-stop={stop.id}
        data-tour-arrived={arrived ? '1' : '0'}
        data-tour-paused={paused ? '1' : '0'}
        data-tour-motion={reducedMotion() ? 'cut' : 'fly'}
      >
        <p className="flex items-center justify-between text-xs uppercase tracking-wide text-sx-muted">
          <span>{tour.title}</span>
          <span data-testid="tour-step">{index + 1} / {tour.stops.length}</span>
        </p>
        <div aria-live="polite">
          <h2 className="mt-1 text-xl font-bold leading-tight text-white" data-testid="tour-title">{stop.title}</h2>
          <p className="mt-1 text-sm leading-snug text-slate-200" data-testid="tour-text">{stop.text}</p>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded bg-sx-alt" aria-hidden="true">
          <div className="h-full bg-gradient-to-r from-sx-purple to-sx-cyan" style={{ width: `${(last ? 1 : progress) * 100}%`, transition: reducedMotion() ? 'none' : `width ${TICK_MS}ms linear` }} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={back} disabled={index === 0} aria-label="Back" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-sx-stroke hover:bg-sx-alt disabled:opacity-40" data-testid="tour-back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={toggle} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-sx-stroke hover:bg-sx-alt" data-testid="tour-pause">
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button type="button" onClick={next} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-sx-purple to-sx-blue px-4 font-semibold text-white hover:brightness-110" data-testid="tour-next">
            {last ? 'Finish' : 'Next'} {!last && <ChevronRight className="h-5 w-5" />}
          </button>
          <button type="button" onClick={exit} aria-label="Exit the tour" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-sx-stroke hover:bg-sx-alt" data-testid="tour-exit">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 hidden text-[11px] text-sx-muted sm:block">← → to move, Space to pause, Esc to leave. A tour only looks: nothing is saved or bought.</p>
      </section>
    </>
  );
}

// What a stop opened over the city: a public page in a frame, or one of the previews.
function Overlay({ overlay, seed, onKey }) {
  const frame = useRef(null);
  // keys pressed inside the page frame still drive the tour (it is the same site, so its document can be listened to)
  const hook = () => {
    try {
      frame.current?.contentWindow?.addEventListener('keydown', onKey, true);
    } catch {
      /* not reachable: the keys work once the frame loses the focus */
    }
  };
  useEffect(() => {
    const win = frame.current?.contentWindow;
    return () => {
      try {
        win?.removeEventListener('keydown', onKey, true);
      } catch {
        /* gone */
      }
    };
  }, [onKey]);
  const page = overlay.kind === 'page';
  return (
    <div
      className={`fixed inset-x-2 top-14 bottom-[14.5rem] z-[200] overflow-hidden rounded-2xl border border-sx-stroke bg-sx-page shadow-2xl shadow-black/70 sm:inset-x-6 sm:top-16 sm:bottom-48 ${page ? 'lg:inset-x-[8%]' : 'sm:left-auto sm:w-[min(640px,calc(100vw-3rem))]'}`}
      data-testid="tour-overlay"
      data-kind={overlay.kind}
    >
      {page ? (
        <iframe ref={frame} src={overlay.src} title="The page this stop shows" onLoad={hook} className="h-full w-full border-0 bg-sx-page" data-testid="tour-frame" />
      ) : (
        <div className="h-full overflow-y-auto p-4 sm:p-5">
          {overlay.kind === 'dashboard' && <FiguresPreview plot={overlay.plot} seed={seed} />}
          {overlay.kind === 'claim' && <ClaimPreview plot={overlay.plot} />}
          {overlay.kind === 'cart' && <CartPreview plot={overlay.plot} lot={overlay.lot ?? overlay.plot} />}
        </div>
      )}
    </div>
  );
}
