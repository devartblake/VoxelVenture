import { ApiError, fail, getPlot, requireAccount } from './core.mjs';
import { transaction } from './db.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// Redesigned interiors: the owner's own inside of their building, kept here so every visitor sees it (GET /plots/:id/interior) and it
// survives a change of device. The checks are the game's own (lib/content/interiorDesign.js); this is the part that needs the database.
//   - Reading is public. Writing is the plot's owner's only: the same rule as the storefront and the outside (owner_account is the account).
//   - Every save names the revision it was based on; an older one is refused (409), so two tabs never overwrite each other unseen.
//   - A design belongs to the owner who saved it. A claim or a take-over removes it (core.mjs), and one saved by any other account than
//     today's owner is treated as no design at all, so a new owner never inherits, and never shows, the last owner's furniture.
//   - A lease that has ended stops the editing: in its 3 grace days and after them, the tenant (still the owner until someone takes the plot
//     over) can no longer change the inside, only renew; visitors still see the design. Renewing gives the editing back. The lease emails say
//     so (community.mjs sendLeaseNotices).
const { cleanDesign, roomForPlot, DESIGN_VERSION, MAX_BODY_BYTES } = await imp('content/interiorDesign.js');
const { leaseState } = await imp('game/leases.js');
export { MAX_BODY_BYTES }; // the largest PUT body the server reads
const now = () => Date.now();

// The plot's design as everybody sees it: { plotId, version, design, revision, updatedAt }. design null: the generated interior.
function current(db, plot) {
  const row = db.prepare('SELECT * FROM plot_interiors WHERE plot_id = ?').get(plot.id);
  if (!row || !plot.owner_account || row.account_id !== plot.owner_account) return { row: null, view: { plotId: plot.id, version: DESIGN_VERSION, design: null, revision: 0, updatedAt: null } };
  return { row, view: { plotId: plot.id, version: DESIGN_VERSION, design: row.design ? JSON.parse(row.design) : null, revision: row.revision, updatedAt: row.updated_at } };
}

export const getInterior = (db, plotId) => current(db, getPlot(db, plotId)).view;

function ownPlot(db, account, plotId) {
  requireAccount(account);
  const plot = getPlot(db, plotId);
  if (!plot.owner_account || plot.owner_account !== account.id) fail(403, 'Only the owner can change the inside of this building.', 'forbidden');
  if (['grace', 'open'].includes(leaseState(plot.lease_end, now(), plot.lease_days))) fail(403, 'The lease on this building has ended. Renew it to change the inside again.', 'lease_ended');
  return plot;
}
// the revision a change was based on must still be the current one
function sameRevision(input, revision) {
  const based = input?.revision;
  if (!Number.isInteger(based) || based < 0) fail(400, 'Say which revision of the design this change is based on (0 for none).', 'bad_revision');
  if (based !== revision) throw new ApiError(409, 'This interior was changed somewhere else (another tab or device) since you opened it. Reload it to see that version, then make your changes again.', 'stale_revision');
}

// PUT /plots/:id/interior { design, revision }: the owner publishes a design. Returns the new state.
export function saveInterior(db, account, plotId, input) {
  return transaction(db, () => {
    const plot = ownPlot(db, account, plotId);
    const { row, view } = current(db, plot);
    sameRevision(input, view.revision);
    const facts = JSON.parse(plot.facts);
    let design;
    try {
      design = cleanDesign(input?.design, roomForPlot({ buildingType: plot.building_type, variant: plot.variant, prime: facts.prime, luxury: facts.luxury, grand: facts.grand }));
    } catch (e) {
      if (e.status) fail(e.status, e.message, e.code);
      throw e;
    }
    // the revision only ever goes up, also over a row left by an earlier owner (which counts as revision 0 to the new one)
    const revision = (row ?? db.prepare('SELECT revision FROM plot_interiors WHERE plot_id = ?').get(plot.id))?.revision + 1 || 1;
    const at = now();
    db.prepare('INSERT INTO plot_interiors (plot_id, account_id, design, revision, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(plot_id) DO UPDATE SET account_id = excluded.account_id, design = excluded.design, revision = excluded.revision, updated_at = excluded.updated_at')
      .run(plot.id, account.id, JSON.stringify(design), revision, at);
    return { plotId: plot.id, version: DESIGN_VERSION, design, revision, updatedAt: at };
  });
}

// DELETE /plots/:id/interior { revision }: back to the generated interior. The row stays (design NULL) so the revision keeps going up.
export function deleteInterior(db, account, plotId, input = {}) {
  return transaction(db, () => {
    const plot = ownPlot(db, account, plotId);
    const { view } = current(db, plot);
    if (input.revision !== undefined) sameRevision(input, view.revision);
    if (!view.design) return view;
    const at = now();
    db.prepare('UPDATE plot_interiors SET design = NULL, revision = revision + 1, updated_at = ? WHERE plot_id = ?').run(at, plot.id);
    return { plotId: plot.id, version: DESIGN_VERSION, design: null, revision: view.revision + 1, updatedAt: at };
  });
}
