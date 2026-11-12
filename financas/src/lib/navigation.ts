/**
 * Navegação com recarga completa. Usada após login/logout para que o
 * servidor (proxy) receba os cookies de sessão atualizados.
 */
export function hardNavigate(path: string) {
   
  window.location.assign(path);
}
