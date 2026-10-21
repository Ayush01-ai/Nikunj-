import { SsoCallback } from './SsoCallback';

// Auth callback: never prerender at build time.
export const dynamic = 'force-dynamic';

export default function SsoCallbackPage() {
  return <SsoCallback />;
}
