"use client";

import { useId } from "react";

/**
 * Marca de Cutgent — concepto "Aperture C": un monograma "C" (anillo con apertura)
 * con una cuña/cuchilla en la boca. Gradiente morado→índigo→naranja.
 * variant: "gradient" (color), "white" (mono claro), "ink" (mono oscuro).
 */
export function CutgentMark({
  size = 24,
  variant = "gradient",
  title = "Cutgent",
}: {
  size?: number;
  variant?: "gradient" | "white" | "ink";
  title?: string;
}) {
  const id = useId();
  const stroke = variant === "white" ? "#fff" : variant === "ink" ? "#14121a" : `url(#${id})`;
  const wedge = variant === "white" ? "#fff" : variant === "ink" ? "#14121a" : "#F97316";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img" aria-label={title}>
      {variant === "gradient" && (
        <defs>
          <linearGradient id={id} x1="18" y1="18" x2="82" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B5CF6" />
            <stop offset="0.5" stopColor="#6366F1" />
            <stop offset="1" stopColor="#F97316" />
          </linearGradient>
        </defs>
      )}
      <path d="M76 33 A32 32 0 1 0 76 67" stroke={stroke} strokeWidth="13" strokeLinecap="round" />
      <path d="M66 50 L86 41 L82 50 L86 59 Z" fill={wedge} />
    </svg>
  );
}

/** Lockup: marca + palabra "Cutgent". */
export function CutgentLogo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CutgentMark size={size} />
      <span className="text-sm font-semibold tracking-tight text-text">Cutgent</span>
    </div>
  );
}
