import { useContext, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import { MatCtx } from './MatCtx'
import { Part } from './Cockpit'

/** 半透明玻璃材质 */
function Glass({ opacity = 0.22 }: { opacity?: number }) {
  return (
    <meshPhysicalMaterial
      color="#aac4d4"
      transparent
      opacity={opacity}
      roughness={0.05}
      metalness={0}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  )
}

/** 构造一个已定位/旋转的 box geometry，用于合并 */
function box(w: number, h: number, d: number, pos: [number, number, number], rot?: [number, number, number]) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(pos[0], pos[1], pos[2])
  if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2])
  return g
}

const Wheel = ({ x, z }: { x: number; z: number }) => {
  return (
    <group position={[x, 0.34, z]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.22, 20]} />
        <meshStandardMaterial color="#16181a" roughness={0.95} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.19, 0.19, 0.23, 8]} />
        <meshStandardMaterial color="#c0c4c9" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  )
}

/** 必须在 Part 内部渲染，才能拿到共享材质 */
function BodyShell({ bodyGeo, roofGeo, roofOff }: {
  bodyGeo: THREE.BufferGeometry
  roofGeo: THREE.BufferGeometry
  roofOff: boolean
}) {
  const ctx = useContext(MatCtx)
  const paintMat = ctx?.getMat({ roughness: 0.3, metalness: 0.4, physical: true })
  return (
    <>
      <mesh geometry={bodyGeo} material={paintMat} castShadow receiveShadow />
      {!roofOff && <mesh geometry={roofGeo} material={paintMat} castShadow receiveShadow />}
    </>
  )
}

/**
 * 程序化轿车外壳（车头朝 -Z，全长 ~4.6m）
 * 车身中段挖空：前舱/后舱实心，乘员舱只做侧围，避免吞掉内饰座舱
 *
 * 性能优化：车身大壳合并为一个 geometry（1 个 draw call），车顶合并为另一个。
 */
export function CarBody() {
  const roofOff = useStore((s) => s.interiorMode)

  const bodyGeo = useMemo(() => {
    return mergeGeometries([
      box(1.84, 0.42, 1.16, [0, 0.56, -1.72]),
      box(1.84, 0.42, 1.1, [0, 0.56, 1.75]),
      box(0.07, 0.76, 2.3, [-0.9, 0.72, 0.05]),
      box(0.07, 0.76, 2.3, [0.9, 0.72, 0.05]),
      box(1.78, 0.05, 1.16, [0, 0.79, -1.72], [-0.045, 0, 0]),
      box(1.78, 0.05, 0.85, [0, 0.8, 1.86]),
    ])
  }, [])

  const roofGeo = useMemo(() => {
    return mergeGeometries([
      box(1.7, 0.045, 1.15, [0, 1.53, 0.05]),
      box(0.055, 0.06, 0.78, [-0.8, 1.3, -0.85], [-0.588, 0, 0]),
      box(0.055, 0.06, 0.78, [0.8, 1.3, -0.85], [-0.588, 0, 0]),
      box(0.055, 0.45, 0.07, [-0.8, 1.31, 0.08]),
      box(0.055, 0.45, 0.07, [0.8, 1.31, 0.08]),
      box(0.07, 0.08, 1.05, [-0.78, 1.18, 1.01], [0.694, 0, 0]),
      box(0.07, 0.08, 1.05, [0.78, 1.18, 1.01], [0.694, 0, 0]),
    ])
  }, [])

  const glassGeo = useMemo(() => {
    return mergeGeometries([
      box(1.58, 0.015, 0.75, [0, 1.3, -0.85], [-0.588, 0, 0]),
      box(1.5, 0.015, 0.98, [0, 1.18, 1.01], [0.694, 0, 0]),
      box(0.015, 0.4, 0.78, [-0.83, 1.31, -0.4]),
      box(0.015, 0.4, 0.5, [-0.83, 1.31, 0.36]),
      box(0.015, 0.4, 0.78, [0.83, 1.31, -0.4]),
      box(0.015, 0.4, 0.5, [0.83, 1.31, 0.36]),
    ])
  }, [])

  return (
    <group>
      <Part id="body_paint">
        <BodyShell bodyGeo={bodyGeo} roofGeo={roofGeo} roofOff={roofOff} />
      </Part>

      {!roofOff && (
        <mesh geometry={glassGeo} castShadow={false} receiveShadow={false}>
          <Glass />
        </mesh>
      )}

      <Wheel x={-0.82} z={-1.45} />
      <Wheel x={0.82} z={-1.45} />
      <Wheel x={-0.82} z={1.45} />
      <Wheel x={0.82} z={1.45} />

      {[-0.58, 0.58].map((x) => (
        <mesh key={`hl${x}`} position={[x, 0.72, -2.29]} castShadow={false} receiveShadow={false}>
          <boxGeometry args={[0.36, 0.09, 0.06]} />
          <meshStandardMaterial color="#dfe8f0" emissive="#cfe6ff" emissiveIntensity={0.9} />
        </mesh>
      ))}
      {[-0.58, 0.58].map((x) => (
        <mesh key={`tl${x}`} position={[x, 0.74, 2.29]} castShadow={false} receiveShadow={false}>
          <boxGeometry args={[0.4, 0.08, 0.05]} />
          <meshStandardMaterial color="#5a0d0d" emissive="#e02020" emissiveIntensity={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, -2.3]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1.1, 0.14, 0.06]} />
        <meshStandardMaterial color="#101214" roughness={0.6} metalness={0.3} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={`mir${s}`} position={[0.92 * s, 1.02, -0.62]}>
          <mesh position={[0.08 * s, 0, 0]} castShadow={false} receiveShadow={false}>
            <boxGeometry args={[0.14, 0.03, 0.03]} />
            <meshStandardMaterial color="#222528" />
          </mesh>
          <mesh position={[0.16 * s, 0.01, 0]} castShadow={false} receiveShadow={false}>
            <boxGeometry args={[0.07, 0.09, 0.12]} />
            <meshStandardMaterial color="#222528" roughness={0.4} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.01, 0]} receiveShadow>
        <cylinderGeometry args={[3.6, 3.6, 0.04, 48]} />
        <meshStandardMaterial color="#3a3e43" roughness={0.85} />
      </mesh>
    </group>
  )
}
