import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, PerformanceMonitor, Stats, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { peek } from 'suspend-react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Cockpit } from './components/Cockpit'
import { ModelErrorBoundary } from './components/ModelErrorBoundary'
import { PALETTE, PAINT_PALETTE, PART_NAMES, PRESETS, useStore, type PartId } from './store'

// 按需加载重型 GLB 组件，避免首屏同时拉取多个模型
const ConceptCar = lazy(() => import('./components/ConceptCar'))
const BmwM4 = lazy(() => import('./components/BmwM4'))

// BMW 模型（draco 压缩）URL 与 BmwM4 组件内一致，预加载可命中同一份 drei 缓存
const BMW_MODEL_URL = `${import.meta.env.BASE_URL}models/bmw-m4-csl.glb`
// draco 解码器本地路径，必须与 BmwM4 组件内 DRACO_PATH 完全一致，
// 否则预加载的解码配置与组件加载不一致会导致解码失败
const BMW_DRACO_PATH = `${import.meta.env.BASE_URL}draco/`

// 进入网站即开始下载 BMW 模型并写入 drei 缓存（缓存 key 为 [GLTFLoader, BMW_MODEL_URL]），
// 这样点击 BMW 按钮时直接命中缓存、不再重新下载。
// 用模块级 flag 防止 StrictMode / HMR 重复触发（suspend-react 本身也已幂等）。
let bmwPreloadStarted = false
function startBmwPreload() {
  if (bmwPreloadStarted) return
  bmwPreloadStarted = true
  useGLTF.preload(BMW_MODEL_URL, BMW_DRACO_PATH)
}
startBmwPreload()

function Scene() {
  const view = useStore((s) => s.view)
  const interiorMode = useStore((s) => s.interiorMode)
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 1.5))

  return (
    <Canvas
      dpr={dpr}
      shadows
      camera={{ position: [4.2, 2.1, 4.8], fov: 45 }}
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #8b9096 0%, #4a4e54 70%)' }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(Math.min(window.devicePixelRatio, 1.5))}
      />
      <Stats className="stats" />

      {/* 灯光：简化到核心三盏，降低每帧光照开销 */}
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 1.5, 0.2]} intensity={0.6} color="#fff4e0" />

      {/* 摄影棚环境贴图：降低分辨率 + 减少光源数量，仍保留车漆反射 */}
      <Environment resolution={128}>
        <Lightformer intensity={2.0} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
        <Lightformer intensity={1.0} position={[-4, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 2, 1]} />
        <Lightformer intensity={1.0} position={[4, 2, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 2, 1]} />
      </Environment>

      {/* 摄影棚地面：给内饰/驾驶员视角提供地平线与落影，避免外面一片纯色虚空 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color="#3b3e43" roughness={0.95} metalness={0} />
      </mesh>

      {view === 'concept' ? (
        <ModelErrorBoundary label="轿车（GLB）模型加载失败，请检查网络">
          <Suspense fallback={null}>
            <ConceptCar />
            {/* GLB 轿车是单 mesh 空壳，内饰模式叠加程序化座舱 */}
            <group visible={interiorMode} position={[0, 0, -0.12]} scale={[0.9, 0.95, 0.9]}>
              <Cockpit />
            </group>
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        <ModelErrorBoundary label="BMW M4 分层模型加载失败，请检查网络">
          <Suspense fallback={null}>
            <BmwM4 />
          </Suspense>
        </ModelErrorBoundary>
      )}

      <OrbitControlsTarget />
      <DriverLook />
    </Canvas>
  )
}

/** 根据模式切换 OrbitControls 观察目标与相机位置 */
function OrbitControlsTarget() {
  const view = useStore((s) => s.view)
  const interiorMode = useStore((s) => s.interiorMode)
  const bmwAnchors = useStore((s) => s.bmwAnchors)
  const controlsRef = useRef<OrbitControlsImpl>(null)

  // BMW 内饰且已拿到驾驶位锚点 → 驾驶员视角（坐进驾驶座朝前看）
  const bmwDriverView = view === 'bmw' && interiorMode && !!bmwAnchors

  const minDistance = bmwDriverView ? 0.4 : interiorMode ? 0.4 : 0.9
  const maxDistance = bmwDriverView ? 12 : interiorMode ? 6 : 10
  // 驾驶员视角需要允许接近水平视线（极角略大于 90°）
  const maxPolarAngle = bmwDriverView ? Math.PI / 2 + 0.12 : Math.PI / 2.05

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (bmwDriverView) {
      // 驾驶位固定视角由 <DriverLook> 每帧接管，这里只把 target 对齐视线，
      // 不再 update()，避免与固定相机的位置设定互相争抢。
      const [lx, ly, lz] = bmwAnchors!.look
      controls.target.set(lx, ly, lz)
      return
    }
    if (view === 'bmw' && interiorMode) {
      // 锚点尚未就绪时的兜底：去顶后俯视进舱
      controls.object.position.set(0.9, 2.2, 2.6)
      controls.target.set(0, 0.55, 0)
    } else if (interiorMode) {
      controls.object.position.set(0.55, 1.55, 1.7)
      controls.target.set(0, 0.85, 0.1)
    } else {
      controls.object.position.set(4.2, 2.1, 4.8)
      controls.target.set(0, 0.85, 0)
    }
    controls.update()
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>
      w.__bmwCam = {
        pos: controls.object.position.toArray(),
        target: controls.target.toArray(),
        mode: interiorMode ? 'interior' : 'exterior',
      }
      // 调试用：外部可指定相机位姿，便于截图核对（不影响正常交互）
      w.__orbit = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
        controls.object.position.set(px, py, pz)
        controls.target.set(tx, ty, tz)
        controls.update()
      }
    }
  }, [interiorMode, view, bmwAnchors, bmwDriverView])

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0.85, 0]}
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={maxPolarAngle}
      enabled={!bmwDriverView}
      enableDamping
      dampingFactor={0.08}
    />
  )
}

