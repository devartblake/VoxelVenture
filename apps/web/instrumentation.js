// Next.js calls onRequestError for an error while rendering a page, in a route handler or a server action
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md). With SENTRY_DSN in web.env it goes to
// Sentry (deploy/MONITORING.md); the browser's own errors reach Sentry through the presence server instead.
let reporter;

export async function onRequestError(error, request, context) {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) return;
  if (!reporter) {
    const { createReporter } = await import('@/lib/net/sentry.mjs');
    reporter = createReporter({ dsn: process.env.SENTRY_DSN, service: 'web', environment: process.env.SENTRY_ENVIRONMENT, release: process.env.SENTRY_RELEASE });
  }
  // the route file (app/b/[slug]), not the address someone typed, and the digest that matches the line in journalctl
  await reporter.capture(error, {
    tags: { route: context.routePath, routeType: context.routeType, method: request.method },
    ...(error?.digest ? { extra: { digest: String(error.digest) } } : {}),
  });
}
