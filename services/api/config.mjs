// The production settings check (docs/architecture/authoritative_data.md). The API refuses to start in production (NODE_ENV=production, or API_STRICT=1)
// while any `errors` remain, so a missing secret or a test setting can never reach real users; `warnings` are printed and it starts.
// `npm run check:env -- <file>` runs the same checks on a settings file before a deploy (scripts/check-env.mjs), for the web app's too.
import { parseDsn } from '../../lib/net/sentry.mjs';

const PLACEHOLDER = /CHANGE_ME|example\.com|changeme|^secret$|^password$/i;
const SECRETS = ['ADMIN_TOKEN', 'IP_SALT', 'MP_NOTIFY_SECRET', 'REFERRAL_SECRET'];
const https = (v) => /^https:\/\/[^\s/]+/i.test(String(v ?? ''));
// error reporting (deploy/MONITORING.md): a DSN that cannot be read would silently report nothing, so it stops the start
const checkSentry = (env, errors, warnings) => {
  if (!env.SENTRY_DSN) warnings.push('SENTRY_DSN is not set: unexpected errors stay in journalctl and nobody is told (deploy/MONITORING.md).');
  else if (!parseDsn(env.SENTRY_DSN)) errors.push('SENTRY_DSN is not a Sentry DSN (https://<key>@<host>/<project number>, from the project\'s Client Keys page).');
};

export function checkApiEnv(env = {}) {
  const errors = [];
  const warnings = [];
  for (const k of SECRETS) {
    const v = String(env[k] ?? '');
    if (!v) errors.push(`${k} is not set (make it long and random: openssl rand -hex 32).`);
    else if (PLACEHOLDER.test(v)) errors.push(`${k} is still the placeholder from the example file.`);
    else if (v.length < 32) errors.push(`${k} is too short (${v.length} characters; use at least 32).`);
  }
  const real = SECRETS.map((k) => String(env[k] ?? '')).filter((v) => v && !PLACEHOLDER.test(v));
  if (new Set(real).size < real.length) errors.push('The secrets must all be different from each other.');
  if (!env.API_ORIGIN || env.API_ORIGIN === '*') errors.push('API_ORIGIN must be the web app\'s own address (https://...), not "*".');
  else if (!https(env.API_ORIGIN) || PLACEHOLDER.test(env.API_ORIGIN)) errors.push(`API_ORIGIN must be your real https:// address (it is "${env.API_ORIGIN}").`);
  if (!https(env.PUBLIC_API_URL) || PLACEHOLDER.test(env.PUBLIC_API_URL ?? '')) errors.push('PUBLIC_API_URL must be the API\'s real https:// address (it goes into email links).');
  if (!env.API_DB || env.API_DB === ':memory:') errors.push('API_DB must be a database file: ":memory:" loses everything on a restart.');
  // test settings that switch off the proof-of-human rules
  if (env.HUMAN_MIN_AGE_MS != null && Number(env.HUMAN_MIN_AGE_MS) < 1000) errors.push('HUMAN_MIN_AGE_MS is a test setting (under a second of presence counts as human). Remove it.');
  for (const [k, max] of [['HUMAN_VISIT_CAP', 20], ['HUMAN_CLICK_CAP', 10], ['PROFILE_VIEW_CAP', 20], ['PROFILE_CTA_CAP', 10]]) if (env[k] != null && Number(env[k]) > max) errors.push(`${k}=${env[k]} lets one network count as a crowd (at most ${max}). Remove it to use the default.`);
  if (env.MESSAGING_SERVICE_URL && String(env.INTERNAL_SECRET ?? '').length < 32) errors.push('MESSAGING_SERVICE_URL is set, so INTERNAL_SECRET must be set too (32+ characters).');
  if (['review', 'auto'].includes(env.SOCIAL_POSTS)) {
    const missing = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].filter((k) => !env[k] || PLACEHOLDER.test(env[k]));
    if (missing.length) errors.push(`SOCIAL_POSTS=${env.SOCIAL_POSTS} needs the X account's keys: ${missing.join(', ')} (or set SOCIAL_POSTS=off).`);
    if (!https(env.PUBLIC_SITE_URL || env.API_ORIGIN)) errors.push('Welcome posts link to the site: set PUBLIC_SITE_URL to its https:// address.');
  }
  if (env.STRIPE_SECRET_KEY) {
    if (!env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not: payments would never be confirmed.');
    if (!https(env.PUBLIC_SITE_URL || env.API_ORIGIN)) errors.push('Payments send the owner back to the site: set PUBLIC_SITE_URL to its https:// address.');
    // a live key: a full secret key (sk_live_) or a restricted one (rk_live_, deploy/STRIPE_LIVE.md); the same rules for both
    if (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) && (!https(env.TERMS_URL) || !https(env.REFUND_POLICY_URL))) errors.push('A live Stripe key needs TERMS_URL and REFUND_POLICY_URL (https://): customers must see the terms and the refund policy before paying.');
    if (/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)) warnings.push('STRIPE_SECRET_KEY is a test key: no real money moves.');
  }
  if (!env.TRUST_PROXY) warnings.push('TRUST_PROXY is not set: behind a reverse proxy every visitor looks like one network, and the per-network limits stop counting real visitors.');
  if (!env.MP_NOTIFY_URL) warnings.push('MP_NOTIFY_URL is not set: players see changes only on the 15-second refresh.');
  if (!env.MAIL_WEBHOOK_URL) warnings.push('MAIL_WEBHOOK_URL is not set: emails are written to files, not sent.');
  checkSentry(env, errors, warnings);
  return { errors, warnings };
}

// The web app's settings (NEXT_PUBLIC_* are fixed into the build, so check them before `npm run build`).
export function checkWebEnv(env = {}) {
  const errors = [];
  const warnings = [];
  if (!https(env.NEXT_PUBLIC_LIVE_API_URL) || PLACEHOLDER.test(env.NEXT_PUBLIC_LIVE_API_URL ?? '')) errors.push('NEXT_PUBLIC_LIVE_API_URL must be the API\'s real https:// address; without it the site is a single-player demo with simulated figures.');
  if (!https(env.NEXT_PUBLIC_SITE_URL) || PLACEHOLDER.test(env.NEXT_PUBLIC_SITE_URL ?? '')) errors.push('NEXT_PUBLIC_SITE_URL must be the site\'s real https:// address (canonical links, share images, the sitemap).');
  if (env.NEXT_PUBLIC_MP_URL && !/^wss:\/\//i.test(env.NEXT_PUBLIC_MP_URL)) errors.push('NEXT_PUBLIC_MP_URL must be a wss:// address in production.');
  if (!env.NEXT_PUBLIC_MP_URL && !env.NEXT_PUBLIC_MP_URLS) warnings.push('NEXT_PUBLIC_MP_URL is not set: no multiplayer presence or chat.');
  checkSentry(env, errors, warnings);
  return { errors, warnings };
}

export const isProduction = (env = {}) => env.NODE_ENV === 'production' || env.API_STRICT === '1';
