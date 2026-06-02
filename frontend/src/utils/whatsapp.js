export const WHATSAPP_PHONE = '5599985127056';

const whatsappMessages = {
  cta_fixo: 'Olá! Vi o site da DRM Energia Solar e quero falar com um especialista para saber quanto posso economizar na minha conta de energia.',
  popup_mobile: 'Olá! Estou no site da DRM Energia Solar pelo celular e quero atendimento para fazer minha proposta de energia solar.',
  rodape: 'Olá! Vim pelo site da DRM Energia Solar e quero tirar dúvidas sobre energia solar para minha casa ou empresa.',
  secao_beneficios: 'Olá! Vi os benefícios da energia solar no site da DRM e quero entender qual sistema é ideal para mim.',
  secao_como_funciona: 'Olá! Vi como funciona a instalação de energia solar e quero saber os próximos passos para fazer meu orçamento.',
  secao_projetos: 'Olá! Vi os projetos da DRM Energia Solar e quero uma proposta parecida para o meu imóvel.',
  oferta_prazo: 'Olá! Quero aproveitar as condições da DRM Energia Solar e receber uma proposta ainda hoje.',
  prova_social: 'Olá! Vi os resultados dos clientes da DRM Energia Solar e quero saber quanto posso economizar também.',
  resultado_modal: 'Olá! Acabei de fazer minha simulação no site da DRM Energia Solar e quero receber minha proposta completa agora.',
  resultado_modal_fallback: 'Olá! Tentei fazer minha simulação no site da DRM Energia Solar e quero que um especialista finalize meu orçamento pelo WhatsApp.',
};

export function makeWhatsAppLink(source, text) {
  const message = text || whatsappMessages[source] || 'Olá! Vim pelo site da DRM Energia Solar e quero uma proposta de energia solar.';
  const encoded = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encoded}`;
}
