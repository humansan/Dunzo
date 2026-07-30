import React from 'react';

/**
 * A framed product screenshot. The frame recipe is lifted from the home Hero's showcase
 * (`Hero.tsx`) so screenshots read the same everywhere on the site.
 */
export const ScreenFrame: React.FC<{
  src: string;
  alt: string;
  caption?: string;
  /** Only the first shot on the page should be eager. */
  eager?: boolean;
  className?: string;
  /** Rendered inside the frame's positioning context — used for overlapping insets. */
  children?: React.ReactNode;
}> = ({ src, alt, caption, eager, className = '', children }) => (
  <figure className={`relative ${className}`}>
    <div className="rounded-2xl overflow-hidden ring-3 ring-surface bg-surface">
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="block w-full h-auto"
      />
    </div>
    {children}
    {caption && (
      <figcaption className="mt-2.5 text-xs text-fg-ghost text-center">{caption}</figcaption>
    )}
  </figure>
);
