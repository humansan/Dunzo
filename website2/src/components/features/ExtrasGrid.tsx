import React from 'react';
import { EXTRAS } from '../../content/features.data';

export const ExtrasGrid: React.FC = () => (
  <section id="extras" className="scroll-mt-28 border-t border-line-subtle py-20 md:py-28">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-fg leading-[1.1]">
          Also in the box.
        </h2>
        <p className="mt-4 text-base text-fg-muted">The rest of what you get.</p>
      </div>

      <ul className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXTRAS.map(({ icon: Icon, title, body, shots }) => (
          <li
            key={title}
            className="flex flex-col rounded-2xl border border-line-subtle bg-surface p-5"
          >
            <Icon className="w-5 h-5 text-gold" />
            <h3 className="mt-3.5 text-sm font-bold text-fg">{title}</h3>
            <p className="mt-2 text-xs text-fg-muted leading-relaxed">{body}</p>

            {shots && (
              <div
                className={`mt-4 grid gap-1.5 ${shots.length > 1 ? 'grid-rows-2' : 'grid-rows-1'}`}
              >
                {shots.map((shot) => (
                  <div
                    key={shot.src}
                    className="rounded-lg overflow-hidden ring-3 ring-surface bg-canvas"
                  >
                    <img
                      src={shot.src}
                      alt={shot.alt}
                      loading="lazy"
                      decoding="async"
                      className="block w-full h-auto"
                    />
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  </section>
);
