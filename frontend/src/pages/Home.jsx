import { useEffect, useState } from 'react';
import Hero from '../components/Hero';
import Benefits from '../components/Benefits';
import ProjectGallery from '../components/ProjectGallery';
import HowItWorks from '../components/HowItWorks';
import LeadSimulationModal from '../components/LeadSimulationModal';
import { TrustBar, SocialProof } from '../components/ConversionSections';

const Home = () => {
  const [isSimulationOpen, setIsSimulationOpen] = useState(
    () => localStorage.getItem('openSimulationOnHome') === '1',
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
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const openSimulation = () => setIsSimulationOpen(true);

  return (
    <main>
      <div className="reveal-section">
        <Hero onOpenSimulation={openSimulation} />
      </div>
      <div className="reveal-section"><TrustBar /></div>
      <div className="reveal-section"><SocialProof /></div>
      <div className="reveal-section"><ProjectGallery /></div>
      <div className="reveal-section"><Benefits onOpenSimulation={openSimulation} /></div>
      <div className="reveal-section"><HowItWorks onOpenSimulation={openSimulation} /></div>

      <LeadSimulationModal
        isOpen={isSimulationOpen}
        onClose={() => setIsSimulationOpen(false)}
      />
    </main>
  );
};

export default Home;
