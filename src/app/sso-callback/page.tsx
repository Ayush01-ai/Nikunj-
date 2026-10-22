import { SsoCallback } from './SsoCallback';

// Prerendered (client-only component) so Google sign-in lands on a static page instead of a
// cold Worker render; HandleSSOCallback completes the session in the browser.
export default function SsoCallbackPage() {
  return <SsoCallback />;
}
