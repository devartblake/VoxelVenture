import { NextResponse } from 'next/server';
import { buildCsp, cspHeaderName } from '../../lib/security/csp.js';

// A fresh nonce and the Content-Security-Policy for every page (docs/operations/voxelventure_security_action_plan.md, V2;
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Next.js reads the nonce from the request's policy header and puts it
// on its own scripts and styles. Report-only until CSP_ENFORCE=1 (in web.env), so the first weeks only log what would have been blocked.
// The pages render per request (app/layout.jsx), because a nonce cannot exist in a page built ahead of time.
export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    env: {
      NEXT_PUBLIC_PROPS_BASE_URL: process.env.NEXT_PUBLIC_PROPS_BASE_URL,
      NEXT_PUBLIC_LIVE_API_URL: process.env.NEXT_PUBLIC_LIVE_API_URL,
      NEXT_PUBLIC_MP_URL: process.env.NEXT_PUBLIC_MP_URL,
      NEXT_PUBLIC_MP_URLS: process.env.NEXT_PUBLIC_MP_URLS,
    },
  });
  const name = cspHeaderName({ CSP_ENFORCE: process.env.CSP_ENFORCE });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js finds the nonce in whichever of the two headers is set
  requestHeaders.set(name, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(name, csp);
  return response;
}

export const config = {
  matcher: [
    {
      // pages only: not the API routes, the build's static files, images or the favicon, and not link prefetches
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
