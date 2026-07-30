import React, { useEffect, useState } from 'react';
import { RAIL } from '../../content/features.data';

/**
 * Fixed left rail that tracks which section is in the middle of the viewport.
 * One observer for all sections; the band is the middle 10% of the screen, so exactly one
 * section is "current" almost all the time.
 */
export const ScrollSpyRail: React.FC = () => {
  const [active, setActive] = useState<string>(RAIL[0].id);

  useEffect(() => {
    const sections = RAIL.map((r) => document.getElementById(r.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(visible[visible.length - 1].target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Features sections"
      className="hidden xl:block fixed left-4 top-1/2 -translate-y-1/2 z-40"
    >
      <ul className="flex flex-col gap-3">
        {RAIL.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a href={`#${item.id}`} className="group flex items-center gap-3">
                <span
                  className={`h-px transition-all duration-200 ${
                    isActive ? 'w-4 bg-gold' : 'w-2 bg-line-stronger group-hover:w-3'
                  }`}
                />
                <span
                  className={`text-[11px] font-semibold transition-colors ${
                    isActive ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted'
                  }`}
                >
                  {item.label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
