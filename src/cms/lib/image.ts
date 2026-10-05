import imageUrlBuilder from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';
import { client } from './client';

const builder = imageUrlBuilder(client);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
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
