import { useState, useEffect } from 'react';
import './ImageSlider.css';

const images = [
  '/assets/cliente1.jpg',
  '/assets/cliente2.jpeg',
  '/assets/cliente3.jpg',
  '/assets/cliente4.jpeg',
  '/assets/cliente5.jpeg',
  '/assets/cliente6.jpeg'
];

const ImageSlider = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="slider-container">
      <div className="slider-wrapper">
        {images.map((img, index) => (
          <div 
            key={index} 
            className={`slide ${index === currentIndex ? 'active' : ''}`}
          >
            <img
              src={img}
              alt={`Instalação ${index + 1}`}
              onError={(event) => {
                const current = event.currentTarget.getAttribute('src') || '';
                const triedFallback = event.currentTarget.dataset.triedFallback === '1';
                if (!triedFallback && current.endsWith('.jpeg')) {
                  event.currentTarget.dataset.triedFallback = '1';
                  event.currentTarget.src = current.replace('.jpeg', '.jpg');
                  return;
                }
                if (!triedFallback && current.endsWith('.jpg')) {
                  event.currentTarget.dataset.triedFallback = '1';
                  event.currentTarget.src = current.replace('.jpg', '.jpeg');
                  return;
                }
                event.currentTarget.style.display = 'none';
                event.currentTarget.closest('.slide')?.classList.add('image-error');
              }}
            />
          </div>
        ))}
        <div className="slider-dots">
          {images.map((_, index) => (
            <button 
              key={index} 
              className={`dot ${index === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImageSlider;
