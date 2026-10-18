# Voxel Venture Logo Usage Guide

**Brand:** Voxel Venture  
**Parent company:** Theoretical Minds Technologies  
**Endorsement:** “A Theoretical Minds Technologies Game”  
**Version:** 1.0 — October 18, 2026

## 1. Purpose

This guide explains how to use the three coordinated Voxel Venture logo concepts across the game, website, social platforms, presentations, promotional material, and repository assets.

The identity is designed to communicate four ideas:

- a navigable voxel city;
- exploration and discovery;
- real business opportunity;
- ownership by Theoretical Minds Technologies.

The logos use a shared palette of deep navy, electric violet, cyan, and warm gold. Navy and violet communicate technology and imagination; cyan suggests digital navigation; gold identifies opportunity, discovery, and premium commercial value.

## 2. Logo family

### Logo 1 — City Gateway promotional badge

**Visual:** A detailed voxel city rising above the Voxel Venture wordmark, with an illuminated gateway and gold path.

**Primary role:** Promotional and high-impact brand artwork.

Use it for:

- game loading and launch screens;
- store or product-listing artwork;
- event displays;
- social announcements;
- promotional posters;
- press-kit covers;
- large presentation title slides;
- merchandise where sufficient print area is available.

Avoid using it for:

- favicons;
- small navigation bars;
- tiny mobile headers;
- dense interface screens;
- one-color applications without a separately prepared monochrome version.

The detailed city and endorsement need sufficient space. At small sizes, use the Double-V monogram instead.

**Recommended filename:** `voxel-venture-logo-promotional.png`

### Logo 2 — Double-V monogram

**Visual:** Two interlocking voxel-style V forms creating a city gateway around a central gold discovery cube.

**Primary role:** Compact brand identifier.

Use it for:

- app and progressive-web-app icons;
- browser favicon;
- social-media avatar;
- loading indicator or splash-screen emblem;
- game launcher icon;
- profile image;
- watermark;
- small merchandise applications;
- internal product icons where Voxel Venture must be identified quickly.

The monogram may appear without the full name when the surrounding context already identifies Voxel Venture. On first contact, pair it with the full wordmark or nearby product name.

**Recommended filename:** `voxel-venture-mark.png`

### Logo 3 — Horizontal corporate lockup

**Visual:** The voxel-city gateway emblem on the left, the Voxel Venture wordmark on the right, and the Theoretical Minds Technologies endorsement below.

**Primary role:** Official corporate and product logo.

Use it for:

- the Voxel Venture website header;
- the business directory header or footer;
- merchant onboarding material;
- sponsorship proposals;
- press releases;
- company presentations;
- partnership documents;
- business cards and email signatures;
- repository and project documentation;
- legal or corporate product identification.

This should be treated as the default full logo because it clearly connects the game to Theoretical Minds Technologies.

**Recommended filename:** `voxel-venture-logo-horizontal.png`

## 3. Recommended brand hierarchy

Use the following hierarchy consistently:

1. **Official full logo:** Horizontal corporate lockup.
2. **Compact identity:** Double-V monogram.
3. **Promotional artwork:** City Gateway badge.

The public product name is **Voxel Venture**. The endorsement should read exactly:

> A Theoretical Minds Technologies Game

Do not shorten the endorsement to “TMT Game” in formal or first-contact material. A shortened form may be considered later only after Theoretical Minds Technologies has a separately established and recognizable corporate mark.

If the registered legal company name differs from the public-facing “Theoretical Minds Technologies” name, use the registered legal name in contracts, terms, copyright notices, invoices, and other legally binding locations. The logo endorsement may continue using the approved public-facing brand name.

## 4. Placement rules

### Website

- Use the horizontal corporate lockup in the primary header on desktop.
- Use the Double-V monogram in compact mobile navigation.
- Include the full product name as accessible text when only the monogram is visible.
- Use the City Gateway badge on landing-page hero sections only when it does not compete with the primary call to action.
- Keep the public business-directory pages lightweight; do not load the largest logo asset when a smaller optimized version will work.

### Game and loading experience

- Use the City Gateway badge on the initial loading or welcome screen.
- Use the Double-V monogram for short loading states, reconnect states, and compact overlays.
- Use the horizontal corporate lockup on the About, Credits, and Legal screens.
- Do not position the detailed badge over an equally detailed 3D city background without a darkened or blurred separation layer.

### Social media

- Use the Double-V monogram as the account avatar.
- Use the City Gateway badge or horizontal lockup in banner graphics.
- Keep important logo elements inside each platform’s safe area.
- Do not rely on endorsement text in a tiny avatar; place the parent-company connection in the profile biography and banner instead.

