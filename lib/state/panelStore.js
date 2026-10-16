import { create } from 'zustand';

// The one side panel that every toolbar button opens into. `view` is what it shows (null: closed), `history` the
// views to go back to. A plot, park or ad-space view comes from selecting something in the city; the others
// from the toolbar. Where you dragged the panel and whether it is expanded are remembered.
export const VIEWS = {
  directory: 'Directory',
  account: 'Account',
  dashboard: 'My businesses',
  city: 'City map & guide',
  stats: 'Statistics',
  search: 'Search',
  places: 'Places',
  online: 'Online',
  chat: 'Chat',
  play: 'Today & quests',
  wardrobe: 'Wardrobe',
  plot: 'Building',
  park: 'Park',
  billboard: 'Ad space',
  reserved: 'Sites & market',
  mall: 'Mega mall',
  credits: 'Credits',
};
// views that show the thing selected in the city (and go away when it is deselected)
export const SELECTION_VIEWS = ['plot', 'park', 'billboard'];

const KEY = 'voxelventure-panel';
const save = (state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ pos: state.pos, expanded: state.expanded, open: state.view === 'city' || state.view === 'directory' ? state.view : null }));
  } catch {
    /* storage unavailable: the panel just won't remember */
  }
};

export const usePanel = create((set, get) => ({
  view: null,
  history: [],
  expanded: false,
  pos: null, // { x, y } once it has been dragged
  ready: false,
  mallId: null, // the mall whose directory is showing
  reservedId: null, // the reserved site the designer is showing (development only)

  // Read what was remembered (after mount, so the server render matches). On a computer the city guide opens first.
  hydrate: () => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      /* ignore */
    }
    const wide = window.matchMedia('(min-width: 640px)').matches;
    const firstVisit = saved === null;
    set({
      ready: true,
      pos: saved?.pos ?? null,
      expanded: Boolean(saved?.expanded),
      view: wide && (firstVisit || saved?.open === 'directory') ? 'directory' : wide && saved?.open === 'city' ? 'city' : null,
    });
  },

  open: (view) => {
    const { view: current, history } = get();
    if (current === view) return;
    // selection views are not worth going back to
    const keep = current && !SELECTION_VIEWS.includes(current) ? [...history, current].slice(-8) : history;
    set({ view, history: keep });
    save(get());
  },
  openMall: (id) => {
    set({ mallId: id });
    get().open('mall');
  },
  editReserved: (id) => {
    set({ reservedId: id });
    get().open('reserved');
  },
  back: () => {
    const { history } = get();
    if (!history.length) set({ view: null });
    else set({ view: history[history.length - 1], history: history.slice(0, -1) });
    save(get());
  },
  close: () => {
    set({ view: null, history: [] });
    save(get());
  },
  toggle: (view) => (get().view === view ? get().close() : get().open(view)),
  toggleExpanded: () => {
    set({ expanded: !get().expanded });
    save(get());
  },
  setPos: (pos) => {
    set({ pos });
    save(get());
  },
}));
