import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, PerformanceMonitor, Stats } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Cockpit } from './components/Cockpit'
import { CarBody } from './components/CarBody'
import { PALETTE, PAINT_PALETTE, PART_NAMES, PRESETS, useStore, type PartId } from './store'

// 按需加载重型 GLB 组件，避免首屏同时拉取多个模型
const ConceptCar = lazy(() => import('./components/ConceptCar'))
const BmwM4 = lazy(() => import('./components/BmwM4'))

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

      {view === 'sedan' ? (
        <>
          <CarBody />
          <Cockpit />
        </>
      ) : view === 'concept' ? (
        <Suspense fallback={<Html center><div className="loading">轿车模型加载中…</div></Html>}>
          <ConceptCar />
          {/* GLB 轿车是单 mesh 空壳，内饰模式叠加程序化座舱 */}
          <group visible={interiorMode} position={[0, 0, -0.12]} scale={[0.9, 0.95, 0.9]}>
            <Cockpit />
          </group>
        </Suspense>
      ) : (
        <Suspense fallback={<Html center><div className="loading">BMW M4 分层模型加载中…</div></Html>}>
          <BmwM4 />
        </Suspense>
      )}
      {/* 程序化车身需要地面阴影才有展台感；GLB 模型自带真实阴影，关闭 ContactShadows 节省开销 */}
      {view === 'sedan' && (
        <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={9} blur={2.5} far={9} />
      )}

      <OrbitControlsTarget />
    </Canvas>
  )
}

/** 根据模式切换 OrbitControls 观察目标与相机位置 */
function OrbitControlsTarget() {
  const view = useStore((s) => s.view)
  const interiorMode = useStore((s) => s.interiorMode)
  const controlsRef = useRef<OrbitControlsImpl>(null)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (interiorMode) {
      controls.object.position.set(0.55, 1.55, 1.7)
      controls.target.set(0, 0.85, 0.1)
      controls.minDistance = 0.4
      controls.maxDistance = 2.5
    } else {
      controls.object.position.set(4.2, 2.1, 4.8)
      controls.target.set(0, 0.85, 0)
      controls.minDistance = 0.9
      controls.maxDistance = 10
    }
    controls.update()
  }, [interiorMode, view])

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0.85, 0]}
      minDistance={0.9}
      maxDistance={10}
      maxPolarAngle={Math.PI / 2.05}
      enableDamping
      dampingFactor={0.08}
    />
  )
}

const Panel = memo(function Panel() {
  const selected = useStore((s) => s.selected)
  const colors = useStore((s) => s.colors)
  const select = useStore((s) => s.select)
  const setColor = useStore((s) => s.setColor)
  const applyPreset = useStore((s) => s.applyPreset)
  const roofHidden = useStore((s) => s.roofHidden)
  const toggleRoof = useStore((s) => s.toggleRoof)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const interiorMode = useStore((s) => s.interiorMode)
  const setInteriorMode = useStore((s) => s.setInteriorMode)

  const palette = selected === 'body_paint' ? PAINT_PALETTE : PALETTE
  const partIds = (Object.keys(PART_NAMES) as PartId[]).filter((id) => {
    if (view === 'sedan') return true
    if (view === 'concept') return interiorMode ? id !== 'body_paint' : id === 'body_paint'
    return true
  })

  return (
    <div className="panel">
      <h1>内饰配置器</h1>
      <p className="hint">拖拽旋转 · 滚轮缩放 · 点击车身/内饰部件换色</p>

      <div className="section">
        <h2>车型</h2>
        <div className="presets">
          <button className={view === 'sedan' ? 'view-active' : ''} onClick={() => setView('sedan')}>轿车（程序化）</button>
          <button className={view === 'concept' ? 'view-active' : ''} onClick={() => setView('concept')}>轿车（GLB）</button>
          <button className={view === 'bmw' ? 'view-active' : ''} onClick={() => setView('bmw')}>BMW M4（分层）</button>
        </div>
      </div>

      {view !== 'sedan' && (
        <div className="section">
          <h2>视角</h2>
          <div className="presets">
            <button className={!interiorMode ? 'view-active' : ''} onClick={() => setInteriorMode(false)}>外观</button>
            <button className={interiorMode ? 'view-active' : ''} onClick={() => setInteriorMode(true)}>内饰</button>
          </div>
        </div>
      )}

      {(view === 'sedan' || view === 'bmw') && (
        <label className="roof-toggle">
          <input type="checkbox" checked={roofHidden} onChange={toggleRoof} />
          隐藏车顶（查看内饰）
        </label>
      )}

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

export default function App() {
  return (
    <div className="app">
      <Scene />
      <Panel />
    </div>
  )
}