### Business and investor material

- Use the horizontal corporate lockup on the title page.
- Use the Double-V monogram as a small footer mark on subsequent pages.
- Use the City Gateway badge sparingly on covers, section dividers, or demonstration pages.
- Maintain the endorsement when material is being shown to merchants, sponsors, investors, or partners.

### Repository and technical documentation

- Store production-ready brand assets under `public/brand/`.
- Place source or master exports under `design/brand/` only if the repository is intended to retain design sources.
- Use an optimized horizontal logo in the root README.
- Keep licensing and generation provenance in `CREDITS.md` or an accompanying brand-assets record.
- Avoid embedding very large images directly into multiple documentation pages.

Recommended repository structure:

```text
public/
└── brand/
    ├── voxel-venture-logo-horizontal.png
    ├── voxel-venture-logo-horizontal-dark.png
    ├── voxel-venture-logo-promotional.png
    ├── voxel-venture-mark.png
    ├── voxel-venture-mark-512.png
    ├── voxel-venture-mark-192.png
    ├── voxel-venture-mark-64.png
    └── voxel-venture-mark-32.png

design/
└── brand/
    ├── README.md
    ├── masters/
    └── exports/
```

Do not add the `design/brand/` directory unless editable master files or approved production exports will actually be maintained there.

## 5. Clear space

Maintain clear space around every logo.

- For the full logos, use at least the height of the central gold cube as clearance on all sides.
- For the Double-V monogram, use at least one-half of the gold cube’s width as clearance.
- Do not place text, buttons, borders, character artwork, or other logos inside this protected area.
- Increase the clearance when the surrounding scene is visually busy.

## 6. Minimum size

These are initial practical guidelines and should be validated after final production exports are prepared.

| Asset | Digital minimum | Print minimum |
| --- | ---: | ---: |
| Horizontal corporate lockup | 360 px wide | 90 mm wide |
| City Gateway badge | 280 px wide | 70 mm wide |
| Double-V monogram | 32 px square | 10 mm square |

Below these sizes, fine details and endorsement text may become unreadable. When the available width is below 360 pixels, use the monogram plus accessible or nearby text instead of shrinking the full lockup excessively.

## 7. Background use

The transparent assets can be placed over light or dark interfaces, but contrast must be checked in context.

### Preferred backgrounds

- deep navy;
- near-black blue;
- clean white or very light neutral gray;
- restrained violet-to-navy surfaces;
- softly blurred city imagery with a dark overlay.

### Avoid

- highly saturated cyan or gold backgrounds that erase the logo accents;
- detailed imagery directly behind the wordmark;
- backgrounds with insufficient contrast around the navy edges;
- checkerboard or patterned surfaces;
- colors that visually change the gold discovery cube into a warning symbol.

Prepare separate light-background and dark-background exports if the current edge treatment does not provide sufficient contrast.

## 8. Color guidance

The generated artwork contains dimensional color and lighting, so the final production palette should be sampled and standardized during vector refinement.

Recommended working palette:

| Role | Suggested color | Hex |
| --- | --- | --- |
| Foundation navy | Deep technical background | `#071A3D` |
| Electric violet | Imagination and game identity | `#7138E8` |
| Digital cyan | Navigation and connected technology | `#16C8F4` |
| Opportunity gold | Discovery and premium value | `#F5B82E` |
| Light wordmark | High-contrast text | `#F4F8FF` |

These values are starting standards, not a claim that every pixel in the generated logos uses those exact colors.

## 9. Accessibility

- Provide meaningful alternative text when the logo conveys identity.
- Use empty alternative text when the logo is decorative and the product name is already present as text.
- Do not use the logo itself as the only page heading.
- Ensure controls containing only the monogram have an accessible name.
- Do not depend on violet, cyan, or gold alone to communicate state.
- Respect reduced-motion preferences if the mark is animated.
- Avoid rapid glow, flicker, or strobing effects.

Suggested alternative text:

- Full logo: `Voxel Venture — A Theoretical Minds Technologies Game`
- Monogram in a linked header: `Voxel Venture home`
- Decorative promotional badge: empty alternative text, `alt=""`

## 10. Favicon and app-icon preparation

Use the Double-V monogram for all compact icons.

Prepare:

- `favicon.ico` containing 16, 32, and 48 pixel sizes;
- 32×32 PNG favicon;
- 180×180 Apple touch icon;
- 192×192 PWA icon;
- 512×512 PWA icon;
- maskable 512×512 icon with extra safe-area padding.

