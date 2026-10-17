import Link from 'next/link';
import { timeLeft } from '@/lib/game/buildingOfWeek';

// Building of the Week on the Discover page (data: getBuildingOfWeek in lib/business/source.js): the winner, this week's leaders with their
// votes, when voting closes, and the way to vote (in the 3D city, or on a business's page).
const hrefOf = (t) => (t.slug ? `/business/${t.slug}` : `/b/${t.plotId}`); // a building with no business page opens in the city

export default function WeekFeature({ week }) {
  if (!week || (!week.winner && !week.leaders.length)) return null;
  const most = Math.max(1, ...week.leaders.map((l) => l.votes));
  return (
    <section aria-labelledby="botw" className="mb-8 rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/10 via-sx-panel to-sx-panel p-5" data-testid="week-feature">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="botw" className="text-lg font-semibold text-white">Building of the Week</h2>
        <p className="text-sm text-yellow-200/80">Voting closes in {timeLeft(week.endsAt)}</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-yellow-300">This week's winner</p>
          {week.winner ? (
            <>
              <Link href={hrefOf(week.winner)} className="mt-1 block text-xl font-bold text-white hover:underline">{week.winner.title}</Link>
              <p className="mt-1 text-sm text-slate-300">{week.winner.votes} vote{week.winner.votes === 1 ? '' : 's'} last week</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-300">None yet: the first is chosen when this week's voting closes.</p>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Leading this week</p>
          {week.leaders.length === 0 ? (
            <p className="text-sm text-slate-400">No votes yet this week.</p>
          ) : (
            <ol className="space-y-2">
              {week.leaders.map((l, i) => (
                <li key={l.plotId}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`w-5 text-center font-bold ${i === 0 ? 'text-yellow-300' : 'text-slate-500'}`}>{i + 1}</span>
                    <Link href={hrefOf(l)} className="min-w-0 flex-1 truncate text-slate-100 hover:underline">{l.title}</Link>
                    <span className="font-mono text-slate-300">{l.votes}</span>
                  </div>
                  <div className="ml-7 mt-1 h-1 overflow-hidden rounded-full bg-sx-alt" aria-hidden="true">
                    <div className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-500" style={{ width: `${(l.votes / most) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href="/?panel=week" className="inline-flex min-h-11 items-center rounded-xl bg-yellow-400 px-4 font-semibold text-yellow-950 hover:brightness-110">Vote in the 3D city</Link>
        <p className="text-sm text-slate-400">Every player has a vote each week; finding the three gold stars earns one more. You can also vote on a business's page.</p>
      </div>
      {week.demo && <p className="mt-3 text-xs text-slate-500">Demo: these votes are made up for the sample city.</p>}
    </section>
  );
}
