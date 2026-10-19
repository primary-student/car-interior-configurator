import { memo, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { useStore, type PartId } from '../store'
import { MatCtx, type MatKey } from './MatCtx'

/** 材质生成：每个 (roughness, metalness, physical) 组合只创建一次材质实例 */
function createMaterial(key: MatKey, color: string, glow: number) {
  if (key.physical) {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.3,
      metalness: 0.4,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: '#ffffff',
      emissiveIntensity: glow,
    })
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: key.roughness,
    metalness: key.metalness,
    emissive: '#ffffff',
    emissiveIntensity: glow,
  })
}

/** 构造一个已定位/旋转的 box geometry，用于合并 */
function box(w: number, h: number, d: number, pos: [number, number, number], rot?: [number, number, number]) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(pos[0], pos[1], pos[2])
  if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2])
  return g
}

/** 部件内统一使用的 PBR 材质：只改属性，不重建材质 */
const M = memo(function M({ roughness = 0.75, metalness = 0.05, physical = false }: Partial<MatKey>) {
  const ctx = useContext(MatCtx)
  if (!ctx) return null
  const mat = ctx.getMat({ roughness, metalness, physical: !!physical })
  return <primitive object={mat} attach="material" />
})

export const Part = memo(function Part({ id, children }: { id: PartId; children: ReactNode }) {
  const color = useStore((s) => s.colors[id])
  const selected = useStore((s) => s.selected === id)
  const select = useStore((s) => s.select)
  const [hovered, setHovered] = useState(false)
  const glow = selected ? 0.3 : hovered ? 0.12 : 0
  const matCache = useRef<Map<string, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>>(new Map())

  const getMat = useCallback((key: MatKey) => {
    const k = `${key.roughness}_${key.metalness}_${key.physical ? 1 : 0}`
    let mat = matCache.current.get(k)
    if (!mat) {
      mat = createMaterial(key, color, glow)
      matCache.current.set(k, mat)
    } else {
      mat.color.set(color)
      mat.emissiveIntensity = glow
    }
    return mat
  }, [color, glow])

  const ctxValue = useMemo(() => ({ getMat }), [getMat])

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select(id)
  }, [id, select])

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }, [])

  const onPointerOut = useCallback(() => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }, [])

  return (
    <MatCtx.Provider value={ctxValue}>
      <group
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        {children}
      </group>
    </MatCtx.Provider>
  )
})

// ---- 各部件造型（单位为米，车头朝 -Z） ----

/** 合并后的座椅几何体：坐垫 + 靠背 + 头枕 = 1 个 draw call */
const seatGeo = mergeGeometries([
  box(0.55, 0.14, 0.55, [0, 0.42, 0.45]),
  box(0.55, 0.62, 0.13, [0, 0.78, 0.72], [0.18, 0, 0]),
  box(0.26, 0.16, 0.1, [0, 1.16, 0.78], [0.18, 0, 0]),
])

const Seat = memo(function Seat({ id, x }: { id: PartId; x: number }) {
  return (
    <Part id={id}>
      <mesh position={[x, 0, 0]} castShadow>
        <primitive object={seatGeo} attach="geometry" />
        <M roughness={0.9} />
      </mesh>
      <mesh position={[x, 0.34, 0.45]}>
        <boxGeometry args={[0.4, 0.04, 0.6]} />
        <meshStandardMaterial color="#111111" metalness={0.7} roughness={0.4} />
      </mesh>
    </Part>
  )
})

const SteeringWheel = memo(function SteeringWheel() {
  return (
    <Part id="steering">
      <mesh position={[-0.4, 0.98, -0.62]} rotation={[Math.PI / 2.6, 0, 0]} castShadow>
        <torusGeometry args={[0.19, 0.025, 16, 48]} />
        <M roughness={0.6} />
      </mesh>
      <mesh position={[-0.4, 0.98, -0.62]} rotation={[Math.PI / 2.6, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.035, 24]} />
        <M roughness={0.6} />
      </mesh>
      <mesh position={[-0.4, 0.92, -0.78]} rotation={[Math.PI / 2.6, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.3, 16]} />
        <meshStandardMaterial color="#222222" roughness={0.8} />
      </mesh>
    </Part>
  )
})

/** 合并后的仪表台几何体：主体 + 盖板 + 仪表盘罩 */
const dashboardGeo = mergeGeometries([
  box(1.7, 0.28, 0.45, [0, 0.92, -0.98]),
  box(1.7, 0.04, 0.5, [0, 1.07, -1.02]),
])

const Dashboard = memo(function Dashboard() {
  return (
    <Part id="dashboard">
      <mesh castShadow>
        <primitive object={dashboardGeo} attach="geometry" />
        <M roughness={0.7} />
      </mesh>
      <mesh position={[-0.4, 1.1, -0.95]}>
        <sphereGeometry args={[0.16, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <M roughness={0.7} />
      </mesh>
    </Part>
  )
})

/** 合并后的门板几何体：门板主体 + 扶手 */
const doorPanelGeo = mergeGeometries([
  box(0.07, 0.7, 1.9, [0, 0, 0]),
  box(0.09, 0.06, 0.45, [-0.06, 0.1, 0.2]),
])

const DoorPanel = memo(function DoorPanel({ id, side }: { id: PartId; side: 1 | -1 }) {
  const x = 0.88 * side
  return (
    <Part id={id}>
      <mesh position={[x, 0.75, -0.1]} castShadow>
        <primitive object={doorPanelGeo} attach="geometry" />
        <M roughness={0.75} />
      </mesh>
    </Part>
  )
})

/** 合并后的中控台几何体 */
const consoleGeo = mergeGeometries([
  box(0.3, 0.35, 0.9, [0, 0, 0]),
  box(0.26, 0.02, 0.3, [0, 0.19, 0.2]),
])

const CenterConsole = memo(function CenterConsole() {
  return (
    <Part id="console">
      <mesh position={[0, 0.5, 0.15]} castShadow>
        <primitive object={consoleGeo} attach="geometry" />
        <M roughness={0.6} />
      </mesh>
    </Part>
  )
})

const InfotainmentScreen = memo(function InfotainmentScreen() {
  return (
    <group>
      <Part id="screen_frame">
        <mesh position={[0, 1.05, -0.8]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[0.42, 0.26, 0.03]} />
          <M roughness={0.35} metalness={0.4} />
        </mesh>
      </Part>
      <mesh position={[0, 1.05, -0.783]} rotation={[-0.12, 0, 0]}>
        <planeGeometry args={[0.38, 0.22]} />
        <meshStandardMaterial color="#0a0e14" emissive="#3fa9f5" emissiveIntensity={0.55} />
      </mesh>
    </group>
  )
})

export { M }

export const Cockpit = memo(function Cockpit() {
  const select = useStore((s) => s.select)
  const onPointerMissed = useCallback(() => select(null), [select])
  return (
    <group onPointerMissed={onPointerMissed}>
      <mesh position={[0, 0.28, 0]} receiveShadow>
        <boxGeometry args={[1.85, 0.06, 2.6]} />
        <meshStandardMaterial color="#191b1d" roughness={0.95} />
      </mesh>

      <Dashboard />
      <SteeringWheel />
      <Seat id="seat_driver" x={-0.4} />
      <Seat id="seat_passenger" x={0.4} />
      <DoorPanel id="door_left" side={-1} />
      <DoorPanel id="door_right" side={1} />
      <CenterConsole />
      <InfotainmentScreen />
    </group>
  )
})
