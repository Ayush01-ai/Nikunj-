import React from 'react';
import Link from 'next/link';
import {
  Instagram, Facebook, Youtube, Mail, Phone, MapPin,
  Truck, ShieldCheck, Sparkles, Award, MessageCircle
} from 'lucide-react';
import { NikunjSakhiLogo } from '@/frontend/components/ui/NikunjSakhiLogo';
import { FooterShopLinks } from '@/frontend/components/layout/FooterShopLinks';
import { getWhatsAppHref } from '@/frontend/lib/whatsapp';
import type { SiteSettings } from '@/types';

interface FooterProps {
  settings: SiteSettings | null;
}

const quickLinks = [
  { href: '/collections', label: 'All Collections' },
  { href: '/collections?featuredOnly=true', label: 'Featured Products' },
  { href: '/collections?newArrivalOnly=true', label: 'New Arrivals' },
  { href: '/collections?bestsellerOnly=true', label: 'Bestsellers' },
];

const supportLinks = [
  { href: '/track-order', label: 'Track Your Order' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/#about', label: 'About Us' },
  { href: '/policies/return', label: 'Return Policy' },
  { href: '/policies/shipping', label: 'Shipping Policy' },
  { href: '/policies/privacy', label: 'Privacy Policy' },
  { href: '/policies/terms', label: 'Terms & Conditions' },
  { href: '/#feedback', label: 'Write a Review' },
];

export function Footer({ settings }: FooterProps) {
  const year = new Date().getFullYear();
  const whatsappUrl = getWhatsAppHref(
    settings?.whatsappNumber,
    'Namaste! 🙏 I need assistance regarding Nikunj Sakhi divine ornaments.',
  );

  const trustHighlights = [
    { icon: Truck, title: 'Free Delivery', sub: `On orders above ₹${settings?.freeDeliveryThreshold || 399}` },
    { icon: ShieldCheck, title: 'Secure Payments', sub: 'Cashfree • UPI • COD' },
    { icon: Sparkles, title: 'Handcrafted', sub: 'With divine precision' },
    { icon: Award, title: '100% Authentic', sub: 'Pure & sacred materials' },
  ];

  return (
    <footer className="bg-deep text-white/60">
      {/* Top strip */}
      <div className="border-b border-gold/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {trustHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex flex-col items-center gap-2.5 group">
                <span className="w-10 h-10 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold-light group-hover:bg-gold group-hover:text-white transition-all duration-300">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="font-cinzel text-xs tracking-widest text-gold-light font-semibold uppercase">{item.title}</span>
                <span className="text-xs text-white/60">{item.sub}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-8 sm:gap-12">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <div className="mb-5">
              <NikunjSakhiLogo className="w-60 sm:w-64 max-w-full" variant="dark" />
            </div>
            <p className="text-xs leading-relaxed text-white/50 mb-5 max-w-xs">
              Crafting divine ornaments for beloved deities with pure devotion and sacred artistry.
              Each piece is a prayer, each bead a blessing.
            </p>
            {/* Social */}
            <div className="flex gap-3">
              {settings?.instagramUrl && (
                <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 border border-gold/30 flex items-center justify-center text-white/50 hover:border-gold hover:text-gold transition-all">
                  <Instagram size={15} />
                </a>
              )}
              {settings?.facebookUrl && (
                <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 border border-gold/30 flex items-center justify-center text-white/50 hover:border-gold hover:text-gold transition-all">
                  <Facebook size={15} />
                </a>
              )}
              {settings?.youtubeUrl && (
                <a href={settings.youtubeUrl} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 border border-gold/30 flex items-center justify-center text-white/50 hover:border-gold hover:text-gold transition-all">
                  <Youtube size={15} />
                </a>
              )}
            </div>
          </div>

          {/* Shop by Category */}
          <FooterShopLinks />

          {/* Quick Links */}
          <div>
            <h2 className="font-cinzel text-sm tracking-wide text-gold-light mb-5 font-semibold">
              Collections
            </h2>
            <ul className="space-y-3 text-xs">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-white/50 hover:text-gold-light transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h2 className="font-cinzel text-sm tracking-wide text-gold-light mb-5 font-semibold">
              Help &amp; Info
            </h2>
            <ul className="space-y-3 text-xs">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-white/50 hover:text-gold-light transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h2 className="font-cinzel text-sm tracking-wide text-gold-light mb-5 font-semibold">
              Contact
            </h2>
            <ul className="space-y-3 text-xs">
              <li>
                <Link href="/contact" className="text-xs text-white/50 hover:text-gold-light transition-colors font-medium">
                  Contact Us
                </Link>
              </li>
              <li>
                <a
                  href="mailto:Nikunj.sakhi14@gmail.com"
                  className="flex items-center gap-2.5 text-xs text-white/50 hover:text-gold-light transition-colors break-all"
                >
                  <Mail size={14} className="text-gold-light flex-shrink-0" />
                  <span>Nikunj.sakhi14@gmail.com</span>
                </a>
              </li>
              <li>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-xs text-white/50 hover:text-gold-light transition-colors"
                >
                  <MessageCircle size={14} className="text-gold-light flex-shrink-0" />
                  <span>WhatsApp Us</span>
                </a>
              </li>
              {settings?.phone && (
                <li>
                  <a
                    href={`tel:${settings.phone}`}
                    className="flex items-center gap-2.5 text-xs text-white/50 hover:text-gold-light transition-colors"
                  >
                    <Phone size={14} className="text-gold-light flex-shrink-0" />
                    <span>{settings.phone}</span>
                  </a>
                </li>
              )}
              {settings?.address && (
                <li className="flex items-start gap-2.5 text-xs text-white/50">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gold-light" />
                  <span>{settings.address}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gold/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p className="text-white/60">
            © {year} {settings?.brandName || 'Nikunj Sakhi'}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
