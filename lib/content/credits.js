import { MUSIC_RELEASES } from './music';

// Who made what in the game, and under which licence: the in-game Credits panel shows this list, and CREDITS.md
// says the same in long form (tests/credits.test.mjs checks every entry here is named there too).
// Adding music or any other outside asset? Add it here and to CREDITS.md before it ships.
export const CREDITS = [
  {
    section: 'Music & sound',
    entries: [
      ...MUSIC_RELEASES.map((r) => ({ name: r.title, by: r.artist, url: r.source, license: 'CC0', licenseUrl: r.licenseUrl, note: 'Public-domain recording; commercial use permitted.' })),
      {
        name: 'City music and soundscape',
        by: 'VoxelVenture',
        note: 'Original procedural ambience and fallback tunes, made live by your browser.',
      },
    ],
  },
  {
    section: '3D models',
    entries: [
      {
        name: 'City Kit (Commercial & Suburban), Nature, Car, Watercraft, Pirate and Coaster kits',
        by: 'Kenney',
        url: 'https://www.kenney.nl',
        license: 'CC0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        note: 'Buildings, trees, cars, boats, piers and the amusement park.',
      },
      {
        name: 'Interior items and materials',
        by: 'Pascal Editor (Pascal Group Inc.)',
        url: 'https://github.com/pascalorg/editor',
        license: 'MIT',
        licenseUrl: 'https://opensource.org/license/mit',
        note: 'Doors, windows and furniture inside buildings.',
      },
      {
        name: 'Voxel landmarks',
        by: 'VoxelVenture',
        note: 'Made for this game.',
      },
    ],
  },
  {
    section: 'Map data',
    entries: [
      {
        name: 'Real street names (when turned on)',
        by: 'OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL 1.0',
        licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      },
    ],
  },
  {
    section: 'Built with',
    entries: [
      {
        name: 'Next.js, React, three.js, React Three Fiber and drei, Tailwind CSS, zustand, Lucide icons',
        by: 'their open-source contributors',
        license: 'MIT / ISC',
      },
    ],
  },
];
