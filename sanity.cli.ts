import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'x33a83r6',
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  },
  studioHost: 'nikunj-sakhi',
  deployment: {
    appId: 'u6s72lz283livxx776y9zgsy',
  },
});
