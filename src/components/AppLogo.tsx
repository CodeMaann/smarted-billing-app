import React from 'react';

interface AppLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showShadow?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 rounded-lg p-0.5',
  sm: 'w-8 h-8 rounded-xl p-1',
  md: 'w-10 h-10 rounded-2xl p-1.5',
  lg: 'w-14 h-14 rounded-2xl p-2',
  xl: 'w-16 h-16 rounded-3xl p-2.5',
};

export function AppLogo({ size = 'md', className = '', showShadow = true }: AppLogoProps) {
  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const shadowClass = showShadow ? 'shadow-sm border border-slate-200/90' : '';

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden select-none bg-white ${sizeClass} ${shadowClass} ${className}`}
    >
      <img
        src="/app-logo.svg"
        alt="Smarted Billing System"
        className="w-full h-full object-contain"
        referrerPolicy="no-referrer"
        onError={(e) => {
          // Fallback to PNG if SVG rendering is restricted
          const target = e.currentTarget;
          if (target.src.endsWith('.svg')) {
            target.src = '/app-logo.png';
          }
        }}
      />
    </div>
  );
}
