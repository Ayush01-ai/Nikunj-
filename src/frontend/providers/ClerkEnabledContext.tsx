'use client';

import { createContext, useContext } from 'react';

// True only when <ClerkProvider> is really mounted above (see ClerkAppProvider).
const ClerkEnabledContext = createContext(false);

export const ClerkEnabledProvider = ClerkEnabledContext.Provider;
export const useClerkEnabled = () => useContext(ClerkEnabledContext);
