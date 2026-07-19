'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * The boot-splash core: a wireframe sentinel that ASSEMBLES (scales + fades up
 * from a cold field) and SETTLES into a gentle idle spin. Adapted from the
 * Replay orbital core, code-split and mounted only when motion + WebGL are
 * available; otherwise the BootSplash shows a static resolved SVG frame instead.
 * CYAN ONLY — a boot screen is nominal, never amber/red.
 */
const CORE = new THREE.Color('#2b6b7d');
const EDGE = new THREE.Color('#54d4e6');

function Assembling() {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt * 0.9);
    const e = 1 - Math.pow(1 - t.current, 3); // easeOutCubic assemble
    for (const m of [outer.current, inner.current]) {
      if (!m) continue;
      const s = 0.2 + 0.8 * e;
      m.scale.setScalar(s);
      (m.material as THREE.MeshBasicMaterial).opacity = e * (m === inner.current ? 0.9 : 0.55);
      m.rotation.y += dt * 0.3;
      m.rotation.x += dt * 0.1;
    }
  });
  return (
    <>
      <mesh ref={outer}>
        <icosahedronGeometry args={[1.7, 1]} />
        <meshBasicMaterial color={CORE} wireframe transparent opacity={0} />
      </mesh>
      <mesh ref={inner}>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshBasicMaterial color={EDGE} wireframe transparent opacity={0} />
      </mesh>
    </>
  );
}

export default function SplashCore() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <Assembling />
    </Canvas>
  );
}
