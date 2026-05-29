import { useEffect, useState } from 'react';
import Hero from '../components/Hero';
import Benefits from '../components/Benefits';
import ProjectGallery from '../components/ProjectGallery';
import HowItWorks from '../components/HowItWorks';
import LeadSimulationModal from '../components/LeadSimulationModal';
import { OfferBanner, ObjectionBreakers, SocialProof, TrustBar } from '../components/ConversionSections';

const Home = () => {
  const [isSimulationOpen, setIsSimulationOpen] = useState(
    () => localStorage.getItem('openSimulationOnHome') === '1'
  );

  useEffect(() => {
    const openFromGlobal = () => setIsSimulationOpen(true);
    window.addEventListener('open-simulation-request', openFromGlobal);

    if (localStorage.getItem('openSimulationOnHome') === '1') {
      localStorage.removeItem('openSimulationOnHome');
    }

    return () => window.removeEventListener('open-simulation-request', openFromGlobal);
  }, []);

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
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <div className="reveal-section"><Hero onOpenSimulation={() => setIsSimulationOpen(true)} /></div>
      <div className="reveal-section"><TrustBar /></div>
      <div className="reveal-section"><OfferBanner onOpenSimulation={() => setIsSimulationOpen(true)} /></div>
      <div className="reveal-section"><Benefits onOpenSimulation={() => setIsSimulationOpen(true)} /></div>
      <div className="reveal-section"><ProjectGallery onOpenSimulation={() => setIsSimulationOpen(true)} /></div>
      <div className="reveal-section"><SocialProof /></div>
      <div className="reveal-section"><HowItWorks onOpenSimulation={() => setIsSimulationOpen(true)} /></div>
      <div className="reveal-section"><ObjectionBreakers onOpenSimulation={() => setIsSimulationOpen(true)} /></div>
      <LeadSimulationModal isOpen={isSimulationOpen} onClose={() => setIsSimulationOpen(false)} />
    </main>
  );
};

export default Home;
