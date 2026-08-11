import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Play, Sparkles } from 'lucide-react';
import { APP_URL, DEMO_HASH } from '../../config';

const HEADING = 'Everything Dunzo does.';

export const FeaturesHero: React.FC = () => (
  /**
   * `bg-canvas` + `z-[45]` make this section an opaque panel that sits *above* the scroll-spy
   * rail (z-40) and below the navbar (z-50), so the rail is hidden here and slides out from
   * underneath the hero as you scroll into the content. The backdrop below is only 25% opaque,
   * which is why the cover has to be the section itself rather than the image.
   */
  <section
    id="features"
    className="relative z-[45] bg-canvas min-h-[calc(50vh+150px)] pt-32 pb-16 md:pt-40 md:pb-20 overflow-hidden"
  >
    {/* Same pre-blurred backdrop as the home hero, so the two pages feel like one*/}
    <div className="absolute inset-0 opacity-65 pointer-events-none overflow-hidden will-change-transform">
      <img
        src="/background-blur.webp"
        alt=""
        decoding="sync"
        fetchPriority="high"
        className="w-full h-full object-cover scale-120"
      />
    </div>

    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
      <div className="mb-6 fade-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full bg-gold/15 border-none text-xs font-semibold text-gold">
          <ChevronRight className="w-3.5 h-3.5 text-gold" />
          <span>Free in early access</span>
        </div>
      </div>

      <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-fg leading-[1.1] max-w-3xl">
        {HEADING.split(' ').map((word, idx) => (
          <span
            key={idx}
            className="inline-block mr-[0.25em] word-blur-enter"
            style={{ animationDelay: `${idx * 100 + 200}ms` }}
          >
            {word}
          </span>
        ))}
      </h1>

      <p
        className="mt-6 text-base sm:text-lg text-fg-muted max-w-xl leading-relaxed fade-slide-up"
        style={{ animationDelay: '700ms' }}
      >
        A focused list for today, a planner for everything else, and a calendar that shares the same
        tasks. Here's the whole app, feature by feature.
      </p>

      <div
        className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 fade-slide-up"
        style={{ animationDelay: '800ms' }}
      >
        <a href={APP_URL} className="btn-accent-lg w-full sm:w-auto">
          <span>Get Started</span>
          <ArrowRight className="w-4 h-4" />
        </a>
        <Link
          to={DEMO_HASH}
          className="btn-neutral px-5 h-13 rounded-xl text-lg font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <Play className="w-4 h-4 fill-gold text-gold" />
          <span>Watch the demo</span>
        </Link>
      </div>

      <p className="mt-6 text-xs text-fg-ghost fade-slide-up" style={{ animationDelay: '900ms' }}>
        Cloud-synced · desktop-optimized · light and dark
      </p>
    </div>
  </section>
);
