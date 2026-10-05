'use client';

import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; opacity: number; opacitySpeed: number;
}

interface Ring {
  x: number; y: number; radius: number; angle: number; speed: number;
  color: string; lineWidth: number; scaleX: number; scaleY: number;
}

export default function Scene3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Particle[] = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5,
      opacity: Math.random(),
      opacitySpeed: Math.random() * 0.01 + 0.003,
    }));

    const rings: Ring[] = [
      { x: 0.75, y: 0.3, radius: 60, angle: 0, speed: 0.008, color: '#C9922A', lineWidth: 2, scaleX: 1, scaleY: 0.35 },
      { x: 0.25, y: 0.65, radius: 45, angle: 1, speed: -0.006, color: '#E8C16A', lineWidth: 1.5, scaleX: 1, scaleY: 0.4 },
      { x: 0.6, y: 0.75, radius: 35, angle: 2, speed: 0.01, color: '#C9922A', lineWidth: 1, scaleX: 0.7, scaleY: 1 },
      { x: 0.15, y: 0.2, radius: 50, angle: 0.5, speed: -0.009, color: '#E8C16A', lineWidth: 1.5, scaleX: 1, scaleY: 0.45 },
    ];

    function draw() {
      if (!ctx || !canvas) return;
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        p.opacity += p.opacitySpeed;
        if (p.opacity > 1 || p.opacity < 0) p.opacitySpeed *= -1;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 193, 106, ${p.opacity * 0.6})`;
        ctx.fill();
      }

      for (const ring of rings) {
        ring.angle += ring.speed;
        const cx = ring.x * canvas.width;
        const cy = ring.y * canvas.height;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.angle);
        ctx.scale(ring.scaleX, ring.scaleY);
        ctx.beginPath();
        ctx.ellipse(0, 0, ring.radius, ring.radius, 0, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.lineWidth;
        ctx.globalAlpha = 0.5 + Math.sin(t * ring.speed * 30) * 0.2;
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      const orbs = [
        { ox: 0.72, oy: 0.28, size: 12, phase: 0 },
        { ox: 0.28, oy: 0.7, size: 9, phase: 1 },
        { ox: 0.6, oy: 0.72, size: 7, phase: 2 },
        { ox: 0.18, oy: 0.35, size: 10, phase: 3 },
      ];
      for (const orb of orbs) {
        const ox = orb.ox * canvas.width;
        const oy = orb.oy * canvas.height + Math.sin(t * 0.8 + orb.phase) * 8;
        const s = orb.size;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(t * 0.5 + orb.phase);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.6, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.6, 0);
        ctx.closePath();
        const g2 = ctx.createRadialGradient(0, -s * 0.3, 0, 0, 0, s);
        g2.addColorStop(0, 'rgba(232,193,106,0.9)');
        g2.addColorStop(1, 'rgba(201,146,42,0.1)');
        ctx.fillStyle = g2;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
