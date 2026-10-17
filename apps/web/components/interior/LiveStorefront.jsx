"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Coins, EyeOff, Film, Gamepad2, Gift, Mail, MessageSquare, Pencil, Timer } from 'lucide-react';
import { EMBED_SANDBOX } from '@/lib/content/embeds';
import { ApiFailure } from '@/lib/data/api';
import { claimCouponRemote, redeemCouponRemote, completeQuestRemote, fetchStorefront, fundQuestRemote, hideFeedbackRemote, postFeedbackRemote, saveStorefront, startQuestRemote, subscribeRemote } from '@/lib/data/sync';
import { useAccount } from '@/lib/state/accountStore';
import { useCityStore } from '@/lib/state/store';
import ReportButton from '@/components/ui/ReportButton';

const INPUT = 'w-full rounded border border-sx-stroke bg-sx-alt px-2.5 py-1.5 text-xs text-white focus:border-sx-cyan focus:outline-none';
const Err = ({ children }) => (children ? <p className="mt-0.5 text-[11px] text-rose-400">{children}</p> : null);
const Section = ({ icon: Icon, title, tone = 'text-slate-300', children }) => (
  <section className="rounded-xl border border-sx-stroke bg-sx-alt/40 p-3">
    <h4 className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      <Icon className="h-3.5 w-3.5" /> {title}
    </h4>
    {children}
  </section>
);

// Runs an action that needs an account: opens the sign-in form first if nobody is signed in, then carries on.
const withAccount = (run) => {
  if (useAccount.getState().ask(run)) run();
};

function Embed({ kind, embed }) {
  const [loaded, setLoaded] = useState(false);
  const Icon = kind === 'game' ? Gamepad2 : Film;
  return (
    <div className="overflow-hidden rounded-xl border border-sx-stroke bg-sx-panel">
      {loaded ? (
        <iframe src={embed.url} title={kind === 'game' ? 'Game demo' : 'Video'} sandbox={EMBED_SANDBOX} referrerPolicy="no-referrer" allow="fullscreen" allowFullScreen loading="lazy" className={`w-full border-0 ${kind === 'game' ? 'aspect-[4/3]' : 'aspect-video'}`} />
      ) : (
        <button onClick={() => setLoaded(true)} className="flex w-full flex-col items-center gap-1.5 px-3 py-5 text-xs text-slate-300 hover:bg-sx-alt">
          <Icon className="h-6 w-6 text-sx-cyan" />
          <span className="font-medium text-white">{kind === 'game' ? 'Play the demo' : 'Watch the video'}</span>
          <span className="text-[11px] text-slate-500">Loads from {embed.service}</span>
        </button>
      )}
    </div>
  );
}

