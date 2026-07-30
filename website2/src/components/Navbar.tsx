import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import { APP_URL } from '../config';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Features', to: '/features' },
    // { name: 'Why Dunzo?', to: '/#why-dunzo' },
  ];

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl z-50 bg-canvas/70 backdrop-blur-md border border-fg/10 rounded-2xl pl-4 pr-3.5 py-3">
      <div className="flex items-center justify-between">
        {/* Left Side: Logo (32px) + Bold Dunzo Text (22px) matching s22 */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
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

        {/* Center: 2 Links (Features & Why Dunzo?) */}
        

        {/* Right Side: Primary CTA */}
        <div className="hidden md:flex items-center gap-4">
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.to}
                className="font-semibold text-fg-muted hover:text-fg transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </nav>
          
          <a href={APP_URL} className="btn-accent">
            <span>Get Started</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg focus:outline-none"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Minimal Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden pt-4 mt-3 border-t border-line-subtle flex flex-col gap-3">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.to}
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-fg-muted hover:text-fg py-1"
            >
              {link.name}
            </Link>
          ))}
          <a
            href={APP_URL}
            onClick={() => setMobileMenuOpen(false)}
            className="btn-accent w-full py-2.5 text-xs justify-center mt-2"
          >
            <span>Get Started</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </header>
  );
};
