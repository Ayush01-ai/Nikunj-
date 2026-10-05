import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Track Your Order',
  description: 'Check the status of your Nikunj Sakhi order with your order ID and mobile number.',
  robots: { index: false, follow: true },
};

export default function TrackOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