// The coupon: one per visitor, limited stock, the code is only shown once it is yours, with a ticket the owner marks redeemed at the till.
function Coupon({ data, reload }) {
  const [code, setCode] = useState(data.myCoupon);
  const [ticket, setTicket] = useState(data.myTicket);
  const [msg, setMsg] = useState('');
  const c = data.brand.coupon;
  const left = c.total - c.claimed;
  const claim = () => claimCouponRemote(data.plotId).then((r) => { setCode(r.code); setTicket(r.ticket); reload(); }).catch((e) => setMsg(e.message));
  return (
    <Section icon={Gift} title="Offer" tone="text-amber-300">
      <p className="text-sm text-white">{c.text}</p>
      <p className="mb-2 text-[11px] text-slate-500">{c.claimed} of {c.total} claimed</p>
      {data.own ? (
        <>
          <p className="text-[11px] text-slate-400">This is your coupon (code <span className="font-mono text-slate-200">{c.code}</span>). Visitors claim it here.</p>
          <RedeemTicket plotId={data.plotId} />
        </>
      ) : code ? (
        <div className="rounded border border-dashed border-amber-500/60 bg-amber-950/30 px-3 py-1.5 text-center font-mono text-sm text-amber-300">
          {code}
          {ticket && <span className="block text-[10px] text-amber-200/80">Ticket #{ticket}{data.myCouponRedeemed ? ' · used' : ''}: show it when you use the coupon</span>}
        </div>
      ) : left > 0 ? (
        <button onClick={claim} className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500">Claim coupon</button>
      ) : (
        <p className="text-xs text-slate-500">All the coupons have been claimed.</p>
      )}
      <Err>{msg}</Err>
    </Section>
  );
}

// The owner marks a claimed coupon used, by the ticket the visitor shows (it counts as a redemption in the business's figures).
function RedeemTicket({ plotId }) {
  const [ticket, setTicket] = useState('');
  const [msg, setMsg] = useState('');
  const redeem = (e) => {
    e.preventDefault();
    redeemCouponRemote(plotId, ticket).then(() => (setMsg(`Ticket #${ticket.toUpperCase()} marked used.`), setTicket(''))).catch((err) => setMsg(err.message));
  };
  return (
    <form onSubmit={redeem} className="mt-2 flex flex-wrap gap-1.5">
      <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Ticket, e.g. 7KQ2A9" aria-label="Coupon ticket" maxLength={9} className="min-w-0 flex-1 rounded border border-sx-stroke bg-sx-alt px-2 py-1 font-mono text-xs text-white" />
      <button type="submit" disabled={!ticket.trim()} className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-40">Mark used</button>
      {msg && <p className="basis-full text-[11px] text-slate-300" role="status">{msg}</p>}
    </form>
  );
}

// The visit quest: the server keeps the clock and pays the Gold out of the business's own budget.
function Quest({ data, reload }) {
  const q = data.brand.quest;
  const account = useAccount((s) => s.account);
  const [state, setState] = useState(data.questDone ? 'done' : 'idle'); // idle | running | done | empty
  const [seconds, setSeconds] = useState(0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data.own || state !== 'idle' || !q.active || !account) return;
    startQuestRemote(data.plotId).then((r) => setState(r.done ? 'done' : 'running')).catch(() => {});
  }, [data.own, data.plotId, state, q.active, account]);
  useEffect(() => {
    if (state !== 'running') return undefined;
    const t = setInterval(() => !document.hidden && setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => {
    if (state !== 'running' || seconds < q.seconds) return;
    completeQuestRemote(data.plotId).then((r) => { setState(r.paid > 0 ? 'done' : 'empty'); reload(); }).catch((e) => { setMsg(e.message); if (e.code === 'too_early') setSeconds(q.seconds - 3); else setState('done'); });
  }, [seconds, state, q.seconds, data.plotId, reload]);

  return (
    <Section icon={Timer} title={q.label} tone="text-amber-300">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Stay {q.seconds} seconds</span>
        <span className="flex items-center gap-1 font-mono text-amber-400"><Coins className="h-3.5 w-3.5" />{q.gold}</span>
      </div>
      {data.own ? (
        <p className="text-[11px] text-slate-400">Visitors earn {q.gold} Credits each, paid from the quest budget ({q.budget} Credits left{q.active ? '' : ': the quest has stopped, add Credits to restart it'}). You cannot earn it from your own business.</p>
      ) : !q.active ? (
        <p className="text-[11px] text-slate-500">This quest has stopped: the business has run out of Credits to pay visitors.</p>
      ) : !account ? (
        <button onClick={() => withAccount(() => setState('idle'))} className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 text-xs font-medium text-white hover:brightness-110">Sign in to earn {q.gold} Credits</button>
      ) : (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-sx-panel"><div className="h-full bg-amber-400 transition-all" style={{ width: `${state === 'done' ? 100 : Math.min(100, (seconds / q.seconds) * 100)}%` }} /></div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            {state === 'done' ? <><Check className="h-3 w-3 text-green-400" /> Done. The Credits are in your wallet.</> : state === 'empty' ? 'The business ran out of Credits just before you finished.' : `${Math.max(0, q.seconds - seconds)} s left.`}
          </p>
        </>
      )}
      <Err>{msg}</Err>
    </Section>
  );
}

// The feedback board: visitors with an account leave a note; the owner can hide a message.
function Board({ data, reload }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const post = (e) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    withAccount(() => postFeedbackRemote(data.plotId, text).then(() => { setText(''); setMsg(''); reload(); }).catch((err) => setMsg(err.message)));
  };
  return (
    <Section icon={MessageSquare} title="Feedback board">
      <form onSubmit={post} className="mb-2 flex gap-1.5">
        <input value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Tell them what you think" className={INPUT} aria-label="Feedback" />
        <button type="submit" className="shrink-0 rounded bg-gradient-to-r from-sx-purple to-sx-blue px-3 text-xs font-medium text-white hover:brightness-110">Post</button>
      </form>
      <Err>{msg}</Err>
      {data.feedback.length === 0 ? (
        <p className="text-[11px] text-slate-500">No feedback yet. Be the first.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.feedback.map((f) => (
            <li key={f.id} className={`rounded-lg bg-sx-panel/80 p-2 text-[11px] ${f.hidden ? 'opacity-50' : ''}`}>
              <span className="flex items-center justify-between text-slate-400">
                <span className="font-semibold text-slate-200">{f.author}</span>
                <span className="flex items-center gap-2">
                  {f.daysAgo === 0 ? 'today' : `${f.daysAgo} d ago`}
                  {!f.mine && !data.own && <ReportButton kind="feedback" id={f.id} />}
                  {data.own && (
                    <button onClick={() => hideFeedbackRemote(data.plotId, f.id, !f.hidden).then(reload)} title={f.hidden ? 'Show again' : 'Hide this message'} aria-label={f.hidden ? 'Show message' : 'Hide message'} className="rounded p-0.5 hover:bg-sx-alt">
                      <EyeOff className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </span>
              <span className="mt-0.5 block text-slate-300">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// Visitors leave an email to hear from this business. They get a confirmation first (double opt-in).
function GetUpdates({ plot }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  return (
    <Section icon={Mail} title="Get updates">
      {state ? (
        <p className="text-[11px] text-green-400">{state}</p>
      ) : (
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); subscribeRemote({ kind: 'plot', id: plot.id }, email, 'storefront').then((r) => setState(r.status === 'confirmed' ? 'You are already signed up.' : 'Check your inbox to confirm.')).catch((err) => setState(err.message)); }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className={INPUT} aria-label="Email for updates" />
          <button type="submit" className="shrink-0 rounded bg-gradient-to-r from-sx-purple to-sx-blue px-3 text-xs font-medium text-white hover:brightness-110">Join</button>
        </form>
      )}
      <p className="mt-1 text-[10px] text-slate-500">We email you once to confirm. Nothing is sent until you do.</p>
    </Section>
  );
}

// The owner edits the offers and funds the quest.
function Editor({ data, reload, done }) {
  const b = data.brand;
  const [form, setForm] = useState({ videoUrl: b.video?.url ?? '', gameUrl: b.game?.url ?? '', couponText: b.coupon?.text ?? '', couponCode: b.coupon?.code ?? '', couponTotal: b.coupon?.total ?? 10, questOn: Boolean(b.quest), questSeconds: b.quest?.seconds ?? 30, questGold: b.quest?.gold ?? 10 });
  const [errors, setErrors] = useState({});
  const [topUp, setTopUp] = useState(20);
  const [note, setNote] = useState('');
  const wallet = useAccount((s) => s.account?.gold ?? 0);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = (e) => {
    e.preventDefault();
    saveStorefront(data.plotId, form).then(() => { setErrors({}); reload(); done(); }).catch((err) => setErrors(err.errors ?? { form: err.message }));
  };
  return (
    <div className="space-y-2.5">
      <form onSubmit={save} className="space-y-2.5">
        <label className="block text-[11px] text-slate-400">Video (YouTube or Vimeo link)<input className={INPUT} value={form.videoUrl} onChange={set('videoUrl')} /><Err>{errors.videoUrl}</Err></label>
        <label className="block text-[11px] text-slate-400">Game demo (itch.io embed link)<input className={INPUT} value={form.gameUrl} onChange={set('gameUrl')} /><Err>{errors.gameUrl}</Err></label>
        <div className="space-y-1.5 rounded-lg border border-sx-stroke p-2.5">
          <span className="text-[11px] font-medium text-slate-300">Coupon</span>
          <input className={INPUT} value={form.couponText} onChange={set('couponText')} placeholder="What visitors get (blank = no coupon)" />
          <div className="flex gap-2"><input className={INPUT} value={form.couponCode} onChange={set('couponCode')} placeholder="Code (optional)" /><input className={INPUT} type="number" min="1" max="500" value={form.couponTotal} onChange={set('couponTotal')} title="How many coupons" /></div>
          <Err>{errors.couponTotal || errors.couponCode}</Err>
        </div>
        <div className="space-y-1.5 rounded-lg border border-sx-stroke p-2.5">
          <label className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><input type="checkbox" checked={form.questOn} onChange={set('questOn')} /> Pay visitors Gold to look around</label>
          {form.questOn && <div className="flex gap-2"><label className="flex-1 text-[11px] text-slate-400">Seconds<input className={INPUT} type="number" min="10" max="120" value={form.questSeconds} onChange={set('questSeconds')} /></label><label className="flex-1 text-[11px] text-slate-400">Credits each<input className={INPUT} type="number" min="1" max="50" value={form.questGold} onChange={set('questGold')} /></label></div>}
          <Err>{errors.questSeconds || errors.questGold}</Err>
        </div>
        <Err>{errors.form}</Err>
        <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue py-1.5 text-xs font-medium text-white hover:brightness-110">Save storefront</button>
      </form>
      {b.quest && (
        <div className="space-y-1.5 rounded-lg border border-amber-900/50 bg-amber-950/20 p-2.5">
          <p className="text-[11px] text-slate-300">Quest budget: <strong className="text-amber-300">{b.quest.budget} Credits</strong> ({Math.floor(b.quest.budget / b.quest.gold)} visitors). Your wallet: {wallet} Credits.</p>
          <div className="flex gap-2">
            <input className={INPUT} type="number" min="1" value={topUp} onChange={(e) => setTopUp(e.target.value)} aria-label="Credits to add to the budget" />
            <button onClick={() => fundQuestRemote(data.plotId, topUp).then(() => { setNote('Added.'); reload(); }).catch((e) => setNote(e.message))} className="shrink-0 rounded bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-500">Add Credits</button>
          </div>
          <Err>{note}</Err>
        </div>
      )}
    </div>
  );
}

// The storefront of a business when there is a game server: offers, quest, feedback board and sign-ups come from the server.
export default function LiveStorefront({ plotId }) {
  const plot = useCityStore((s) => s.plots.find((p) => p.id === plotId) ?? s.layout.malls?.flatMap((m) => m.stores).find((x) => x.id === plotId));
  const account = useAccount((s) => s.account);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const numeric = typeof plotId === 'number';
  const reload = useCallback(() => fetchStorefront(plotId).then((d) => { setData(d); setError(''); }).catch((e) => setError(e instanceof ApiFailure && e.status === 0 ? 'The game server cannot be reached.' : 'No storefront here.')), [plotId]);
  useEffect(() => {
    if (numeric) reload();
  }, [reload, numeric, account?.id]);
  if (!plot) return null;
  if (!numeric) return null; // mall stores belong to the mall: they use the local storefront

  return (
    <aside className="flex max-h-[45%] w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-sx-alt bg-sx-page/60 p-4 sm:max-h-none sm:w-80 sm:border-l sm:border-t-0">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Storefront</h3>
        {data?.own && (
          <button onClick={() => setEditing((e) => !e)} className="flex items-center gap-1 rounded border border-sx-stroke px-2 py-0.5 text-[11px] text-slate-200 hover:bg-sx-alt">
            <Pencil className="h-3 w-3" /> {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-slate-500">{error}</p>}
      {data && (editing ? (
        <Editor data={data} reload={reload} done={() => setEditing(false)} />
      ) : (
        <>
          {data.brand.coupon && <Coupon key={`${data.plotId}-${data.myCoupon}`} data={data} reload={reload} />}
          {data.brand.quest && <Quest key={`${data.plotId}-${account?.id}`} data={data} reload={reload} />}
          {data.brand.video && <Embed kind="video" embed={data.brand.video} />}
          {data.brand.game && <Embed kind="game" embed={data.brand.game} />}
          {!data.brand.coupon && !data.brand.quest && !data.brand.video && !data.brand.game && (
            <p className="text-xs text-slate-500">{data.own ? 'Nothing here yet. Press Edit to add a coupon, a video, a game demo or a visit reward.' : 'This business has no offers right now.'}</p>
          )}
          <Board data={data} reload={reload} />
          {!data.own && <GetUpdates plot={plot} />}
        </>
      ))}
    </aside>
  );
}
