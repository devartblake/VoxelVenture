// Tools for building the game, not for playing it (the reserved-site editor). They exist only in development:
// `next build` replaces process.env.NODE_ENV with "production", so a release has none of them, and the
// generator and the store also ignore any saved design when this is false.
export const devToolsOn = () => process.env.NODE_ENV !== 'production';