// ---- 内饰固定视角：相机钉在眼位，只允许小范围转头（上下左右） ----
const YAW_LIMIT = (38 * Math.PI) / 180 // 左右各 38°
const PITCH_LIMIT = (24 * Math.PI) / 180 // 上下各 24°
const BASE_FOV = 45 // 外观视角的默认视场角
const INTERIOR_FOV = 74 // 内饰视角放大视场，座位里能看到更多仪表台/侧窗
const UP_AXIS = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()
const _right = new THREE.Vector3()
const _lookAt = new THREE.Vector3()

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * BMW 内饰模式：相机位置锁死在前排两座之间（略微靠后），
 * 拖拽只改变视线方向（yaw/pitch），并限制在 ±38° / ±24° 内。
 * 不支持缩放、平移、绕车旋转 —— 就像坐在两座之间左右看、抬头低头。
 */
function DriverLook() {
  const view = useStore((s) => s.view)
  const interiorMode = useStore((s) => s.interiorMode)
  const anchors = useStore((s) => s.bmwAnchors)
  const { camera, gl } = useThree()
  const active = view === 'bmw' && interiorMode && !!anchors

  const yaw = useRef(0)
  const pitch = useRef(0)
  const tYaw = useRef(0)
  const tPitch = useRef(0)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // 进出内饰模式时视线回正
  useEffect(() => {
    yaw.current = 0
    pitch.current = 0
    tYaw.current = 0
    tPitch.current = 0
  }, [active])

  // 内饰模式放大视场角（退出时恢复原值），让座舱里能看到的范围更广
  useEffect(() => {
    if (!active) return
    const cam = camera as THREE.PerspectiveCamera
    const prevFov = cam.fov
    cam.fov = INTERIOR_FOV
    cam.updateProjectionMatrix()
    return () => {
      cam.fov = prevFov || BASE_FOV
      cam.updateProjectionMatrix()
    }
  }, [active, camera])

  // 调试钩子：外部可把视线摆到指定角度（用于自动化截图核对）
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__look = (yawDeg: number, pitchDeg: number) => {
      tYaw.current = clampNum((yawDeg * Math.PI) / 180, -YAW_LIMIT, YAW_LIMIT)
      tPitch.current = clampNum((pitchDeg * Math.PI) / 180, -PITCH_LIMIT, PITCH_LIMIT)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const el = gl.domElement
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      d.x = e.clientX
      d.y = e.clientY
      // 灵敏度 0.0030 rad/px：拖满约 220px 到达左右极限
      tYaw.current = clampNum(tYaw.current - dx * 0.003, -YAW_LIMIT, YAW_LIMIT)
      tPitch.current = clampNum(tPitch.current - dy * 0.0026, -PITCH_LIMIT, PITCH_LIMIT)
    }
    const onUp = () => {
      drag.current = null
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      drag.current = null
    }
  }, [active, gl])

  useFrame(() => {
    if (!active || !anchors) return
    const w = window as unknown as Record<string, unknown>
    if (w.__freeCam) return // 调试：放开相机以便外部截俯视/侧视图
    const [ex, ey, ez] = anchors.eye
    const [lx, ly, lz] = anchors.look

    // 位置固定（不随拖拽移动）
    camera.position.set(ex, ey, ez)

    // 阻尼趋近目标角度
    yaw.current += (tYaw.current - yaw.current) * 0.16
    pitch.current += (tPitch.current - pitch.current) * 0.16

    _dir.set(lx - ex, ly - ey, lz - ez).normalize()
    _dir.applyAxisAngle(UP_AXIS, yaw.current)
    _right.crossVectors(_dir, UP_AXIS)
    if (_right.lengthSq() > 1e-6) {
      _right.normalize()
      _dir.applyAxisAngle(_right, pitch.current)
    }
    camera.lookAt(_lookAt.copy(camera.position).add(_dir))

    w.__bmwCam = {
      pos: [ex, ey, ez],
      target: _lookAt.toArray(),
      mode: 'driver',
      yawDeg: +((yaw.current * 180) / Math.PI).toFixed(2),
      pitchDeg: +((pitch.current * 180) / Math.PI).toFixed(2),
    }
  })

  return null
}

