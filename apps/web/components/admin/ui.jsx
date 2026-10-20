"use client";

import React, { useId, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

// The admin dashboard's building blocks (docs/brand/admin_dashboard.md), in the SynaptixPlay palette (the --color-sx-* tokens of
// apps/web/app/globals.css): glassy panels on the deep navy page, cyan for focus and live things, the purple-to-blue gradient for the main
// action, gold for money and attention. Every admin page is made of these, so a new one (e.g. /admin/promos) looks the same with no CSS
// of its own: PageHeader, Card / Section, StatCard, DataTable, Badge / StatusPill, Button, Field / Input / Select / Checkbox, Tabs,
// Sparkline / Meter, Alert.

export const cx = (...parts) => parts.filter(Boolean).join(' ');

// ---- the brand
export function BrandMark({ size = 32, className = '' }) {
  return <Image src={size > 48 ? '/brand/voxel-venture-mark-192.png' : '/brand/voxel-venture-mark-64.png'} alt="" width={size} height={size} unoptimized priority className={cx('shrink-0', className)} />;
}
export function Wordmark({ className = '' }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <BrandMark size={34} />
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight text-white">Voxel Venture</span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-sx-cyan">Admin</span>
      </span>
    </span>
  );
}

// ---- layout
export function PageHeader({ title, description, actions, eyebrow, icon: Icon }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sx-cyan">{eyebrow}</p>}
        <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {Icon && <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-sx-cyan sm:h-7 sm:w-7" />}
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-sx-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ as: Tag = 'div', className = '', glow = false, children, ...rest }) {
  return (
    <Tag className={cx('min-w-0 rounded-2xl border border-sx-stroke bg-sx-panel/80 shadow-xl shadow-black/20 backdrop-blur', glow && 'border-sx-purple/40 shadow-[0_0_40px_-12px_var(--color-sx-purple)]', className)} {...rest}>
      {children}
    </Tag>
  );
}

