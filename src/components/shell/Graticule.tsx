/** Ambient control-room backdrop: faint cyan grid + top radial glow. Decorative. */
export function Graticule() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(rgba(84,212,230,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(84,212,230,.03) 1px,transparent 1px)',
          backgroundSize: '44px 44px',
          backgroundPosition: 'center',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(120% 90% at 50% -10%,rgba(43,107,125,.14),transparent 60%)',
        }}
      />
    </div>
  );
}
