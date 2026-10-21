import imageUrlBuilder from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';
import { client } from './client';

const builder = imageUrlBuilder(client);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}

export const IMAGE_PLACEHOLDER = '/nikunj-sakhi-logo-v3.webp';

/** Returns a CDN URL string, or undefined when the image has no asset or the builder fails. */
export function safeImageUrl(
  source: SanityImageSource | null | undefined,
  width = 500,
  height?: number,
  quality = 80,
): string | undefined {
  const s = source as { asset?: unknown } | null | undefined;
  if (!s || !s.asset) return undefined;
  try {
    let b = builder.image(source as SanityImageSource).auto('format').fit('max').quality(quality).width(width);
    if (height) b = b.height(height);
    return b.url() || undefined;
  } catch {
    return undefined;
  }
}

/** Get optimised URL with auto quality + format */
export function getImageUrl(
  source: SanityImageSource,
  options: { width?: number; height?: number; quality?: number } = {},
) {
  const { width = 800, height, quality = 80 } = options;
  let b = builder.image(source).auto('format').quality(quality).width(width);
  if (height) b = b.height(height);
  return b.url();
}
