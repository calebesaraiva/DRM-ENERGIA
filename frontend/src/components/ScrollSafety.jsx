import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const unlockDocumentScroll = () => {
  const elements = [document.documentElement, document.body];
  elements.forEach((element) => {
    if (!element) return;
    const style = element.style;
    if (style.overflow === 'hidden') style.removeProperty('overflow');
    if (style.overflowY === 'hidden') style.removeProperty('overflow-y');
    if (style.position === 'fixed') style.removeProperty('position');
    if (style.height === '100%') style.removeProperty('height');
    if (style.touchAction === 'none') style.removeProperty('touch-action');
  });
};

function ScrollSafety() {
  const { pathname } = useLocation();

  useEffect(() => {
    unlockDocumentScroll();
    const observer = new MutationObserver(unlockDocumentScroll);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('pageshow', unlockDocumentScroll);
    window.addEventListener('focus', unlockDocumentScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('pageshow', unlockDocumentScroll);
      window.removeEventListener('focus', unlockDocumentScroll);
    };
  }, [pathname]);

  return null;
}

export default ScrollSafety;
