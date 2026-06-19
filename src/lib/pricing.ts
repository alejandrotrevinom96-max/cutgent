/**
 * Constantes PÚBLICAS de checkout (sin secretos; seguras para el cliente).
 * URLs de los Payment Links de Stripe (LIVE) y precios. Si rotas los links en
 * Stripe, actualiza aquí.
 */
export const PRICING = {
  early: {
    label: "Early adopter",
    priceUsd: 129,
    note: "primeras 50",
    url: "https://buy.stripe.com/6oU6oHbQ44zg6oz7wL6EU00",
  },
  standard: {
    label: "Standard",
    priceUsd: 199,
    url: "https://buy.stripe.com/fZuaEXbQ47Ls7sD04j6EU01",
  },
} as const;

/** Contacto de soporte / solicitud de licencia indie gratuita. */
export const SUPPORT_EMAIL = "alejandro.trevinom96@gmail.com";

/** Abre un enlace de compra en el navegador del sistema (Electron lo intercepta
 *  con shell.openExternal; en el navegador abre una pestaña nueva). */
export function openBuy(url: string): void {
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
}
