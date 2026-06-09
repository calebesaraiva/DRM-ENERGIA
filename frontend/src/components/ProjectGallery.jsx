import { useState, useEffect } from 'react';
import './ProjectGallery.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import { withApiBase } from '../utils/apiBase';

const projectIcons = {
  residencial: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  comercial: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  igreja: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
};

const staticProjects = [
  { id: 1, imageUrl: '/assets/foto1.png', title: 'Sistema Residencial', description: 'Imperatriz - MA', iconKey: 'residencial' },
  { id: 2, imageUrl: '/assets/cliente2.jpeg', title: 'Comércio do Araujo', description: 'Barra do Corda - MA', iconKey: 'comercial' },
  { id: 3, imageUrl: '/assets/foto3.png', title: 'Igreja Batista', description: 'Itaguatins - TO', iconKey: 'igreja' },
];

const ProjectGallery = () => {
  const [projects, setProjects] = useState(staticProjects);
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    fetch(withApiBase('/api/portfolio'))
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) && data.length > 0 ? data : null;
      })
      .then((data) => {
        if (!data) return;
        const decorated = staticProjects.map((sp, i) => ({
          ...sp,
          ...(data[i] ? { id: data[i].id } : {}),
        }));
        setProjects(decorated);
      })
      .catch(() => {});
  }, []);

  return (
    <section id="projetos" className="gallery-section">
      <div className="container gallery-inner">
        {/* LEFT text */}
        <div className="gallery-text">
          <span className="section-label">NOSSO PORTFÓLIO</span>
          <h2 className="section-title">Projetos entregues</h2>
          <p className="gallery-desc">
            Instalações realizadas com qualidade, segurança e equipamentos de alta performance.
          </p>
          <a
            href={makeWhatsAppLink('secao_projetos')}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gallery-outline"
          >
            Ver todos os projetos
          </a>
        </div>

        {/* RIGHT photos */}
        <div className="gallery-photos">
          {projects.map((project) => (
            <div key={project.id} className="gallery-photo-card">
              <div className="gallery-photo-wrap">
                <img
                  src={project.imageUrl}
                  alt={project.title}
                  className="gallery-photo-img"
                  onError={(e) => {
                    const src = e.currentTarget.getAttribute('src') || '';
                    if (src.endsWith('.jpg')) { e.currentTarget.src = src.replace('.jpg', '.jpeg'); return; }
                    if (src.endsWith('.jpeg')) { e.currentTarget.src = src.replace('.jpeg', '.jpg'); }
                  }}
                />
              </div>
              <div className="gallery-photo-info">
                <span className="gallery-photo-icon">{projectIcons[project.iconKey] || projectIcons.residencial}</span>
                <div>
                  <p className="gallery-photo-title">{project.title}</p>
                  <p className="gallery-photo-loc">{project.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div className="gallery-dots">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            className={`gallery-dot ${dotIndex === i ? 'active' : ''}`}
            onClick={() => setDotIndex(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default ProjectGallery;
