const SPHERES = [
  { id: 1, cx: 390, cy: 80,  r: 150, anim: 'sphere-float-a', dur: 20, delay: 0 },
  { id: 2, cx: 55,  cy: 315, r: 168, anim: 'sphere-float-b', dur: 26, delay: 3 },
  { id: 3, cx: 265, cy: 495, r: 182, anim: 'sphere-float-c', dur: 22, delay: 7 },
  { id: 4, cx: 450, cy: 515, r: 108, anim: 'sphere-float-a', dur: 17, delay: 1 },
  { id: 5, cx: 142, cy: 735, r: 145, anim: 'sphere-float-b', dur: 28, delay: 5 },
  { id: 6, cx: 398, cy: 820, r: 140, anim: 'sphere-float-c', dur: 21, delay: 9 },
  { id: 7, cx: 238, cy: 955, r: 110, anim: 'sphere-float-a', dur: 24, delay: 2 },
];

const SPHERE_GRADIENT = [
  'radial-gradient(circle at 38% 33%,',
  '#2c2c2c 0%,',
  '#1c1c1c 50%,',
  '#111111 76%,',
  'rgba(148,84,0,0.28) 83%,',
  'rgba(205,122,0,0.88) 90%,',
  'rgba(175,100,0,0.52) 94%,',
  'rgba(100,55,0,0.14) 97%,',
  'transparent 100%)',
].join(' ');

export function SpheresBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: '#131316', overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, #2b2b2b 1.5px, transparent 1.5px)',
        backgroundSize: '22px 22px',
      }} />
      {SPHERES.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: s.cx - s.r,
          top: s.cy - s.r,
          width: s.r * 2,
          height: s.r * 2,
          borderRadius: '50%',
          background: SPHERE_GRADIENT,
          boxShadow: `0 0 ${Math.round(s.r * 0.22)}px rgba(185,112,0,0.38), 0 0 ${Math.round(s.r * 0.45)}px rgba(155,85,0,0.16)`,
          animation: `${s.anim} ${s.dur}s ease-in-out ${s.delay}s infinite`,
          willChange: 'transform',
        }} />
      ))}
    </div>
  );
}
