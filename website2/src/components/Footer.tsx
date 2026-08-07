import React from 'react';
import { Link } from 'react-router-dom';
import { Disc, Github } from 'lucide-react';
import { APP_URL, DEMO_HASH, GITHUB_URL } from '../config';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  const featureLinks = [
    { name: 'Daily Task Lists', to: '/features#daily-lists' },
    { name: 'Strategic Planner', to: '/features#planner' },
    { name: 'Calendar', to: '/features#calendar' },
    { name: 'XP & Streaks System', to: '/features#xp-streaks' },
    { name: 'Time Widgets & Pomodoro', to: '/features#time-widgets' },
  ];

  return (
    <footer className="bg-surface border-t border-line-subtle py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex pb-10 border-b border-line-subtle gap-16">
          {/* Brand Info */}
          <div className="flex-1 flex flex-col gap-3">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Dunzo Logo"
                className="w-8 h-8 rounded-lg object-contain"
              />
              <span
                className="font-bold text-fg tracking-tight"
                style={{ fontSize: '22px', lineHeight: '1' }}
              >
                Dunzo
              </span>
            </Link>
            <p className="text-xs text-fg-subtle max-w-sm leading-relaxed">
              A calmer way to get things done. Daily focus lists, strategic project planning, and gamified progress tracking.
            </p>
            <div className="flex items-center gap-3 mt-1">
              {/* <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-canvas border border-line-subtle text-fg-muted hover:text-fg transition-colors"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a> */}
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="p-1.5 rounded-lg bg-canvas border border-line-subtle text-fg-muted hover:text-fg transition-colors cursor-pointer"
                aria-label="Back to top"
                title="Back to top"
              >
                <Disc className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Features Column */}
          <div className="flex flex-col gap-3 ">
            <h4 className="text-xs font-bold text-fg-faint">
              Features
            </h4>
            <ul className="flex flex-col gap-2 text-xs text-fg-subtle">
              {featureLinks.map((link) => (
                <li key={link.name}>
                  <Link to={link.to} className="hover:text-fg transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About Column */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-fg-faint">
              Shortcuts
            </h4>
            <ul className="flex flex-col gap-2 text-xs text-fg-subtle">
              {/* Plain <a>: the app is a separate SPA, so this must leave this router. */}
              <li>
                <a href={APP_URL} className="hover:text-fg transition-colors">
                  Go to App
                </a>
              </li>
              <li>
                <Link to="/" className="hover:text-fg transition-colors">
                  Homepage
                </Link>
              </li>
              <li>
                <Link to={DEMO_HASH} className="hover:text-fg transition-colors">
                  Video
                </Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-fg transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-fg transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright Notice */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-fg-ghost">
          <span>© {currentYear} Dunzo. All rights reserved.</span>
          <span>A calmer way to get things done.</span>
        </div>
      </div>
    </footer>
  );
};
