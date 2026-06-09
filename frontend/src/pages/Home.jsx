import { useEffect } from 'react';
import Hero from '../components/Hero';
import Benefits from '../components/Benefits';
import ProjectGallery from '../components/ProjectGallery';
import HowItWorks from '../components/HowItWorks';
import { TrustBar, SocialProof } from '../components/ConversionSections';

const Home = () => {
  useEffect(() => {
    const sections = document.querySelectorAll('.reveal-section');
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      {/* 1. Hero with inline simulator */}
      <div className="reveal-section"><Hero /></div>

      {/* 2. Trust bar stats */}
      <div className="reveal-section"><TrustBar /></div>

      {/* 3. Social proof — before/after */}
      <div className="reveal-section"><SocialProof /></div>

      {/* 4. Portfolio */}
      <div className="reveal-section"><ProjectGallery /></div>

      {/* 5. Benefits — 6 cards */}
      <div className="reveal-section"><Benefits /></div>

      {/* 6. How it works + FAQ + dark CTA */}
      <div className="reveal-section"><HowItWorks /></div>
    </main>
  );
};

export default Home;
