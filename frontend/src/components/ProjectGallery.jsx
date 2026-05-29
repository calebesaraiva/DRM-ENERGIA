import React, { useState, useEffect } from 'react';
import ImageSlider from './ImageSlider';
import './ProjectGallery.css';
import { makeWhatsAppLink } from '../utils/whatsapp';

const ProjectGallery = ({ onOpenSimulation }) => {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/portfolio`)
      .then(res => res.json())
      .then(data => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  return (
    <section id="projetos" className="gallery-section">
      <div className="container">
        <div className="section-header">
          <span className="section-subtitle">Nosso Portfólio</span>
          <h2 className="section-title">Projetos Entregues</h2>
          <p className="section-desc">Confira algumas instalações realizadas pela nossa equipe técnica.</p>
        </div>

        <ImageSlider />

        <div className="gallery-grid">
          {projects.map((project, index) => (
            <div key={project.id} className="project-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="project-image-wrapper">
                <img src={project.imageUrl} alt={project.title} className="project-image" />
              </div>
              <div className="project-info">
                <h3>{project.title}</h3>
                <p>{project.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="section-cta-row">
          <button className="btn btn-primary" type="button" onClick={() => onOpenSimulation?.()}>Quero um projeto assim</button>
          <a className="btn btn-outline" href={makeWhatsAppLink('secao_projetos')} target="_blank" rel="noopener noreferrer">Ver condições no WhatsApp</a>
        </div>
      </div>
    </section>
  );
};

export default ProjectGallery;
