import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Features } from './pages/Features';

export const App: React.FC = () => {
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
