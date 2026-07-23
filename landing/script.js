/* ═══════════════════════════════════════════════════════════════
   DUNZO LANDING PAGE - Interactivity
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Theme Toggle ──
  const html = document.documentElement;
  const toggleBtn = document.getElementById('theme-toggle');
  const sunIcon = toggleBtn?.querySelector('.sun-icon');
  const moonIcon = toggleBtn?.querySelector('.moon-icon');

  function getPreferredTheme() {
    const stored = localStorage.getItem('dunzo-landing-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('dunzo-landing-theme', theme);
    if (sunIcon && moonIcon) {
      if (theme === 'dark') {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
      } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
      }
    }
  }

  // Init
  setTheme(getPreferredTheme());

  toggleBtn?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ── Navbar scroll effect ──
  const nav = document.querySelector('.nav');
  let lastScrollY = 0;

  function onScroll() {
    const scrolled = window.scrollY > 20;
    nav?.classList.toggle('scrolled', scrolled);
    lastScrollY = window.scrollY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Mobile menu ──
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  mobileMenuBtn?.addEventListener('click', () => {
    const isOpen = !mobileMenu?.classList.contains('hidden');
    mobileMenu?.classList.toggle('hidden', isOpen);
  });

  // Close mobile menu on link click
  mobileMenu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
    });
  });

  // ── Scroll-triggered fade-in animations ──
  const fadeElements = document.querySelectorAll('.fade-in');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    fadeElements.forEach((el) => observer.observe(el));
  } else {
    // Fallback: show all immediately
    fadeElements.forEach((el) => el.classList.add('visible'));
  }

  // ── Smooth anchor scroll (fallback for older browsers) ──
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
})();
