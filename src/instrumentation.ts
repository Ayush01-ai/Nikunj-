import type { Instrumentation } from 'next';

// Structured server-error logs (searchable in the hosting provider's logs). Swap for Sentry when a DSN is available.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: 'error',
      source: 'server',
      message: err?.message,
      digest: err?.digest,
      method: request.method,
      path: request.path.split('?')[0],
      routePath: context.routePath,
      routeType: context.routeType,
      timestamp: new Date().toISOString(),
    }),
  );
};
