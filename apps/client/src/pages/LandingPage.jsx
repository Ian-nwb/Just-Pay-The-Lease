import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { Navbar } from '../components/common/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { BentoGrid01 } from '../components/ui/bento-grid-01';
import { RoleBreakdown } from '../components/landing/RoleBreakdown';
import { Testimonials } from '../components/landing/Testimonials';
import { PricingSection } from '../components/landing/PricingSection';
import { Footer } from '../components/common/Footer';

export const LandingPage = ({ onNavigate = () => { } }) => {
  const { theme, toggleTheme } = useTheme();

  // Trigger scroll-reveal animations
  useScrollReveal();

  const handleOpenLogin = () => {
    onNavigate('/register');
  };
  const openResidentPortal = () => onNavigate('/tenant-login');

  return (
    <div className="landing min-h-screen font-sans">

      {/* 1. Header Navigation */}
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={onNavigate}
      />

      {/* 2. Hero Section with Interactive Canvas */}
      <HeroSection
        onGetStarted={handleOpenLogin}
        onResidentPortal={openResidentPortal}
      />

      {/* 3. System Capabilities Bento Grid */}
      <BentoGrid01 />

      {/* 4. Role-Based Access Control Breakdown */}
      <RoleBreakdown onOpenLogin={handleOpenLogin} />

      {/* 5. Testimonials Section */}
      <Testimonials />

      {/* 6. Pricing Section */}
      <PricingSection onNavigate={onNavigate} />

      {/* 7. System Footer */}
      <Footer />

    </div>
  );
};
