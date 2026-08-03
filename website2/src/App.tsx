import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Features } from './pages/Features';
import { useAnimationGate } from './hooks/useAnimationGate';

export const App: React.FC = () => {
  // Lives here, not in a page: both Hero and FeaturesHero use the gated
  // entrance classes, so either can be the landing route.
  useAnimationGate();

  return (
    <div className="min-h-screen bg-canvas text-fg selection:bg-gold selection:text-canvas font-sans">
      {/* Navbar and Footer are shared chrome — outside the routes. */}
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/features" element={<Features />} />
        <Route path="*" element={<Home />} />
      </Routes>

      <Footer />
    </div>
  );
};

export default App;
