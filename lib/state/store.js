import { applyExterior } from '../game/exterior';
import { claimPrice } from '../game/claimPrice';
import { MAX_SHARERS, SHARE_PRICE, isHex } from '../game/adRotation';
import { grownHeight } from '../game/skyline';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BILLBOARD_BUYOUT_MULTIPLIER, BUILDING_TYPES, GRAND_HEIGHT, LUXURY_HEIGHT, PRIME_HEIGHT, SUBURB_ID, TAKEOVER_MULTIPLIER, floorsForHeight, generateCity, randomSeed } from '../city/cityGenerator';
import { COSMETIC_BY_ID, DEFAULT_APPEARANCE, DEFAULT_OWNED, RAFFLE_COST, drawRafflePrize } from '../game/cosmetics';
import { HUNT_BONUS, HUNT_COUNT, HUNT_GOLD, dailyChest, plotOfTheDay, POTD_VISIT_GOLD } from '../game/daily';
import { toEmbedUrl } from '../content/embeds';
import { FISH_DAILY_CAP } from '../sim/vehicles';
import { devToolsOn } from '../dev/devTools';
import { generateWorld, loadEdits } from '../city/editedWorld';
import { cleanLogo } from '../game/logos';

const DEFAULT_SEED = 20260101;
const initialCity = generateCity(DEFAULT_SEED);

// A typical height for a type: the middle of its range.
const typicalHeight = (type) => Math.round(((BUILDING_TYPES[type].height[0] + BUILDING_TYPES[type].height[1]) / 2) * 10) / 10;

export const BILLBOARD_QUEST_SECONDS = 10;
export const BILLBOARD_QUEST_GOLD = 25;

// The fields that make a plot the player's own business of the given type.
// How much taller a building is on a plot of this tier than an ordinary one of its type.
const tierHeight = (p) => (p.grand ? GRAND_HEIGHT : p.luxury ? LUXURY_HEIGHT : p.prime ? PRIME_HEIGHT : 1);

// `variant` is the interior layout the owner picked (see BUILDING_TYPES[type].variants); the first one if none or if it is not one of the type's.
const asPlayerBusiness = (ownerName, title, website, buildingType, tier = {}, variant = null, logo = null, description = '') => ({
  owner: ownerName,
  description: String(description ?? '').trim().slice(0, 160) || undefined, // the owner's own words about the business
  logo: cleanLogo(logo), // the roof banner: chosen by the owner
  title,
  website,
  userClaimed: true,
  brand: null, // a new owner starts with no offers; they set their own
  height: Math.round(typicalHeight(buildingType) * tierHeight(tier) * 10) / 10,
  color: '#10b981',
  buildingType,
  category: BUILDING_TYPES[buildingType].category ?? 'Business',
  interiorData: {
    rooms: 1,
    theme: buildingType,
    variant: BUILDING_TYPES[buildingType].variants.includes(variant) ? variant : BUILDING_TYPES[buildingType].variants[0],
    floors: floorsForHeight(typicalHeight(buildingType) * tierHeight(tier)),
    ...(tier.prime && { prime: true }),
    ...(tier.luxury && { luxury: true }),
    ...(tier.grand && { grand: true }),
  },
});

// A business is a plot or a store in one of the malls (a store is plot-shaped but is not in `plots`).
export const businessById = (state, id) => state.plots.find((p) => p.id === id) ?? state.layout.malls?.flatMap((m) => m.stores).find((st) => st.id === id);
// The state change that updates one business, wherever it is kept.
const patchBusiness = (state, id, change) =>
  state.plots.some((p) => p.id === id)
    ? { plots: state.plots.map((p) => (p.id === id ? change(p) : p)) }
    : { layout: { ...state.layout, malls: state.layout.malls.map((m) => ({ ...m, stores: m.stores.map((st) => (st.id === id ? change(st) : st)) })) } };

// Callbacks the live-data layer (lib/data/sync.js) fills in: the store calls them when a visit or a website click happens.
export const hooks = { onVisit: null, onClick: null, onAdView: null, onAdClick: null };

const NO_SELECTION = { selectedPlot: null, selectedPark: null, selectedBillboardId: null };

