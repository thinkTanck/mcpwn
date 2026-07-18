'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import type { Step } from '@/contract';
import { stepMeta } from './step-meta';

/**
 * The 3D orbital timeline (register: PRODUCT hero). Step nodes ride a ring around
 * a wireframe sentinel core; GSAP tweens the ring so the ACTIVE node rotates to
 * front as the playhead advances. Lazily loaded by Replay (dynamic import, no
 * SSR) so the WebGL bundle never blocks LCP, and only mounted when motion is
 * allowed and WebGL is present — otherwise Replay shows the static timeline.
 * Perf-budgeted: capped dpr, low-poly, unlit basic materials.
 */

const CY = new THREE.Color('#54d4e6');
const AM = new THREE.Color('#ebb561');
const RED = new THREE.Color('#ed576e');
const INK = new THREE.Color('#708c9e');
const CORE = new THREE.Color('#2b6b7d');

function nodeColor(step: Step, breach: boolean): THREE.Color {
  if (breach) return RED;
  const band = stepMeta(step.type).band;
  return band === 'nominal' ? CY : band === 'caution' ? AM : INK;
}

const RADIUS = 3.1;

function Ring({
  steps,
  current,
  compromiseIndex,
  onSelect,
}: {
  steps: Step[];
  current: number;
  compromiseIndex: number;
  onSelect: (i: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const n = steps.length;

  // Angle that brings node i to the front (top of the ring, facing camera).
  const targetZ = useRef(0);
  useEffect(() => {
    const per = (Math.PI * 2) / n;
    targetZ.current = current * per;
    if (group.current) {
      gsap.to(group.current.rotation, { z: targetZ.current, duration: 0.7, ease: 'power3.out' });
    }
  }, [current, n]);

  const positions = useMemo(
    () =>
      steps.map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        // ring in the XY plane; front (toward camera / top) is angle -PI/2
        return new THREE.Vector3(Math.sin(a) * RADIUS, Math.cos(a) * RADIUS, 0);
      }),
    [steps, n],
  );

  const ringGeom = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a) * RADIUS, Math.cos(a) * RADIUS, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  return (
    <group ref={group}>
      <lineLoop geometry={ringGeom}>
        <lineBasicMaterial color={CORE} transparent opacity={0.5} />
      </lineLoop>
      {steps.map((step, i) => {
        const breach = i === compromiseIndex;
        const active = i === current;
        const reached = i <= current;
        const color = nodeColor(step, breach);
        const r = active ? 0.34 : breach ? 0.26 : 0.2;
        return (
          <group key={step.id} position={positions[i]}>
            <mesh
              // Counter-rotate labels/nodes so they don't spin with the ring.
              onClick={(e) => {
                e.stopPropagation();
                onSelect(i);
              }}
              onPointerOver={() => (document.body.style.cursor = 'pointer')}
              onPointerOut={() => (document.body.style.cursor = '')}
            >
              <sphereGeometry args={[r, 16, 16]} />
              <meshBasicMaterial color={color} transparent opacity={reached ? 1 : 0.35} />
            </mesh>
            {active && (
              <mesh>
                <ringGeometry args={[r + 0.08, r + 0.13, 24]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.8}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function Core() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (mesh.current) {
      mesh.current.rotation.y += dt * 0.25;
      mesh.current.rotation.x += dt * 0.08;
    }
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.25, 1]} />
      <meshBasicMaterial color={CORE} wireframe transparent opacity={0.7} />
    </mesh>
  );
}

export default function OrbitalCore({
  steps,
  current,
  compromiseIndex,
  onSelect,
}: {
  steps: Step[];
  current: number;
  compromiseIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8.4], fov: 50 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <Core />
      <Ring steps={steps} current={current} compromiseIndex={compromiseIndex} onSelect={onSelect} />
    </Canvas>
  );
}
