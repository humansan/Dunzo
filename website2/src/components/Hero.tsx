import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Play, ArrowRight, X, Sparkles } from 'lucide-react';
import { APP_URL } from '../config';

export const Hero: React.FC = () => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const showcaseRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { hash } = useLocation();

  const startDemo = () => {
    setIsVideoPlaying(true);
    showcaseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // If the video is already mounted, autoPlay won't re-fire — nudge it manually.
    videoRef.current?.play().catch(() => {});
  };

  // Arriving from another page via /#demo (footer "Video", features "Watch the
  // demo") should land on the video already playing, not just scrolled to it.
  // Only the playback is handled here — useHashScroll owns the scroll, so the two
  // don't fight over the final position with competing smooth scrolls.
  useEffect(() => {
    if (hash === '#demo') setIsVideoPlaying(true);
  }, [hash]);

  const taglineText = "A calmer way to get things done";
  const taglineWords = taglineText.split(" ");

  return (
    <section className="relative pt-26 pb-20 md:pt-32 md:pb-28 overflow-hidden bg-canvas">
      {/* Background image blur effect */}
      <div className="absolute inset-0 opacity-25 pointer-events-none mix-blend-screen overflow-hidden">
        <img
          src="/background.jpg"
          alt=""
          className="w-full h-full object-cover filter blur-2xl scale-125"
        />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">

          {/* Early Access Chip: No border, 15% opacity gold background, full gold text */}
          <div className="mb-6 fade-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/15 border-none text-xs font-semibold text-gold">
              <Sparkles className="w-3.5 h-3.5 fill-gold text-gold" />
              <span>Free while in early access</span>
            </div>
          </div>

          {/* Main Tagline: Single-phase smooth word-by-word blur-to-focus stagger */}
          <h1 className="text-4xl sm:text-6xl md:text-8xl font-extrabold tracking-tight text-fg leading-[1.1] max-w-4xl">
            {taglineWords.map((word, idx) => (
              <span
                key={idx}
                className="inline-block mr-[0.25em] word-blur-enter"
                style={{
                  animationDelay: `${idx * 100 + 200}ms`,
                }}
              >
                {word === 'calmer' ? (
                  <span className="text-gold font-black">{word}</span>
                ) : (
                  word
                )}
              </span>
            ))}
          </h1>

          {/* Subtitle */}
          <p
            className="mt-6 text-base sm:text-lg text-fg-muted max-w-xl font-normal leading-relaxed fade-slide-up"
            style={{ animationDelay: '900ms' }}
          >
            Dunzo pairs a focused daily list with a strategic planner and an intuitive XP streak system — designed for peaceful momentum.
          </p>

          {/* Action Buttons */}
          <div
            className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 fade-slide-up"
            style={{ animationDelay: '1000ms' }}
          >
            <a href={APP_URL} className="btn-accent-lg w-full sm:w-auto">
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <button
              onClick={startDemo}
              className="btn-neutral px-5 h-[52px] rounded-xl text-lg font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Play className="w-4 h-4 fill-gold text-gold" />
              <span>Watch Demo</span>
            </button>
          </div>

          {/* Clean Image Showcase */}
          <div
            id="demo"
            ref={showcaseRef}
            className="mt-12 relative w-full max-w-5xl scroll-mt-28 fade-slide-up"
            style={{ animationDelay: '1100ms' }}
          >
            <div
              className={`relative aspect-video rounded-2xl overflow-hidden border border-fg/10 bg-surface group ${
                isVideoPlaying ? '' : 'cursor-pointer'
              }`}
              onClick={isVideoPlaying ? undefined : () => setIsVideoPlaying(true)}
            >
              <img
                src="/media/s1.png"
                alt="Dunzo Daily Dashboard"
                className="absolute inset-0 w-full h-full object-cover"
                aria-hidden={isVideoPlaying}
              />

              {isVideoPlaying ? (
                <>
                  <video
                    ref={videoRef}
                    src="/media/v0.mp4"
                    controls
                    autoPlay
                    loop
                    className="absolute inset-0 w-full h-full object-cover bg-black"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsVideoPlaying(false);
                    }}
                    aria-label="Close video"
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-surface/80 text-fg-muted hover:text-fg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                /* Minimal Play Overlay */
                <div className="absolute inset-0 bg-canvas/20 transition-opacity duration-200 flex flex-col items-center justify-center gap-2">
                  <div className="w-14 h-14 rounded-full text-gold flex items-center justify-center">
                    <Play className="w-7 h-7 fill-gold ml-0.5 group-hover:scale-120 transition-all" />
                  </div>
                  <span className="text-xs font-bold text-fg bg-surface px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                    Click to play video
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
