'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { IMAGE_PLACEHOLDER } from '@/cms/lib/image';

type Props = Omit<ImageProps, 'src'> & { src?: string | null };

/** next/image that swaps to the placeholder when the source is empty or fails to load (e.g. CDN 404). */
export default function SafeImage({ src, onError, alt, ...rest }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolved = !src || failedSrc === src ? IMAGE_PLACEHOLDER : src;
  return (
    <Image
      {...rest}
      alt={alt}
      src={resolved}
      onError={(e) => {
        if (resolved !== IMAGE_PLACEHOLDER) setFailedSrc(resolved);
        onError?.(e);
      }}
    />
  );
}
