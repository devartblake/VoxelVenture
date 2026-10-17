// CC0 recordings hosted locally. Evidence and download hashes: public/audio/music/manifest.json.
export const MUSIC_RELEASES = [
  {
    "id": "happy-chiptunes",
    "title": "Happy Chiptunes (Collection)",
    "artist": "Holizna",
    "source": "https://opengameart.org/content/happy-chiptunes-collection",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/happy-chiptunes/Happy Chiptunes/03 HoliznaCC0 - Adventure Begins Loop.mp3",
      "/audio/music/happy-chiptunes/Happy Chiptunes/06 HoliznaCC0 - Sunny Afternoon.mp3",
      "/audio/music/happy-chiptunes/Happy Chiptunes/06 HoliznaCC0 - Where It's Safe.mp3",
      "/audio/music/happy-chiptunes/Happy Chiptunes/12 HoliznaCC0 - NPC Theme.mp3"
    ]
  },
  {
    "id": "sideways-city",
    "title": "Sideways City",
    "artist": "Zane Little Music",
    "source": "https://opengameart.org/content/sideways-city",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/sideways-city.wav"
    ]
  },
  {
    "id": "wednesday-night",
    "title": "Wednesday Night",
    "artist": "Zane Little Music",
    "source": "https://opengameart.org/content/wednesday-night-funk-fusion",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/wednesday-night.ogg"
    ]
  },
  {
    "id": "barriers",
    "title": "Barriers",
    "artist": "Zane Little Music",
    "source": "https://opengameart.org/content/barriers",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/barriers.mp3"
    ]
  },
  {
    "id": "funked-up",
    "title": "Funked Up",
    "artist": "Joth",
    "source": "https://opengameart.org/content/funked-up",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/funked-up.mp3"
    ]
  },
  {
    "id": "moil",
    "title": "Moil",
    "artist": "Ruskerdax",
    "source": "https://opengameart.org/content/moil",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/moil.mp3"
    ]
  },
  {
    "id": "fusion-jazz",
    "title": "(Basically not) Fusion Jazz",
    "artist": "Spring Spring",
    "source": "https://opengameart.org/content/basically-not-fusion-jazz",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/fusion-jazz.ogg"
    ]
  },
  {
    "id": "funk-collection",
    "title": "Funk (Collection)",
    "artist": "Holizna",
    "source": "https://opengameart.org/content/funk-collection",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "files": [
      "/audio/music/funk-collection/Funk ( Collection )/01 HoliznaCC0 - Eat.mp3.mp3",
      "/audio/music/funk-collection/Funk ( Collection )/02 HoliznaCC0 - Sleep.mp3",
      "/audio/music/funk-collection/Funk ( Collection )/03 HoliznaCC0 - Breath.mp3",
      "/audio/music/funk-collection/Funk ( Collection )/04 HoliznaCC0 - Make Money.mp3",
      "/audio/music/funk-collection/Funk ( Collection )/05 HoliznaCC0 - Make Love.mp3",
      "/audio/music/funk-collection/Funk ( Collection )/06 HoliznaCC0 - Make Funk.mp3"
    ]
  }
];
const tracks = (...ids) => ids.flatMap((id) => MUSIC_RELEASES.find((r) => r.id === id)?.files ?? []);
export const MUSIC_PLAYLISTS = {
  city: tracks('wednesday-night', 'sideways-city'),
  night: tracks('moil'),
  arcade: tracks('happy-chiptunes'),
  jazz: tracks('fusion-jazz'),
  driving: tracks('barriers', 'funked-up', 'funk-collection'),
};

// Reuse existing zones; music mute applies to every recording, including vehicle radio.
export function recordedMusicChoice(mix, { musicOn = true, driving = false, sky } = {}) {
  if (!musicOn) return null;
  if (driving) return { playlist: 'driving', layer: 'music', level: 0.45 };
  const arcade = mix.local.arcade ?? 0;
  const jazz = mix.local.jazz ?? 0;
  if (Math.max(arcade, jazz) > Math.max(0.12, mix.music)) {
    const layer = arcade >= jazz ? 'arcade' : 'jazz';
    return { playlist: layer, layer, level: Math.max(arcade, jazz) * 0.5 };
  }
  if (mix.music <= 0.02) return null;
  const night = (sky?.lamps ?? 0) > 0.85 || (sky?.sun?.intensity ?? 1.5) < 0.05;
  return { playlist: night ? 'night' : 'city', layer: 'music', level: mix.music * 0.5 };
}
