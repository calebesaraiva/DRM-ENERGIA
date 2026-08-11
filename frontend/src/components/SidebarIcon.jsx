const SidebarIcon = ({ name }) => {
  const icons = {
    clientes: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.2-6.4A5 5 0 0 1 15 9c0 .7-.1 1.4-.4 2H16Zm-8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.7-6 3.8V19h12v-2.2C14 14.7 11.3 13 8 13Zm8 0c-.6 0-1.1.1-1.7.2 1.1.9 1.7 2.1 1.7 3.6V19h6v-2.2c0-2.1-2.7-3.8-6-3.8Z" /></svg>
    ),
    leads: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" /></svg>
    ),
    whatsapp: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2A10 10 0 0 0 3.6 17.4L2.3 22l4.8-1.2A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.5-2.8-1.2-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2.1 1-2.4.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.2.3-.1.5.2.3.7 1.1 1.6 1.9 1.1.9 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.3.7-.2.2.1 1.6.8 1.9.9.3.1.4.2.5.3.1.2.1.8-.1 1.4Z" /></svg>
    ),
    orcamentos: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z" /></svg>
    ),
    contratos: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h8l4 4v16H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.8V7h3.2L14 3.8ZM8 11h8v1.8H8V11Zm0 3.5h8v1.8H8v-1.8Zm0 3.5h5v1.8H8V18Z" /></svg>
    ),
    produtosPacotes: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Zm8 1.7 4.9-2.7L12 3.8 7.1 6.5 12 9.2Zm-6 6.1 5 2.8v-7.2L6 8.1v7.2Zm7 2.8 5-2.8V8.1l-5 2.8v7.2Z" /></svg>
    ),
    financeiro: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15.5V19h-2v-1.5a4.2 4.2 0 0 1-3-1.6l1.4-1.4a2.8 2.8 0 0 0 2.4 1.1c1 0 1.7-.4 1.7-1.1 0-.8-.8-1.1-2.1-1.5-1.6-.5-3-1.2-3-3 0-1.5 1-2.7 2.6-3.1V5h2v1.4a4 4 0 0 1 2.6 1.2l-1.4 1.4a2.5 2.5 0 0 0-1.9-.8c-.9 0-1.5.4-1.5 1 0 .7.7 1 2 1.4 1.7.5 3.2 1.2 3.2 3.1 0 1.8-1.2 3.1-3 3.5Z" /></svg>
    ),
    usuarios: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a4 4 0 0 0-4 4v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm-2 6V6a2 2 0 1 1 4 0v2h-4Zm3 8.7V19h-2v-2.3a2 2 0 1 1 2 0Z" /></svg>
    ),
    dashboard: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6v7H4v-7Zm10-9h6v16h-6V4ZM4 4h6v7H4V4Z" /></svg>
    ),
    projetos: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>
    ),
    homologacao: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4V4Zm1 6h14v10H5V10Zm3 2v2h8v-2H8Zm0 4v2h5v-2H8Zm9.7-3.2-3 3-1.4-1.4-1.3 1.3 2.7 2.7 4.3-4.3-1.3-1.3Z" /></svg>
    ),
    ordensServico: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h6V5H9v2Zm-.5 4h7v2h-7v-2Zm0 4h5v2h-5v-2Z" /></svg>
    ),
    precosSistemas: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 6v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V6l-9-4Zm1 15h-2v-1.4a4 4 0 0 1-2.6-1.3l1.3-1.4c.6.6 1.3.9 2.2.9.8 0 1.3-.3 1.3-.8 0-.6-.6-.8-1.8-1.2-1.4-.4-2.7-1-2.7-2.6 0-1.3.9-2.3 2.3-2.7V5h2v1.4c.9.2 1.6.6 2.2 1.1L14 9c-.5-.4-1-.6-1.7-.6-.7 0-1.1.3-1.1.7 0 .5.5.7 1.6 1 1.5.5 2.9 1 2.9 2.8 0 1.4-.9 2.4-2.7 2.8V17Z" /></svg>
    ),
    comunicacoes: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3V5Zm2 2v.7l7 4.7 7-4.7V7H5Zm14 10V10l-7 4.5L5 10v7h14Z" /></svg>
    ),
  };

  return icons[name] || icons.leads;
};

export default SidebarIcon;
