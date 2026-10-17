import { create } from 'zustand';

// The business whose inside is being redesigned in the editor, so the furniture menu can start from what that kind of business needs
// (lib/content/businessFixtures.js). Set by apps/web/components/interior/InteriorEditor.jsx; empty on the stand-alone /editor page.
export const useEditingBusiness = create(() => ({ type: null, variant: null, plotId: null, value: 0 }));
