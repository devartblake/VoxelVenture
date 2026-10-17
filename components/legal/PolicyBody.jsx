import { POLICY_STATUS } from '@/lib/legal/policies';

// Renders a policy's sections (lib/legal/policies.js). While the policies are drafts, [placeholders] are highlighted and the "For review"
// notes are shown; an approved policy has neither.
const draft = POLICY_STATUS.status !== 'approved';

function Text({ children }) {
  const text = String(children);
  if (!draft) return text;
  // highlight [placeholders] so a reviewer cannot miss them
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <mark key={i} className="rounded bg-amber-400/20 px-1 text-amber-200">{part}</mark>
    ) : (
      part
    ),
  );
}

function Block({ block }) {
  if (typeof block === 'string') return <p className="text-slate-300"><Text>{block}</Text></p>;
  if (block.list)
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-slate-300">
        {block.list.map((item, i) => <li key={i}><Text>{item}</Text></li>)}
      </ul>
    );
  if (block.table)
    return (
      <>
        {/* on a phone each row is a small card: a three-column table does not fit */}
        <dl className="space-y-2 sm:hidden">
          {block.table.rows.map((row, i) => (
            <div key={i} className="rounded-xl border border-sx-stroke bg-sx-panel p-3 text-sm">
              <dt className="font-medium text-slate-100"><Text>{row[0]}</Text></dt>
              {row.slice(1).map((cell, j) => (
                <dd key={j} className="mt-1 text-slate-300">
                  <span className="text-xs uppercase tracking-wide text-sx-muted">{block.table.head[j + 1]}: </span>
                  <Text>{cell}</Text>
                </dd>
              ))}
            </div>
          ))}
        </dl>
        <TableView table={block.table} />
      </>
    );
  if (block.review)
    return draft ? (
      <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-testid="review-note">
        <span className="font-semibold">For review: </span>
        {block.review}
      </p>
    ) : null;
  return null;
}

// From a tablet up: a real table.
function TableView({ table }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-sx-stroke sm:block">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="bg-sx-alt text-xs uppercase tracking-wide text-sx-muted">
          <tr>{table.head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t border-sx-stroke/60 align-top">
              {row.map((cell, j) => <td key={j} className={`px-3 py-2 ${j === 0 ? 'font-medium text-slate-100' : 'text-slate-300'}`}><Text>{cell}</Text></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PolicyBody({ policy }) {
  return (
    <div className="space-y-8">
      <nav aria-label="On this page" className="rounded-xl border border-sx-stroke bg-sx-panel p-4 text-sm">
        <p className="mb-2 font-semibold text-white">On this page</p>
        <ol className="grid gap-1 sm:grid-cols-2">
          {policy.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-sx-cyan hover:underline">{s.heading}</a></li>)}
        </ol>
      </nav>
      {policy.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-4 space-y-3">
          <h2 id={`${s.id}-h`} className="text-xl font-semibold text-white">{s.heading}</h2>
          {s.blocks.map((b, i) => <Block key={i} block={b} />)}
        </section>
      ))}
    </div>
  );
}

// The banner every page shows while the policies are drafts.
export function DraftBanner() {
  if (!draft) return null;
  return (
    <p className="mb-6 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" role="note" data-testid="draft-banner">
      <span className="font-semibold">Draft for legal review, not yet in force.</span> This describes how VoxelVenture works today, but it has not been reviewed by a lawyer. Highlighted [items] still need filling in.
    </p>
  );
}
