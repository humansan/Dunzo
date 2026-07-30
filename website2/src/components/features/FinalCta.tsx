import React from 'react';
import { ArrowRight, ArrowUp, Sparkles } from 'lucide-react';
import { APP_URL } from '../../config';

export const FinalCta: React.FC = () => (
  <section id="get-started" className="scroll-mt-28 py-24">
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/15 text-xs font-semibold text-gold">
        <Sparkles className="w-3.5 h-3.5 fill-gold text-gold" />
        <span>Free while in early access</span>
      </div>

      <h2 className="mt-6 text-3xl md:text-5xl font-extrabold tracking-tight text-fg leading-[1.1]">
        Start with today's list.
      </h2>
      <p className="mt-5 text-base text-fg-muted max-w-md leading-relaxed">
        Sign in, add three things, check one off. That's the whole onboarding.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5">
        <a href={APP_URL} className="btn-accent-lg w-full sm:w-auto">
          <span>Get Started</span>
          <ArrowRight className="w-4 h-4" />
        </a>
        <a
          href="#features"
          className="btn-neutral px-5 h-13 rounded-xl text-lg font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <ArrowUp className="w-4 h-4 text-gold" />
          <span>Back to top</span>
        </a>
      </div>
    </div>
  </section>
);
