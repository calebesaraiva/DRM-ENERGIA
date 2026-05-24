import React from 'react';
import Hero from '../components/Hero';
import Benefits from '../components/Benefits';
import ProjectGallery from '../components/ProjectGallery';
import HowItWorks from '../components/HowItWorks';

const Home = () => {
  return (
    <main>
      <Hero />
      <Benefits />
      <ProjectGallery />
      <HowItWorks />
    </main>
  );
};

export default Home;