// A card with a heading row (an h2, an optional line under it, actions on the right) and its body.
export function Section({ title, description, actions, icon: Icon, children, className = '', bodyClassName = 'p-4 sm:p-5', id }) {
  const auto = useId();
  const headingId = id ?? `section-${auto.replace(/:/g, '')}`;
  return (
    <Card as="section" aria-labelledby={headingId} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-sx-stroke px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold text-white">
            {Icon && <Icon aria-hidden="true" className="h-4 w-4 text-sx-cyan" />}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-sx-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

// ---- figures
const TONES = {
  cyan: { icon: 'bg-sx-cyan/10 text-sx-cyan ring-sx-cyan/25', line: 'var(--color-sx-cyan)' },
  purple: { icon: 'bg-sx-purple/15 text-violet-300 ring-sx-purple/30', line: 'var(--color-sx-purple)' },
  blue: { icon: 'bg-sx-blue/15 text-blue-300 ring-sx-blue/30', line: 'var(--color-sx-blue)' },
  gold: { icon: 'bg-sx-gold/10 text-sx-gold ring-sx-gold/25', line: 'var(--color-sx-gold)' },
  green: { icon: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25', line: '#34d399' },
  red: { icon: 'bg-red-400/10 text-red-300 ring-red-400/25', line: '#f87171' },
  amber: { icon: 'bg-amber-400/10 text-amber-300 ring-amber-400/25', line: '#fbbf24' },
};

// A figure: the label, a big number, an optional line under it (`hint`), a change (`delta`: { value: '+12%', direction: 'up' | 'down' |
// 'flat', good: true | false }) and a small trend line (`trend`: numbers, oldest first).
export function StatCard({ label, value, hint, icon: Icon, tone = 'cyan', delta, trend, footer, className = '', title, ...rest }) {
  const t = TONES[tone] ?? TONES.cyan;
  return (
    <Card className={cx('relative flex flex-col gap-2 overflow-hidden p-4', className)} title={title} {...rest}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium leading-snug text-sx-muted">{label}</p>
        {Icon && (
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1', t.icon)}>
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">{value}</p>
        {trend && trend.length > 1 && <Sparkline values={trend} color={t.line} className="mb-1 h-8 w-20 shrink-0" />}
      </div>
      {(hint || delta) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sx-muted">
          {delta && <Delta {...delta} />}
          {hint}
        </p>
      )}
      {footer}
    </Card>
  );
}

function Delta({ value, direction = 'flat', good }) {
  const ok = good ?? direction === 'up';
  const tone = direction === 'flat' ? 'bg-sx-alt text-sx-muted' : ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold tabular-nums', tone)}><span aria-hidden="true" className="text-[9px]">{arrow}</span>{value}</span>;
}

// A trend line in plain SVG (no chart library): numbers, oldest first, scaled to the box. Decorative: the figure itself is in the text.
export function Sparkline({ values, color = 'var(--color-sx-cyan)', className = 'h-8 w-24' }) {
  const id = useId().replace(/:/g, '');
  const vs = values.map((v) => (Number.isFinite(v) ? v : 0));
  const max = Math.max(...vs), min = Math.min(...vs, 0);
  const span = max - min || 1;
  const pts = vs.map((v, i) => [(i / Math.max(1, vs.length - 1)) * 100, 28 - ((v - min) / span) * 24]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${line} 100,30`} fill={`url(#spark-${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// A horizontal bar: `value` of `max`, with an accessible label.
export function Meter({ value, max = 1, label, tone = 'cyan', className = '' }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const fill = { cyan: 'from-sx-blue to-sx-cyan', purple: 'from-sx-purple to-sx-blue', gold: 'from-amber-500 to-sx-gold', green: 'from-emerald-600 to-emerald-400' }[tone] ?? 'from-sx-blue to-sx-cyan';
  return (
    <span role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className={cx('block h-2 overflow-hidden rounded-full bg-sx-alt ring-1 ring-inset ring-sx-stroke', className)}>
      <span className={cx('block h-full rounded-full bg-gradient-to-r', fill)} style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }} />
    </span>
  );
}

// ---- labels
const BADGE = {
  neutral: 'bg-sx-alt text-slate-200 ring-sx-line',
  cyan: 'bg-sx-cyan/10 text-cyan-200 ring-sx-cyan/30',
  purple: 'bg-sx-purple/15 text-violet-200 ring-sx-purple/35',
  gold: 'bg-sx-gold/10 text-amber-200 ring-sx-gold/30',
  green: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/30',
  amber: 'bg-amber-400/10 text-amber-200 ring-amber-400/30',
  red: 'bg-red-400/10 text-red-200 ring-red-400/30',
};
export function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', BADGE[tone] ?? BADGE.neutral, className)} {...rest}>{children}</span>;
}
// A badge with a status dot (`pulse`: a live thing; still when the viewer asks for less motion).
export function StatusPill({ tone = 'neutral', pulse = false, children, className = '', ...rest }) {
  const dot = { green: 'bg-emerald-400', red: 'bg-red-400', amber: 'bg-amber-400', cyan: 'bg-sx-cyan', gold: 'bg-sx-gold', purple: 'bg-sx-purple' }[tone] ?? 'bg-slate-400';
  return (
    <Badge tone={tone} className={className} {...rest}>
      <span aria-hidden="true" className="relative flex h-2 w-2">
        {pulse && <span className={cx('absolute inline-flex h-full w-full rounded-full opacity-70 motion-safe:animate-ping', dot)} />}
        <span className={cx('relative inline-flex h-2 w-2 rounded-full', dot)} />
      </span>
      {children}
    </Badge>
  );
}

// ---- actions
const BUTTON = {
  primary: 'bg-gradient-to-r from-violet-600 to-blue-600 font-semibold text-white shadow-[0_0_24px_-6px_var(--color-sx-purple)] hover:brightness-110',
  secondary: 'border border-sx-line bg-sx-alt/60 font-medium text-slate-100 hover:border-sx-cyan/60 hover:bg-sx-alt hover:text-white',
  ghost: 'font-medium text-slate-300 hover:bg-sx-alt hover:text-white',
  danger: 'border border-red-400/40 bg-red-500/10 font-medium text-red-200 hover:border-red-300 hover:bg-red-500/20',
};
const SIZE = {
  sm: 'min-h-11 gap-1.5 rounded-lg px-3 text-xs lg:min-h-8 lg:px-2.5',
  md: 'min-h-11 gap-2 rounded-xl px-4 text-sm',
};
export const buttonClass = ({ variant = 'secondary', size = 'md', block = false, className = '' } = {}) =>
  cx('inline-flex select-none items-center justify-center whitespace-nowrap transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50', BUTTON[variant] ?? BUTTON.secondary, SIZE[size] ?? SIZE.md, block && 'w-full', className);

// A button, or a link that looks like one (`href`; `external` for a plain <a>).
export function Button({ variant, size, block, className, icon: Icon, href, external, type = 'button', children, ...rest }) {
  const cls = buttonClass({ variant, size, block, className });
  const inner = <>{Icon && <Icon aria-hidden="true" className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}{children}</>;
  if (href && external) return <a href={href} className={cls} {...rest}>{inner}</a>;
  if (href) return <Link href={href} className={cls} {...rest}>{inner}</Link>;
  return <button type={type} className={cls} {...rest}>{inner}</button>;
}

// ---- forms
export const inputClass = 'block min-h-11 w-full rounded-xl border border-sx-line bg-sx-page/80 px-3 py-2 text-base text-white placeholder:text-slate-400 transition motion-reduce:transition-none hover:border-sx-line focus:border-sx-cyan focus:outline-none focus:ring-2 focus:ring-sx-cyan/40 disabled:opacity-60 sm:text-sm';

// A labelled input. `hint`: the line under it (e.g. the password rule), linked to the input for screen readers.
export function Field({ id, label, hint, className = '', ...input }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">{label}</label>
      <input id={id} name={id} aria-describedby={hintId} {...input} className={cx(inputClass, 'mt-1.5')} />
      {hint && <p id={hintId} className="mt-1.5 text-xs text-sx-muted">{hint}</p>}
    </div>
  );
}
export function Input({ className = '', ...rest }) {
  return <input {...rest} className={cx(inputClass, className)} />;
}
export function Select({ className = '', children, ...rest }) {
  return <select {...rest} className={cx(inputClass, 'w-auto pr-8', className)}>{children}</select>;
}
export function Checkbox({ label, className = '', ...rest }) {
  return (
    <label className={cx('inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-slate-200', className)}>
      <input type="checkbox" {...rest} className="h-4 w-4 shrink-0 rounded border-sx-line bg-sx-page accent-sx-cyan" />
      {label}
    </label>
  );
}

// ---- messages
const ALERT = {
  error: ['border-red-400/40 bg-red-500/10 text-red-100', XCircle, 'text-red-300'],
  success: ['border-emerald-400/40 bg-emerald-500/10 text-emerald-100', CheckCircle2, 'text-emerald-300'],
  warn: ['border-amber-400/40 bg-amber-500/10 text-amber-100', AlertTriangle, 'text-amber-300'],
  info: ['border-sx-cyan/30 bg-sx-cyan/5 text-cyan-50', Info, 'text-sx-cyan'],
};
// A message box. Errors are role="alert", the others role="status", unless `role` says otherwise.
export function Alert({ tone = 'info', className = '', children, role, ...rest }) {
  const [cls, Icon, iconCls] = ALERT[tone] ?? ALERT.info;
  return (
    <div role={role ?? (tone === 'error' ? 'alert' : 'status')} className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm', cls, className)} {...rest}>
      <Icon aria-hidden="true" className={cx('mt-0.5 h-4 w-4 shrink-0', iconCls)} />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

// ---- tabs: a tablist with arrow keys, Home and End (WAI-ARIA tabs pattern)
export function Tabs({ tabs, value, onChange, label, className = '' }) {
  const refs = useRef([]);
  const base = useId().replace(/:/g, '');
  const onKey = (e, i) => {
    const n = tabs.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to == null) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[to]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-sx-stroke bg-sx-page/60 p-1', className)}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={t.panel}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx('inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition motion-reduce:transition-none lg:min-h-9', on ? 'bg-gradient-to-r from-sx-purple/80 to-sx-blue/80 text-white shadow' : 'text-sx-muted hover:bg-sx-alt hover:text-white')}
          >
            {t.icon && <t.icon aria-hidden="true" className="h-4 w-4" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- tables
// columns: [{ key, header, title (a tooltip on the heading), align: 'right' for figures, render(row) → cell, className, srOnly }]
// The table scrolls inside its card (sideways on a phone, down when long, with the heading row kept in view); rows are zebra-striped and
// lit on hover. `renderAfter(row)` adds a row under a row (e.g. its details), `empty` is what shows with no rows.
export function DataTable({ columns, rows, rowKey, empty = 'Nothing here yet.', minWidth = '40rem', caption, renderAfter, rowClassName, maxHeight = 'min(70vh, 44rem)', className = '', ...rest }) {
  return (
    <div className={cx('overflow-auto overscroll-x-contain rounded-xl border border-sx-stroke bg-sx-page/40', className)} style={{ maxHeight }} {...rest}>
      <table className="w-full border-separate border-spacing-0 text-left text-sm" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" title={c.title} className={cx('sticky top-0 z-10 whitespace-nowrap border-b border-sx-stroke bg-sx-alt/95 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-sx-muted backdrop-blur', c.align === 'right' && 'text-right', c.title && 'cursor-help underline decoration-sx-line decoration-dotted underline-offset-4')}>
                {c.srOnly ? <span className="sr-only">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-sx-muted">{empty}</td></tr>
          )}
          {rows.map((row, i) => {
            const k = rowKey(row, i);
            return (
              <React.Fragment key={k}>
                <tr className={cx('transition-colors motion-reduce:transition-none hover:bg-sx-alt/70', i % 2 === 1 && 'bg-sx-alt/25', rowClassName?.(row, i))}>
                  {columns.map((c) => (
                    <td key={c.key} className={cx('border-b border-sx-stroke/70 px-3 py-2.5 align-top', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                      {c.render ? c.render(row, i) : row[c.key]}
                    </td>
                  ))}
                </tr>
                {renderAfter?.(row, i)}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