const Panel = memo(function Panel({ bmwReady }: { bmwReady: boolean }) {
  const selected = useStore((s) => s.selected)
  const colors = useStore((s) => s.colors)
  const select = useStore((s) => s.select)
  const setColor = useStore((s) => s.setColor)
  const applyPreset = useStore((s) => s.applyPreset)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const interiorMode = useStore((s) => s.interiorMode)
  const setInteriorMode = useStore((s) => s.setInteriorMode)

  const palette = selected === 'body_paint' ? PAINT_PALETTE : PALETTE
  const partIds = (Object.keys(PART_NAMES) as PartId[]).filter((id) => {
    if (view === 'concept') return interiorMode ? id !== 'body_paint' : id === 'body_paint'
    return true
  })

  return (
    <div className="panel">
      <h1>内饰配置器</h1>
      <p className="hint">
        {!interiorMode
          ? '拖拽旋转 · 滚轮缩放 · 点击车身/内饰部件换色'
          : view === 'bmw'
            ? '固定在前排两座之间 · 拖拽可上下左右环视（不可缩放/绕车）'
            : '内饰视角 · 拖拽环视 · 滚轮缩放'}
      </p>
      <div className="section">
        <h2>车型</h2>
        <div className="presets">
          <button className={view === 'concept' ? 'view-active' : ''} onClick={() => setView('concept')}>轿车（GLB）</button>
          <button className={view === 'bmw' ? 'view-active' : ''} onClick={() => setView('bmw')}>BMW M4</button>
        </div>
        {!bmwReady && <p className="hint bmw-hint">BMW 模型加载中…（约 2 MB，之后走浏览器缓存）</p>}
      </div>

      <div className="section">
        <h2>视角</h2>
        <div className="presets">
          <button className={!interiorMode ? 'view-active' : ''} onClick={() => setInteriorMode(false)}>外观</button>
          <button className={interiorMode ? 'view-active' : ''} onClick={() => setInteriorMode(true)}>内饰</button>
        </div>
      </div>

      <div className="section">
        <h2>搭配方案</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} onClick={() => applyPreset(p.colors)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>部件</h2>
        <div className="parts">
          {partIds.map((id) => (
            <button
              key={id}
              className={selected === id ? 'part active' : 'part'}
              onClick={() => select(selected === id ? null : id)}
            >
              <span className="dot" style={{ background: colors[id] }} />
              {PART_NAMES[id]}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="section">
          <h2>{PART_NAMES[selected]} · 配色</h2>
          <div className="swatches">
            {palette.map((c) => (
              <button
                key={c.value}
                title={c.name}
                className={colors[selected] === c.value ? 'swatch active' : 'swatch'}
                style={{ background: c.value }}
                onClick={() => setColor(selected, c.value)}
              />
            ))}
          </div>
        </div>
      )}

      {view === 'concept' && (
        <p className="credit">
          轿车模型：Quaternius Low Poly Sedan（CC0，可免署名商用）
        </p>
      )}
      {view === 'bmw' && (
        <p className="credit">
          BMW M4 CSL 模型：CC BY 4.0，© AshishB2000 / BMW M4 CSL Configurator
        </p>
      )}
    </div>
  )
})

/** 监听 CSS media query 匹配状态 */
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

/** 画布加载提示：放在 Canvas 外层做 DOM 覆盖层，避免在 R3F 树里用 drei Html 引发 removeChild 冲突 */
const SceneLoading = memo(function SceneLoading() {
  const view = useStore((s) => s.view)
  const sceneReady = useStore((s) => s.sceneReady)
  if (sceneReady) return null
  return (
    <div className="scene-loading">
      <span className="scene-loading-dot" />
      {view === 'bmw' ? 'BMW M4 模型加载中…' : '轿车模型加载中…'}
    </div>
  )
})

export default function App() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [panelOpen, setPanelOpen] = useState(!isMobile)
  const [bmwReady, setBmwReady] = useState(false)

  useEffect(() => {
    setPanelOpen(!isMobile)
  }, [isMobile])

  // 轮询 drei 缓存：BMW 模型后台下载完成后，面板提示由“下载中”变为可切换。
  // 用 peek 直接查全局缓存，无需重复发起请求。
  useEffect(() => {
    if (bmwReady) return
    const id = window.setInterval(() => {
      try {
        if (peek([GLTFLoader, BMW_MODEL_URL])) {
          setBmwReady(true)
          window.clearInterval(id)
        }
      } catch {
        /* peek 不可用时静默忽略，点击 BMW 仍走缓存 */
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [bmwReady])

  return (
    <div className="app">
      <div className="viewport">
        <Scene />
        <SceneLoading />
      </div>
      <button
        className="panel-toggle"
        aria-label="切换配置面板"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((v) => !v)}
      >
        {panelOpen ? '✕' : '☰'}
      </button>
      <div className={`panel-outer ${panelOpen ? 'panel-open' : 'panel-closed'} ${isMobile ? 'panel-mobile' : ''}`}>
        <Panel bmwReady={bmwReady} />
      </div>
    </div>
  )
}
