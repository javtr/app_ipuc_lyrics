import React from 'react';
import { Info } from 'lucide-react';

interface FallbackNoticeBannerProps {
  message?: string;
}

/**
 * Muestra un aviso discreto cuando se presenta la versión base del catálogo general
 * porque la adaptación de otra sede aún no está sincronizada en el dispositivo.
 */
export const FallbackNoticeBanner: React.FC<FallbackNoticeBannerProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-[11px] sm:text-xs text-amber-200 flex items-start gap-2">
      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
};