const updateBillboard = (billboards, id, change) => billboards.map((b) => (b.id === id ? { ...b, ...change(b) } : b));
const toast = (text) => ({ toast: { id: Date.now() + Math.random(), text } });

export const useCityStore = create(
  persist(
    (set, get) => ({
      plots: initialCity.plots,
      billboards: initialCity.billboards,
      layout: initialCity.layout,
      selectedPlot: null,
      selectedPark: null,
      selectedBillboardId: null,
      activeInteriorPlot: null,

      // progress that is saved in the browser
      gold: 0,
      completedQuests: {}, // billboard id -> true once its look-at-the-ad quest has paid out
      owned: DEFAULT_OWNED, // cosmetic id -> true
      appearance: DEFAULT_APPEARANCE, // slot -> cosmetic id
      daily: { chestDay: null, potdDay: null, huntDay: null, huntFound: [] }, // the last day each daily reward was collected, and today's stars found
      redeemed: {}, // plot id -> the coupon code you claimed there
      brandQuests: {}, // plot id -> true once you've earned that business's visit reward
      activity: {}, // plot or store id -> { visits, siteClicks }: what the player did there
      fishing: { caught: {}, day: null, goldToday: 0 }, // fish caught by kind, and the Gold fishing has paid today (capped)
      reservedDesigns: {}, // development only: reserved site id -> the design made in the site editor

      // session only
      day: null, // today's date key; set after mount so server and client markup agree
      wardrobeOpen: false,
      toast: null, // { id, text }

      setDay: (day) => set({ day }),
      setWardrobeOpen: (wardrobeOpen) => set({ wardrobeOpen }),
      notify: (text) => set(toast(text)),
      dismissToast: () => set({ toast: null }),

      setSelectedPlot: (plot) => set({ ...NO_SELECTION, selectedPlot: plot }),
      setSelectedPark: (park) => set({ ...NO_SELECTION, selectedPark: park }),
      setSelectedBillboard: (billboard) => set({ ...NO_SELECTION, selectedBillboardId: billboard.id }),
      clearSelectedPlot: () => set(NO_SELECTION),

      // Walking into the Plot of the Day pays a bonus, once a day.
      openInterior: (plot) =>
        set((state) => {
          // every visit to a building is counted (the plot card's site-visit statistics add it to the simulated ones)
          hooks.onVisit?.(plot);
          const seen = state.activity[plot.id] ?? {};
          const base = { activeInteriorPlot: plot, activity: { ...state.activity, [plot.id]: { ...seen, visits: (seen.visits ?? 0) + 1 } } };
          const potd = state.day && plotOfTheDay(state.plots, state.layout.seed, state.day);
          if (potd && potd.id === plot.id && state.daily.potdDay !== state.day) {
            return {
              ...base,
              gold: state.gold + POTD_VISIT_GOLD,
              daily: { ...state.daily, potdDay: state.day },
              ...toast(`Plot of the Day! +${POTD_VISIT_GOLD} Gold for visiting ${plot.title}`),
            };
          }
          return base;
        }),
      closeInterior: () => set({ activeInteriorPlot: null }),
      // The outside wall colour the owner chose for a building (kept on the plot, so it is saved with it). null goes back to the default.
      setPlotWallColor: (plotId, wallColor) =>
        set((s) => {
          const ok = typeof wallColor === 'string' && /^#[0-9a-f]{6}$/i.test(wallColor);
          const plots = s.plots.map((p) => (p.id === plotId ? { ...p, wallColor: ok ? wallColor : undefined } : p));
          const active = s.activeInteriorPlot?.id === plotId ? plots.find((p) => p.id === plotId) : s.activeInteriorPlot;
          return { plots, activeInteriorPlot: active };
        }),

      regenerateCity: (seed = randomSeed()) => {
        const city = generateCity(seed);
        set({
          plots: city.plots,
          billboards: city.billboards,
          layout: city.layout,
          reservedDesigns: {},
          activity: {},
          ...NO_SELECTION,
          activeInteriorPlot: null,
        });
      },

      // Development only (the reserved-site editor). Builds the city again from the same seed with this site's design
      // (or without one, when `design` is null). The city itself is generated exactly as before, so every plot you
      // already have, built or claimed, is kept as it is; only the design's own lots are replaced (any claimed in the
      // old design of this site are lost, which the editor warns about).
      setReservedDesign: (siteId, design) => {
        if (!devToolsOn()) return false;
        const state = get();
        const designs = { ...state.reservedDesigns };
        if (design) designs[siteId] = design;
        else delete designs[siteId];
        const city = generateWorld(state.layout.seed, { designs }); // (the city editor's edits, if there are any for this seed, are replayed over it)
        const keptDesigned = new Map(state.plots.filter((p) => p.designSite && p.designSite !== siteId).map((p) => [p.id, p]));
        const plots = [...state.plots.filter((p) => !p.designSite), ...city.plots.filter((p) => p.designSite).map((p) => keptDesigned.get(p.id) ?? p)];
        set({ reservedDesigns: designs, layout: city.layout, plots, ...NO_SELECTION, ...toast(design ? 'Site design applied.' : 'Site design removed.') });
        return true;
      },

      // The roof banner's logo ({ icon, color }) is required: a claim without a valid one does nothing and returns false.
      // `exterior` (optional) is the outside the owner set up: floors, shape, colours, a rooftop feature (lib/game/exterior.js).
      claimPlot: (plotId, ownerName, title, website, buildingType = 'shop', variant = null, logo = null, description = '', exterior = null) => {
        if (!cleanLogo(logo)) return false;
        set((state) => ({
          plots: state.plots.map((p) => {
            // Old Town lots are kept for owners who get bought out
            if (!(p.id === plotId && !p.owner && p.districtId !== SUBURB_ID)) return p;
            const business = { ...p, ...asPlayerBusiness(ownerName, title, website, buildingType, p, variant, logo, description) };
            // what they paid: the land, and whatever they customised on the outside (it becomes the building's value, so a take-over is 1.25x this)
            return { ...business, ...(exterior ? applyExterior(business, exterior, buildingType) : {}), value: claimPrice(p, exterior, buildingType).total };
          }),
          selectedPlot: null,
        }));
        return true;
      },

      // Rent a store in a mega mall (the mall is its landlord, so nobody is paid out). The store keeps its kind and its interior; you name it, link it and
      // give it a roof banner. Returns the price (a claim's 1.25x), or null if the store is not for rent (already yours, or unknown).
      rentStore: (storeId, ownerName, title, website, logo = null, description = '') => {
        const state = get();
        const store = state.layout.malls?.flatMap((m) => m.stores).find((st) => st.id === storeId);
        if (!store || store.userClaimed || !cleanLogo(logo)) return null;
        const price = Math.round((store.value ?? 100) * 1.25);
        const mine = asPlayerBusiness(ownerName, title, website, store.buildingType, {}, store.interiorData?.variant, logo, description);
        set({
          ...patchBusiness(state, storeId, (st) => ({
            ...st,
            ...mine,
            height: st.height, // a unit in the mall keeps its size
            interiorData: { ...st.interiorData },
            value: price,
            history: [{ owner: st.owner, title: st.title, paidOut: 0, movedTo: null }, ...(st.history ?? [])],
          })),
          ...toast(`You rented ${title} in ${store.owner} for $${price.toLocaleString()}.`),
        });
        return price;
      },

      // A fish was reeled in (see lib/sim/vehicles.js). It pays its Gold, up to FISH_DAILY_CAP a day. Returns the Gold paid.
      catchFish: (fish) => {
        const state = get();
        const sameDay = state.fishing.day === state.day;
        const today = sameDay ? state.fishing.goldToday : 0;
        const paid = Math.max(0, Math.min(fish.gold, FISH_DAILY_CAP - today));
        const text = fish.gold === 0 ? `You reeled in an ${fish.name.toLowerCase()}.` : paid > 0 ? `You caught a ${fish.name.toLowerCase()}! +${paid} Gold` : `You caught a ${fish.name.toLowerCase()}. (Today's fishing limit of ${FISH_DAILY_CAP} Gold is reached.)`;
        set({
          gold: state.gold + paid,
          fishing: { caught: { ...state.fishing.caught, [fish.id]: (state.fishing.caught[fish.id] ?? 0) + 1 }, day: state.day, goldToday: today + paid },
          ...toast(text),
        });
        return paid;
      },

      // The server changed some plots (a claim, a take-over, a change by another player): make them buildings or empty lots to match.
      // `list` holds { id, owner, title, website, buildingType, logo, description, value, visits, takeovers, userClaimed }.
      applyServerPlots: (list, clearSelection = false) =>
        set((state) => {
          const by = new Map(list.map((c) => [c.id, c]));
          // a building grows with its verified traffic (lib/game/skyline.js): the generated height times the level's factor, never an admin building
          const grown = (obj, c) => {
            const base = obj.baseHeight ?? obj.height;
            const level = obj.admin ? 0 : c.skyline?.level ?? 0;
            return { ...obj, baseHeight: base, height: obj.owner ? grownHeight(base, level) : obj.height, skyline: c.skyline ?? null, lease: c.lease ?? null, ownerAccount: c.ownerAccount ?? null, profileSlug: c.profileSlug ?? null };
          };
          const plots = state.plots.map((p) => {
            const c = by.get(p.id);
            if (!c) return p;
            const counts = { value: c.value ?? p.value, visits: c.visits ?? p.visits, takeovers: c.takeovers ?? p.takeovers };
            if (!c.owner) {
              // the server says this lot is empty
              if (!p.owner) return { ...p, ...counts, lease: null, skyline: null, ownerAccount: null };
              return { ...p, ...counts, owner: null, ownerAccount: null, userClaimed: false, height: 0.2, baseHeight: undefined, color: '#475569', interiorData: null, brand: null, buildingType: undefined, logo: undefined, description: undefined, lease: null, skyline: null };
            }
            // a business the city started with that nobody has touched keeps its generated look
            const untouched = p.owner === c.owner && !c.userClaimed && !(c.takeovers > 0);
            if (untouched) return grown({ ...p, ...counts, userClaimed: false, description: c.description ?? p.description }, c);
            const type = c.buildingType ?? p.buildingType ?? 'shop';
            let mine = asPlayerBusiness(c.owner, c.title, c.website, type, p, p.interiorData?.variant, c.logo, c.description);
            if (c.exterior) mine = { ...mine, ...applyExterior({ ...p, ...mine }, c.exterior, type) }; // the outside the owner set up (kept by the server)
            return grown({ ...p, ...mine, ...counts, userClaimed: c.userClaimed, generated: undefined, baseHeight: mine.height ?? p.height }, c);
          });
          // an open card shows the plot as the server now has it (its owner, counts and outside), not the copy taken when it was opened
          const sel = state.selectedPlot && by.has(state.selectedPlot.id) ? plots.find((p) => p.id === state.selectedPlot.id) : state.selectedPlot;
          return { plots, selectedPlot: clearSelection ? null : sel };
        }),

      // The server's ad slots: the ad on each, its price and its numbers.
      applyServerAds: (list) =>
        set((state) => {
          const by = new Map(list.map((a) => [a.id, a]));
          // `sale`: with payments on, what booking the space costs and until when it is booked (services/api/core.mjs slotView); `ownerAccount`: who holds it
          return { billboards: state.billboards.map((b) => { const a = by.get(b.id); return a ? { ...b, ad: a.ad, value: a.value, views: a.views, clicks: a.clicks, sale: a.sale ?? null, ownerAccount: a.ownerAccount ?? null } : b; }) };
        }),

      // Someone pressed Visit website on a business: counted for the plot card's statistics.
      recordSiteClick: (plotId) => {
        hooks.onClick?.(plotId);
        const seen = get().activity[plotId] ?? {};
        set({ activity: { ...get().activity, [plotId]: { ...seen, siteClicks: (seen.siteClicks ?? 0) + 1 } } });
      },

      // What the owner says about their business (up to 160 characters).
      setPlotDescription: (plotId, text) => {
        const plot = get().plots.find((p) => p.id === plotId);
        if (!plot?.userClaimed) return false;
        set({ plots: get().plots.map((p) => (p.id === plotId ? { ...p, description: String(text ?? '').trim().slice(0, 160) || undefined } : p)), ...toast('Description saved.') });
        return true;
      },

      // Change the roof banner of a plot you own.
      setPlotLogo: (plotId, logo) => {
        const clean = cleanLogo(logo);
        const plot = get().plots.find((p) => p.id === plotId);
        if (!clean || !plot?.userClaimed) return false;
        set({ plots: get().plots.map((p) => (p.id === plotId ? { ...p, logo: clean } : p)), ...toast('Roof banner updated.') });
        return true;
      },

      // Change the outside of a building you own (floors, shape, colours, rooftop feature): it shows in the city at once.
      setPlotExterior: (plotId, config) => {
        const plot = get().plots.find((p) => p.id === plotId);
        if (!plot?.userClaimed) return false;
        const patch = applyExterior(plot, config, plot.buildingType);
        set({ plots: get().plots.map((p) => (p.id === plotId ? { ...p, ...patch } : p)), ...toast('The outside of your building is updated.') });
        return true;
      },

      // Hot-potato buyout of a business you don't own (blueprint: the 1.25x buyout). The previous
      // owner is paid 1.25x the plot's value, logged in the plot's Hall of Fame, and moves into the
      // next free house in Old Town (the "suburban downgrade"); with no free house they retire.
      // Returns { price, movedTo } or null if the plot can't be taken over.
      takeOverPlot: (plotId, ownerName, title, website, buildingType = 'shop', variant = null, logo = null, description = '', exterior = null) => {
        if (!cleanLogo(logo)) return null;
        const state = get();
        const plot = state.plots.find((p) => p.id === plotId);
        if (!plot || !plot.owner || plot.userClaimed || plot.admin || plot.districtId === SUBURB_ID) return null;

        const price = Math.round(plot.value * TAKEOVER_MULTIPLIER);
        const home = state.plots.find((p) => p.districtId === SUBURB_ID && !p.owner);
        const entry = { owner: plot.owner, title: plot.title, paidOut: price, movedTo: home ? home.id : null };

        set({
          plots: state.plots.map((p) => {
            if (p.id === plot.id) {
              const business = { ...p, ...asPlayerBusiness(ownerName, title, website, buildingType, p, variant, logo, description) };
              return {
                ...business,
                ...(exterior ? applyExterior(business, exterior, buildingType) : { exterior: undefined }),
                value: price,
                history: [entry, ...(p.history ?? [])],
                takeovers: (p.takeovers ?? 0) + 1,
              };
            }
            if (home && p.id === home.id) {
              return {
                ...p,
                owner: plot.owner,
                title: `${plot.owner}'s house`,
                website: null,
                buildingType: 'house',
                category: 'Suburb',
                height: 0.9,
                color: '#a8a29e',
                value: Math.max(p.value, 30),
                interiorData: { rooms: 1, theme: 'house', variant: 'cottage', floors: 1 },
                brand: null,
                retiredFrom: { title: plot.title, plotId: plot.id, paidOut: price },
              };
            }
            return p;
          }),
          selectedPlot: null,
          ...toast(
            `You took over ${plot.title} for $${price.toLocaleString()}. ${plot.owner} was paid out${home ? ' and moved to Old Town' : ' and retired'}.`
          ),
        });
        return { price, movedTo: home ? home.id : null };
      },

      // --- billboards -----------------------------------------------------------------------
      recordBillboardView: (id) => (hooks.onAdView?.(id), set((state) => ({ billboards: updateBillboard(state.billboards, id, (b) => ({ views: b.views + 1 })) }))),
      recordBillboardClick: (id) => (hooks.onAdClick?.(id), set((state) => ({ billboards: updateBillboard(state.billboards, id, (b) => ({ clicks: b.clicks + 1 })) }))),

      // Looking at an ad long enough pays out Gold, once per billboard.
      completeBillboardQuest: (id) =>
        set((state) =>
          state.completedQuests[id]
            ? state
            : {
                gold: state.gold + BILLBOARD_QUEST_GOLD,
                completedQuests: { ...state.completedQuests, [id]: true },
                ...toast(`Quest complete! +${BILLBOARD_QUEST_GOLD} Gold`),
              }
        ),

      // Hot-potato buyout: anyone can take the slot for 1.25x its value. The displaced advertiser is
      // cashed out at that profit and moves to the slot's Hall of Fame; the new campaign starts at zero.
      buyBillboard: (id, ad) =>
        set((state) => ({
          billboards: updateBillboard(state.billboards, id, (b) => {
            const price = Math.round(b.value * BILLBOARD_BUYOUT_MULTIPLIER);
            return {
              ad: { ...ad, color: isHex(ad?.color) ? ad.color : '#6366f1' }, // a colour that is not a plain #rrggbb would not draw
              userBought: true, // you hold this slot (the dashboard lists it)
              value: price,
              views: 0,
              clicks: 0,
              history: b.ad ? [{ advertiser: b.ad.advertiser, headline: b.ad.headline, paidOut: price }, ...b.history] : b.history,
            };
          }),
        })),

      // Share a slot's screen time: another advertiser's ad joins the rotation (up to MAX_SHARERS), for SHARE_PRICE of the slot's value. Returns the price or null.
      shareBillboard: (id, ad) => {
        const b = get().billboards.find((x) => x.id === id);
        if (!b || !b.ad || (b.ads ?? []).length >= MAX_SHARERS) return null;
        const price = Math.round(b.value * SHARE_PRICE);
        const clean = { ...ad, color: isHex(ad?.color) ? ad.color : '#6366f1', mine: true };
        set({ billboards: updateBillboard(get().billboards, id, (x) => ({ ads: [...(x.ads ?? []), clean] })), ...toast(`${clean.advertiser} now shares ${b.roadName}.`) });
        return price;
      },
      // The owner (or the sharer) ends a share: removes the shared ad at `index`.
      unshareBillboard: (id, index) => set({ billboards: updateBillboard(get().billboards, id, (x) => ({ ads: (x.ads ?? []).filter((_, i) => i !== index) })) }),

      // --- storefronts ------------------------------------------------------------------------
      // Claim a business's coupon: one per player per business, limited stock, and never your own.
      claimCoupon: (plotId) => {
        const state = get();
        const plot = businessById(state, plotId);
        const coupon = plot?.brand?.coupon;
        if (!coupon) return { ok: false, reason: 'none' };
        if (plot.userClaimed) return { ok: false, reason: 'own' };
        if (state.redeemed[plotId]) return { ok: true, code: state.redeemed[plotId], already: true };
        if (coupon.claimed >= coupon.total) return { ok: false, reason: 'gone' };
        set({
          ...patchBusiness(state, plotId, (p) => ({ ...p, brand: { ...p.brand, coupon: { ...coupon, claimed: coupon.claimed + 1 } } })),
          redeemed: { ...state.redeemed, [plotId]: coupon.code },
          ...toast(`Coupon claimed: ${coupon.text}`),
        });
        return { ok: true, code: coupon.code };
      },

      // The visit reward: once per business, and never on your own (that would just print Gold).
      completeBrandQuest: (plotId) => {
        const state = get();
        const plot = businessById(state, plotId);
        const quest = plot?.brand?.quest;
        if (!quest || plot.userClaimed || state.brandQuests[plotId]) return 0;
        set({
          gold: state.gold + quest.gold,
          brandQuests: { ...state.brandQuests, [plotId]: true },
          ...toast(`${quest.label}: +${quest.gold} Gold`),
        });
        return quest.gold;
      },

      // Let the owner set up their storefront. Video and game links go through toEmbedUrl, so only
      // known services are ever embedded. Returns { ok: true } or { ok: false, errors: { field: message } }.
      setBrand: (plotId, input) => {
        const state = get();
        const plot = state.plots.find((p) => p.id === plotId);
        if (!plot || !plot.userClaimed) return { ok: false, errors: { form: 'You can only edit your own business.' } };

        const errors = {};
        const video = toEmbedUrl('video', input.videoUrl);
        if (!video.ok) errors.videoUrl = video.error;
        const game = toEmbedUrl('game', input.gameUrl);
        if (!game.ok) errors.gameUrl = game.error;

        let coupon = null;
        const text = String(input.couponText ?? '').trim();
        if (text) {
          const total = Math.floor(Number(input.couponTotal));
          const code = String(input.couponCode ?? '').trim() || `${plot.title.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'VV'}-${plot.id}`;
          if (text.length > 80) errors.couponText = 'Keep the offer under 80 characters.';
          if (!(total >= 1 && total <= 500)) errors.couponTotal = 'Between 1 and 500 coupons.';
          if (!/^[A-Za-z0-9-]{3,16}$/.test(code)) errors.couponCode = '3-16 letters, numbers or dashes.';
          coupon = { code, text, total, claimed: plot.brand?.coupon?.claimed ?? 0 };
        }

        let quest = null;
        if (input.questOn) {
          const seconds = Math.floor(Number(input.questSeconds));
          const gold = Math.floor(Number(input.questGold));
          if (!(seconds >= 10 && seconds <= 120)) errors.questSeconds = 'Between 10 and 120 seconds.';
          if (!(gold >= 1 && gold <= 50)) errors.questGold = 'Between 1 and 50 Gold.';
          quest = { label: 'Visit and look around', seconds, gold };
        }

        if (Object.keys(errors).length) return { ok: false, errors };
        const brand = { video: video.url ? { url: video.url, service: video.service } : null, game: game.url ? { url: game.url, service: game.service } : null, coupon, quest };
        set({ plots: state.plots.map((p) => (p.id === plotId ? { ...p, brand } : p)), ...toast('Storefront saved') });
        return { ok: true };
      },

      // --- daily loop -----------------------------------------------------------------------
      // The mystery chest: one per day, somewhere on a sidewalk (see dailyChest).
      openDailyChest: () => {
        const state = get();
        if (!state.day || state.daily.chestDay === state.day) return 0;
        const chest = dailyChest(state.layout.intersections, state.layout.seed, state.day);
        if (!chest) return 0;
        set({
          gold: state.gold + chest.gold,
          daily: { ...state.daily, chestDay: state.day },
          ...toast(`Daily chest: +${chest.gold} Gold`),
        });
        return chest.gold;
      },

      // The scavenger hunt: three stars a day (see scavengerHunt). Returns the Gold paid.
      collectHuntStar: (index) => {
        const state = get();
        if (!state.day) return 0;
        const found = state.daily.huntDay === state.day ? state.daily.huntFound : [];
        if (found.includes(index)) return 0;
        const now = [...found, index];
        const all = now.length >= HUNT_COUNT;
        const gold = HUNT_GOLD + (all ? HUNT_BONUS : 0);
        if (all) hooks.onHuntComplete?.(state.day); // (with a server: it earns a Building of the Week vote)
        set({
          gold: state.gold + gold,
          daily: { ...state.daily, huntDay: state.day, huntFound: now },
          ...toast(all ? `All ${HUNT_COUNT} stars found: +${gold} Gold` : `Gold star ${now.length} of ${HUNT_COUNT}: +${gold} Gold`),
        });
        return gold;
      },

      // --- spending Gold --------------------------------------------------------------------
      buyCosmetic: (id) => {
        const item = COSMETIC_BY_ID[id];
        const state = get();
        if (!item || state.owned[id] || state.gold < item.price) return false;
        set({
          gold: state.gold - item.price,
          owned: { ...state.owned, [id]: true },
          appearance: item.slot === 'emote' ? state.appearance : { ...state.appearance, [item.slot]: id },
          ...toast(`Bought ${item.name}`),
        });
        return true;
      },

      equipCosmetic: (id) => {
        const item = COSMETIC_BY_ID[id];
        const state = get();
        if (!item || item.slot === 'emote' || !state.owned[id]) return;
        set({ appearance: { ...state.appearance, [item.slot]: id } });
      },

      // A sponsored raffle: costs Gold and mostly pays less (see RAFFLE_PRIZES). Returns the prize,
      // or null when the player can't afford a ticket.
      enterRaffle: (roll = Math.random()) => {
        const state = get();
        if (state.gold < RAFFLE_COST) return null;
        const prize = drawRafflePrize(roll);
        set({ gold: state.gold - RAFFLE_COST + prize, ...toast(prize ? `Raffle win: +${prize} Gold!` : 'No luck this time.') });
        return prize;
      },
    }),
    {
      name: 'voxelventure-save',
      version: 3,
      // Older saves are still usable. The city is regenerated from the saved seed, and merge() (below) only keeps
      // the saved plots, quests and coupons if every plot lines up (same id and position). The city changed
      // shape in v3 (diagonal avenue, circles, luxury estates, more plots), so an older save keeps its Gold,
      // outfit and daily progress but gets a fresh city.
      migrate: (saved) => saved,
      // Hydrated from a client effect (apps/web/app/page.jsx), so the first client render matches the server's.
      skipHydration: true,
      partialize: (s) => ({
        seed: s.layout.seed,
        plots: s.plots,
        billboards: s.billboards,
        gold: s.gold,
        completedQuests: s.completedQuests,
        owned: s.owned,
        appearance: s.appearance,
        daily: s.daily,
        redeemed: s.redeemed,
        brandQuests: s.brandQuests,
        reservedDesigns: s.reservedDesigns,
        fishing: s.fishing,
        activity: s.activity,
        mallStores: (s.layout.malls ?? []).flatMap((m) => m.stores).filter((st) => st.userClaimed), // the stores the player rents
      }),
      // The city itself is regenerated from the saved seed; only what the player changed is restored,
      // and only if it still lines up with what that seed generates (the generator may have changed).
      merge: (saved, current) => {
        if (!saved || typeof saved.seed !== 'number') {
          // no saved game: the city is the generated one, unless the city editor left edits for it (development only: "Open in the game")
          const edits = loadEdits();
          if (edits && edits.seed === current.layout.seed) {
            const edited = generateWorld(current.layout.seed);
            return { ...current, plots: edited.plots, billboards: edited.billboards, layout: edited.layout };
          }
          return current;
        }
        const designs = devToolsOn() && saved.reservedDesigns && typeof saved.reservedDesigns === 'object' ? saved.reservedDesigns : {};
        const city = generateWorld(saved.seed, { designs });
        // plots from a site designer have ids of their own and sit after the city's; the rest must line up as before
        const savedBase = Array.isArray(saved.plots) ? saved.plots.filter((p) => !p.designSite) : [];
        const cityBase = city.plots.filter((p) => !p.designSite);
        const sameCity =
          Array.isArray(saved.plots) &&
          savedBase.length === cityBase.length &&
          savedBase.every((p, i) => p.id === cityBase[i].id && p.gridX === cityBase[i].gridX && p.gridZ === cityBase[i].gridZ && p.x === cityBase[i].x && p.z === cityBase[i].z) &&
          Array.isArray(saved.billboards) &&
          saved.billboards.length === city.billboards.length &&
          saved.billboards.every((b, i) => b.id === city.billboards[i].id);
        const savedDesigned = new Map(saved.plots?.filter?.((p) => p.designSite).map((p) => [p.id, p]) ?? []);
        const mergedPlots = [...savedBase, ...city.plots.filter((p) => p.designSite).map((p) => savedDesigned.get(p.id) ?? p)];
        // the stores the player rents are put back into the malls (only if the city is the same one)
        const rented = new Map((sameCity && Array.isArray(saved.mallStores) ? saved.mallStores : []).map((st) => [st.id, st]));
        const layout = rented.size ? { ...city.layout, malls: city.layout.malls.map((m) => ({ ...m, stores: m.stores.map((st) => rented.get(st.id) ?? st) })) } : city.layout;
        return {
          ...current,
          layout,
          reservedDesigns: designs,
          fishing: { caught: {}, day: null, goldToday: 0, ...saved.fishing },
          activity: saved.activity && typeof saved.activity === 'object' ? saved.activity : {},
          plots: sameCity ? mergedPlots : city.plots,
          billboards: sameCity ? saved.billboards : city.billboards,
          gold: saved.gold ?? current.gold,
          completedQuests: sameCity ? saved.completedQuests ?? {} : {},
          owned: { ...DEFAULT_OWNED, ...saved.owned },
          appearance: { ...DEFAULT_APPEARANCE, ...saved.appearance },
          daily: { ...current.daily, ...saved.daily },
          // coupons and visit rewards belong to plots, so they only carry over if the plots did
          redeemed: sameCity ? saved.redeemed ?? {} : {},
          brandQuests: sameCity ? saved.brandQuests ?? {} : {},
        };
      },
    }
  )
);
