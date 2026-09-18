import { useId } from "react";

interface OrbitIconProps {
  size?: number;
  className?: string;
}

/** Orbit's robot mascot: white helmet, purple visor, cyan ear ring. */
export function OrbitIcon({ size = 40, className }: OrbitIconProps) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Orbit"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={id("white")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe6f5" />
        </linearGradient>
        <linearGradient id={id("visor")} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#4b3fc9" />
          <stop offset="0.55" stopColor="#b23cf0" />
          <stop offset="1" stopColor="#f07cf6" />
        </linearGradient>
        <linearGradient id={id("blue")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3aa8ff" />
          <stop offset="1" stopColor="#1b2f9a" />
        </linearGradient>
        <linearGradient id={id("purple")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b4bf0" />
          <stop offset="1" stopColor="#f08bd8" />
        </linearGradient>
        <linearGradient id={id("neck")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c2470" />
          <stop offset="0.7" stopColor="#3a2f9a" />
          <stop offset="1" stopColor="#e86bd4" />
        </linearGradient>
      </defs>

      {/* shoulders */}
      <path d="M100 352 L205 302 L335 322 L432 332 L478 392 L456 440 L372 462 L345 395 L300 405 L205 472 L120 440 Z" fill={`url(#${id("white")})`} />
      <path d="M64 396 Q120 348 202 362 L192 420 L152 492 L76 432 Z" fill={`url(#${id("blue")})`} />
      <path d="M432 335 L488 386 L472 416 L440 442 L432 392 Z" fill={`url(#${id("purple")})`} />
      <path d="M340 396 L368 462" stroke="#b8c4e0" strokeWidth="4" fill="none" />

      {/* neck */}
      <path d="M196 250 L330 300 L305 335 L205 305 Z" fill={`url(#${id("neck")})`} />

      {/* helmet shell */}
      <path
        d="M128 152 Q136 40 300 20 Q452 30 468 200 Q462 292 392 318 Q300 302 200 244 Q120 214 128 152 Z"
        fill={`url(#${id("white")})`}
      />
      {/* lower band */}
      <path d="M192 192 Q300 252 418 240 Q422 292 388 312 Q292 292 196 236 Z" fill="#f4f7fc" stroke="#c9d3ea" strokeWidth="3" />

      {/* visor */}
      <path d="M255 92 Q352 74 456 122 Q452 222 426 242 Q330 236 266 176 Q244 132 255 92 Z" fill={`url(#${id("visor")})`} />
      <path d="M270 100 Q340 90 420 118" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="6" strokeLinecap="round" fill="none" />

      {/* ear piece */}
      <circle cx="178" cy="140" r="64" fill="#1f2a7a" />
      <circle cx="178" cy="140" r="44" fill="none" stroke="#22d3ee" strokeWidth="7" />
      <circle cx="178" cy="140" r="30" fill="#17206a" />
      <circle cx="178" cy="140" r="22" fill="#22eaf5" />
    </svg>
  );
}
