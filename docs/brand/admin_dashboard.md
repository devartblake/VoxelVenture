# Admin dashboard

[Brand](README.md) · [All documentation](../README.md)

The staff pages under `/admin` (`apps/web/app/admin/`) are drawn in the **SynaptixPlay** palette, the same one as the game's side panel and the business pages. How sign-in and the API calls work is in [backend.md, "Admin sign-in"](../architecture/backend.md#admin-sign-in-servicesapiadminmjs).

## Layout

- **The frame:** `components/admin/AdminShell.jsx` draws it for every signed-in page. The sign-in check, `useAdmin()` and `SafeForm` live in the same file.
- **Sidebar (1024 px and wider):** the Double-V mark with the "Voxel Venture / Admin" wordmark, then the pages in groups:
  - **Live:** Monitor
  - **Business:** Pilot, Economy, Promo codes
  - **Settings:** Admins, Account
- **The current page:** marked with `aria-current="page"`, a cyan-to-purple bar on the left, a purple wash and a cyan icon.
- **Promo codes:** `/admin/promos` is listed before the page exists. Until it does, the link is a 404.
- **Adding a page:** put an entry in `ADMIN_NAV`.
- **Top bar:**
  - the page's name;
  - a live indicator, when the page sets one with `useAdmin().setLive({ tone, label, short, pulse })`. The monitor shows "Live · 3 connected", and red when the presence server is down;
  - who is signed in (`data-testid="admin-user"`);
  - Sign out (`data-testid="admin-sign-out"`).
- **Phones (under 1024 px):** the top bar has a menu button (`data-testid="admin-menu"`) instead of the sidebar. It opens the same navigation in a drawer (`data-testid="admin-drawer"`). The drawer is a modal dialog:
  - it is drawn into `document.body`, because inside the blurred top bar `position: fixed` would be relative to the bar;
  - the page behind is `inert` while it is open;
  - Tab stays inside it, and Escape or the backdrop closes it;
  - the focus starts on the current page and goes back to the menu button afterwards.
- **Sign-in and setup:** `/admin/login` and `/admin/setup` have no frame. They are one card in the middle of the dark gradient page (`AdminCard`), with the mark at 72 px and the endorsement "A Theoretical Minds Technologies Game" under the card.
- **Scrolling:** the page never scrolls sideways. Wide tables scroll inside their card, and keep their heading row in view.

## Components (`components/admin/ui.jsx`)

| Component | What it is |
| --- | --- |
| `PageHeader` | Eyebrow (the nav group), the `h1`, a line of description, actions on the right |
| `Card`, `Section` | Glassy panel: `rounded-2xl border-sx-stroke bg-sx-panel/80 backdrop-blur`. `Section` adds a heading row (an `h2` with an icon, a description, actions). `glow` gives the purple halo |
| `StatCard` | A figure: label, big tabular number, icon in a tinted square, a hint, an optional `delta` (`{ value, direction, good }`) and an optional `trend` (a sparkline) |
| `DataTable` | `columns` (`key`, `header`, `title` tooltip, `align: 'right'` for figures, `render`), `rows`, `rowKey`, `empty`, `renderAfter` (a details row), `rowClassName`. Sticky header, zebra rows, hover highlight, scrolls in its own box |
| `Badge`, `StatusPill` | A small label in a tone (`neutral`, `cyan`, `purple`, `gold`, `green`, `amber`, `red`). `StatusPill` adds a dot, which pulses for live things |
| `Button` | `primary` (violet to blue gradient with a soft purple glow), `secondary` (outline), `ghost`, `danger`. `href` makes it a link. 44 px tall on phones, `size="sm"` is 32 px on desktop |
| `Field`, `Input`, `Select`, `Checkbox` | Labelled inputs on the page colour, cyan border and ring on focus. `Field`'s `hint` (for example the password rule) is linked to the input with `aria-describedby` |
| `Tabs` | WAI-ARIA tabs: arrow keys, Home and End. The selected tab carries the gradient |
| `Sparkline`, `Meter` | Plain SVG trend line, and a bar with `role="meter"`. No chart library |
| `Alert` | `error` (`role="alert"`), `success`, `warn`, `info` (`role="status"`), with an icon |
| `BrandMark`, `Wordmark` | The Double-V mark (64 or 192 px export) and the "Voxel Venture / Admin" lockup |

`AdminShell.jsx` re-exports `Field`, and has `FormError` (an `Alert`, `data-testid="admin-form-error"`) and `Submit` (a full-width primary button).

## Palette tokens (`apps/web/app/globals.css`, `@theme`)

| Token | Value | Used for |
| --- | --- | --- |
| `sx-page` | `#050816` | Page and body background (with a faint purple and cyan radial glow) |
| `sx-panel` | `#101529` | Cards, sidebar, top bar (at 70–85 %) |
| `sx-alt` | `#151b33` | Table header, zebra rows, hover, secondary buttons |
| `sx-stroke` | `#27314f` | Card and table borders |
| `sx-line` | `#38456b` | Input and button outlines |
| `sx-cyan` | `#22d3ee` | Focus ring, links, live things, the active icon |
| `sx-blue` / `sx-purple` | `#3b82f6` / `#8b5cf6` | The active nav item and tab, glows, icons. The primary button runs one step darker (`from-violet-600 to-blue-600`), so its white label passes AA (5.2:1 or more; on the `sx-` pair it would be 3.7:1) |
| `sx-gold` | `#fbbf24` | Money (revenue, quotes) |
| `sx-text` / `sx-muted` | `#f8fafc` / `#94a3b8` | Text, secondary text |

- **Status colours:** Tailwind's emerald (met, active), amber (not yet, slow, disabled) and red (errors).
- **Contrast:** secondary text is `sx-muted`, never `slate-500`. It is 7.0:1 on the panel and 7.8:1 on the page; cyan on the panel is 10:1.

## Accessibility

- **Focus:** a 2 px cyan focus ring on every control (`.admin-root :focus-visible`).
- **Skip link:** "Skip to content" goes to `<main id="admin-main">`.
- **Landmarks:** `nav` "Admin pages", one `main`, `h1` per page, `h2` per section.
- **Motion:** `prefers-reduced-motion` stops the pulse, the drawer's slide and the transitions.
- **Tap targets:** 44 px on phones.
- **Selecting text:** the admin pages can be selected and copied, unlike the city page.
