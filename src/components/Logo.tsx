import { cn } from '../lib/utils';

export const Logo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={cn("relative flex items-center justify-center", className)}>
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {/* Background Glow */}
      <circle cx="50" cy="50" r="48" fill="url(#logoGrad)" opacity="0.1" />
      
      {/* Speech Bubble / Brain Shape */}
      <path 
        d="M50 15 C25 15 10 35 10 55 C10 75 25 85 40 85 L35 95 L55 85 C80 85 90 65 90 45 C90 25 75 15 50 15Z" 
        fill="none" 
        stroke="url(#logoGrad)" 
        strokeWidth="2.5"
      />
      
      {/* Network side (Left) */}
      <circle cx="30" cy="40" r="2" fill="#0ea5e9" />
      <circle cx="45" cy="35" r="2" fill="#0ea5e9" />
      <circle cx="40" cy="55" r="2" fill="#0ea5e9" />
      <circle cx="25" cy="65" r="2" fill="#0ea5e9" />
      <line x1="30" y1="40" x2="45" y2="35" stroke="#0ea5e9" strokeWidth="0.5" />
      <line x1="45" y1="35" x2="40" y2="55" stroke="#0ea5e9" strokeWidth="0.5" />
      <line x1="40" y1="55" x2="25" y2="65" stroke="#0ea5e9" strokeWidth="0.5" />
      <line x1="25" y1="65" x2="30" y2="40" stroke="#0ea5e9" strokeWidth="0.5" />
 
      {/* Brain/Cloud side (Right) */}
      <path 
        d="M55 35 Q75 35 75 50 T55 65" 
        fill="none" 
        stroke="#38bdf8" 
        strokeWidth="2" 
        strokeDasharray="4 2"
      />
      
      {/* AI Text Center */}
      <text 
        x="50" 
        y="55" 
        fontSize="22" 
        fontWeight="900" 
        textAnchor="middle" 
        fill="url(#logoGrad)" 
        fontFamily="sans-serif"
        className="select-none"
      >AI</text>
      
      {/* Signal Waves */}
      <path d="M75 20 A40 40 0 0 1 95 40" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M82 27 A30 30 0 0 1 97 42" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  </div>
);
