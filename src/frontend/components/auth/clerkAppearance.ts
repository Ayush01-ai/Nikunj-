/**
 * Shared Clerk <SignIn>/<SignUp> appearance so the Clerk widgets use the storefront's
 * existing fonts (the same Cinzel / Crimson / Lato pattern as /login) instead of Clerk's
 * default typeface.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#C9922A',
    colorBackground: '#FFF8EE',
    colorForeground: '#2C1A00',
    borderRadius: '0px',
    fontFamily: 'var(--font-lato), Lato, sans-serif',
  },
  elements: {
    headerTitle: 'font-cinzel text-lg font-semibold text-deep',
    headerSubtitle: 'font-crimson italic text-[var(--text-mid)]',
    formFieldLabel: 'font-cinzel text-[10px] tracking-widest uppercase text-[var(--text-mid)]',
    formFieldInput: 'font-lato text-sm',
    formButtonPrimary: 'font-cinzel tracking-widest uppercase',
    socialButtonsBlockButtonText: 'font-lato text-sm',
    dividerText: 'font-cinzel text-[10px] tracking-widest uppercase',
    footerActionText: 'font-lato text-xs',
    footerActionLink: 'font-lato text-xs',
    identityPreviewText: 'font-lato',
    otpCodeFieldInput: 'font-cinzel',
  },
};
