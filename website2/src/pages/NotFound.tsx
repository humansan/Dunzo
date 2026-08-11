import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { APP_URL } from '../config';

/**
 * Real 404 content, replacing the old `path="*" → <Home />` fallback.
 *
 * That fallback returned the homepage with a 200 for every unknown URL, which Search
 * Console reports as a soft 404 and which let arbitrary junk paths become indexable
 * duplicates of the homepage. Prerendered to dist/404.html, which Vercel serves with a
 * genuine 404 status for anything not on disk.
 */
export const NotFound: React.FC = () => (
  <main className="relative min-h-[70vh] flex items-center justify-center px-4 pt-32 pb-20">
    <div className="absolute inset-0 opacity-50 pointer-events-none mix-blend-screen overflow-hidden">
      <img
        src="/background.webp"
        alt=""
        decoding="sync"
        className="w-full h-full object-cover filter blur-xl scale-120"
      />
    </div>

    <div className="relative flex flex-col items-center text-center">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gold">Error 404</p>

      <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight text-fg leading-[1.1]">
        This page is <span className="text-gold">not done</span>.
      </h1>

      <p className="mt-6 text-base text-fg-subtle max-w-md leading-relaxed">
        The link is broken or the page has moved. Everything Dunzo can do is still one
        click away.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5">
        <Link to="/" className="btn-accent-lg w-full sm:w-auto">
          <span>Back to home</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to="/features"
          className="btn-neutral px-5 h-13 rounded-xl text-lg font-medium w-full sm:w-auto justify-center"
        >
          <span>See the features</span>
        </Link>
      </div>

      <p className="mt-6 text-xs text-fg-ghost">
        Already signed up?{' '}
        <a href={APP_URL} className="text-fg-subtle hover:text-fg transition-colors">
          Go to the app
        </a>
      </p>
    </div>
  </main>
);
