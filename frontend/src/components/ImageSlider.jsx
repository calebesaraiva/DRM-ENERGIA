import { useState, useEffect } from 'react';
import './ImageSlider.css';

const images = [
  '/assets/cliente1.jpg',
  '/assets/cliente2.jpeg',
  '/assets/cliente3.jpeg',
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
            <img src={img} alt={`Instalação ${index + 1}`} />
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
