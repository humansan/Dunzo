import React from 'react';
import { Hero } from '../components/Hero';
import { useHashScroll } from '../hooks/useHashScroll';

export const Home: React.FC = () => {
  useHashScroll();

  return (
    <main>
      <Hero />
    </main>
  );
};
