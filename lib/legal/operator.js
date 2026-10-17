// Who runs VoxelVenture, for the policies (/legal). Set at build time; anything not set shows as a highlighted [placeholder] on the
// policy pages, and tests/legal.test.mjs refuses an approved policy that still has one.
//   NEXT_PUBLIC_LEGAL_NAME          the legal name of the company or person running the service
//   NEXT_PUBLIC_LEGAL_ADDRESS       its postal address
//   NEXT_PUBLIC_LEGAL_EMAIL         where people write about the policies, their data, refunds and complaints
//   NEXT_PUBLIC_LEGAL_JURISDICTION  the law the terms are under, and where disputes go
//   NEXT_PUBLIC_LEGAL_MIN_AGE       the youngest age allowed to use the service (a decision: see docs/monetization/policy_review.md)
const v = (value, placeholder) => (value && String(value).trim()) || `[${placeholder}]`;

export function operator(env = process.env) {
  return {
    name: v(env.NEXT_PUBLIC_LEGAL_NAME, 'Company legal name'),
    address: v(env.NEXT_PUBLIC_LEGAL_ADDRESS, 'Registered postal address'),
    email: v(env.NEXT_PUBLIC_LEGAL_EMAIL, 'Contact email for privacy, refunds and complaints'),
    jurisdiction: v(env.NEXT_PUBLIC_LEGAL_JURISDICTION, 'Governing law and courts'),
    minAge: v(env.NEXT_PUBLIC_LEGAL_MIN_AGE, 'Minimum age'),
  };
}

export const isPlaceholder = (text) => /\[[^\]]+\]/.test(String(text));
