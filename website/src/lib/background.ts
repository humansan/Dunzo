import { getImage } from 'astro:assets';
import bgSource from '../assets/background.jpg';

/**
 * ONE derivative of background.jpg, shared by both of its placements (the hero
 * and the CTA band). Identical getImage params produce a single content-hashed
 * file, so a visitor downloads it once and the second placement is a cache hit.
 *
 * Keep both callers on this helper. Requesting different widths per placement
 * silently doubles the image weight of the page — which is exactly what happened
 * before this existed (a 1200w hero copy plus a 900w band copy, 217KB together).
 *
 * 1100w / q55 is sized for the CTA band, which blurs at only 28px and is the
 * quality constraint; the hero's 64px blur is far more forgiving.
 */
export const getBackground = () =>
  getImage({ src: bgSource, width: 1100, format: 'webp', quality: 55 });
