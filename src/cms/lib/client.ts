import { createClient } from 'next-sanity';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'placeholder';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const apiVersion = '2024-01-01';

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  // Builds start right after a publish (Deploy Hook), when the Sanity CDN can still serve the
  // previous version, so prerendering reads the live API. Runtime reads keep using the CDN.
  useCdn: process.env.NEXT_PHASE !== 'phase-production-build',
});

/** Write client — only used server-side for mutations */
export const writeClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});
