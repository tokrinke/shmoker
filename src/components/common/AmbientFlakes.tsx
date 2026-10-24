import { useEffect, useRef } from 'react';
import './ambient.css';

interface Props {
  /** "calm" is used in the waiting room, "normal" on the landing page. */
  density?: 'normal' | 'calm';
}

interface Flake {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  phase: number;
  twinkle: number;
  alpha: number;
}

/**
 * Soft gold flakes drifting down and to the left from the top-right corner, over a faint warm light.
 * Pure canvas, no dependencies. Switches itself off for people who prefer reduced motion.
 */
export function AmbientFlakes({ density = 'normal' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // One soft glowing dot, drawn once and stamped for every flake
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const spriteContext = sprite.getContext('2d') as CanvasRenderingContext2D;
    const glow = spriteContext.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255, 244, 214, 1)');
    glow.addColorStop(0.28, 'rgba(232, 203, 140, 0.8)');
    glow.addColorStop(1, 'rgba(212, 176, 106, 0)');
    spriteContext.fillStyle = glow;
    spriteContext.fillRect(0, 0, 32, 32);

    const spawn = (scatter: boolean): Flake => {
      const fromTop = Math.random() < 0.72;
      const flake: Flake = {
        x: fromTop ? width * (0.4 + Math.random() * 0.65) : width * (1.01 + Math.random() * 0.04),
        y: fromTop ? -12 - Math.random() * 40 : Math.random() * height * 0.3,
        size: 2.2 + Math.random() * 5.5, // radius in pixels
        vx: -(7 + Math.random() * 16), // pixels per second, drifting left
        vy: 12 + Math.random() * 26, // and slowly down
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.6 + Math.random() * 1.4,
        alpha: 0.3 + Math.random() * 0.55,
      };
      if (scatter) {
        const seconds = Math.random() * (height / flake.vy) * 0.8;
        flake.x += flake.vx * seconds;
        flake.y += flake.vy * seconds;
      }
      return flake;
    };

    const base = density === 'calm' ? 26 : 48;
    const count = Math.round(base * Math.min(1.2, Math.max(0.5, width / 1400)));
    const flakes = Array.from({ length: count }, () => spawn(true));

    let frame = 0;
    let previous = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (document.hidden) return;

      context.clearRect(0, 0, width, height);
      const seconds = now / 1000;
      for (let i = 0; i < flakes.length; i++) {
        const flake = flakes[i];
        flake.x += (flake.vx + Math.sin(seconds * 0.7 + flake.phase) * 6) * delta;
        flake.y += flake.vy * delta;
        if (flake.y > height || flake.x < -30) {
          flakes[i] = spawn(false);
          continue;
        }
        // They fade as they travel away from the corner, so the lower screen stays clean
        const fade = Math.max(0, 1 - (flake.y / height) * 1.05);
        const sparkle = 0.65 + 0.35 * Math.sin(seconds * flake.twinkle + flake.phase);
        context.globalAlpha = flake.alpha * fade * sparkle;
        context.drawImage(sprite, flake.x - flake.size, flake.y - flake.size, flake.size * 2, flake.size * 2);
      }
      context.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [density]);

  return (
    <div className="ambient-flakes" aria-hidden>
      <div className="ambient-flakes__light" />
      <canvas ref={canvasRef} className="ambient-flakes__canvas" />
    </div>
  );
}