For very small versions:

- reduce glow and tiny edge details;
- enlarge the central gold cube slightly;
- preserve the Double-V silhouette;
- test at actual 16×16 and 32×32 display sizes;
- do not add the words “Voxel Venture.”

## 11. Image optimization

Keep an archival transparent PNG of each approved logo. Produce optimized WebP or AVIF versions for large website placements when browser support and visual quality are verified.

Recommended practices:

- retain the transparent master PNG;
- remove unnecessary transparent padding;
- export at approximately twice the intended CSS display size for high-density screens;
- use responsive image sizing for the promotional badge;
- avoid upscaling small exports;
- record pixel dimensions and file sizes;
- test transparency over both light and dark surfaces.

Long-term, commission or create a manually refined SVG version. Generated raster artwork should not automatically be traced and treated as a finished vector logo without correcting paths, spacing, symmetry, typography, and small-size readability.

## 12. Co-branding with Theoretical Minds Technologies

Voxel Venture is a product brand owned and presented by Theoretical Minds Technologies.

### Product-first situations

Use the Voxel Venture logo most prominently when addressing:

- players;
- visitors;
- business owners using the directory;
- merchants customizing or managing a listing;
- the game’s social audience.

Retain the parent-company endorsement in About, Credits, Legal, press, partnership, and merchant-onboarding material.

### Company-first situations

When Voxel Venture appears inside a Theoretical Minds Technologies portfolio or company presentation:

- place the corporate identity first;
- present Voxel Venture as a product or game title;
- use the horizontal lockup once;
- use the monogram for repeated references.

Do not visually imply that Theoretical Minds Technologies is a third-party sponsor. It is the responsible parent company.

## 13. Tagline usage

Recommended primary tagline:

> Explore the city. Discover the business.

The tagline is optional and should not be permanently fused into the logo artwork. Keeping it separate allows it to change by audience and campaign.

Alternative approved directions:

- Where businesses become destinations.
- Real businesses. Virtual destinations.
- Build presence. Create discovery.
- A new world for local discovery.

Use only one tagline at a time. Do not position a tagline between the product name and the parent-company endorsement.

## 14. Prohibited treatments

Do not:

- distort, stretch, rotate, or skew the logos;
- rearrange the emblem and wordmark without an approved lockup;
- change individual colors arbitrarily;
- remove “Technologies” from the endorsement;
- place effects over the logo that obscure its silhouette;
- add cryptocurrency, casino, gambling, or speculative-investment imagery;
- imitate Minecraft branding or typography;
- place the detailed badge at favicon size;
- recreate the wordmark using an unrelated font;
- use the generated images as proof of trademark availability;
- provide external parties with unrestricted editable masters without approval.

## 15. Production-readiness checklist

Before adopting one concept as the permanent identity:

- [ ] Confirm the public parent-company name and registered legal-company wording.
- [ ] Perform a trademark and confusing-similarity search.
- [ ] Select the final primary logo and monogram.
- [ ] Manually refine typography and spacing.
- [ ] Prepare true vector masters in SVG, PDF, or EPS.
- [ ] Produce light, dark, full-color, one-color, and grayscale versions.
- [ ] Test the monogram at favicon size.
- [ ] Test the horizontal lockup on desktop and mobile headers.
- [ ] Verify endorsement readability.
- [ ] Create a maskable app icon.
- [ ] Record generation and ownership provenance.
- [ ] Add approved assets and credits to the repository.
- [ ] Update website metadata, Open Graph images, favicon, PWA manifest, README, About, Credits, and press materials.
- [ ] Protect master assets from accidental recompression or replacement.

## 16. Recommended implementation order

1. Adopt the horizontal corporate lockup as the official full logo.
2. Adopt the Double-V monogram as the official compact mark.
3. Retain the City Gateway badge as promotional artwork.
4. Confirm the exact corporate endorsement wording.
5. Refine the selected logos into clean vector masters.
6. Export the required responsive and app-icon sizes.
7. Add the assets under `public/brand/`.
8. Update the website header, metadata, favicon, PWA manifest, Credits, About, and repository README in one reviewed branding PR.
9. Verify accessibility, light/dark contrast, mobile layout, and page-performance impact.
10. Publish a compact brand kit for approved company and partner use.

## 17. Final recommendation

Use the **horizontal corporate lockup** as Voxel Venture’s official full identity, the **Double-V monogram** as the compact icon, and the **City Gateway badge** as promotional artwork.

This combination gives Voxel Venture a recognizable game identity while clearly establishing that it is created and operated by Theoretical Minds Technologies.
