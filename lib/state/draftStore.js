import { create } from 'zustand';

// The building a player is setting up on an empty lot, drawn in the city while they choose (apps/web/components/city/DraftBuilding.jsx): `plot` is the lot with the
// choices applied, or null. It lives only while the claim form is open; nothing is saved until they claim.
export const useDraft = create(() => ({ plot: null }));
