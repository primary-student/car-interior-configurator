import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'

/** 不属于车漆的材质名（车灯/玻璃/轮胎/塑料件） */
const NON_PAINT = new Set(['Windows', 'Black', 'Grey', 'Headlights', 'TailLights'])

/** 普通轿车 GLB 展示层（Quaternius 低多边形轿车，CC0）
 *  该车是单 mesh 外壳，没有独立车顶/内饰网格。
 *  内饰模式直接隐藏整个外壳+车窗，露出叠加的程序化座舱。
 */
const MODEL_URL = `${import.meta.env.BASE_URL}models/sedan.glb`

export default function ConceptCar() {
  const { scene } = useGLTF(MODEL_URL)
  const colors = useStore((s) => s.colors)
  const select = useStore((s) => s.select)
  const interiorMode = useStore((s) => s.interiorMode)
  const setSceneReady = useStore((s) => s.setSceneReady)

  // 模型已挂载（Suspense 已 resolve）→ 通知外层收起加载提示
  useEffect(() => {
    setSceneReady(true)
    return () => setSceneReady(false)
  }, [setSceneReady])

  const originalRaycast = useRef<WeakMap<THREE.Mesh, THREE.Mesh['raycast']>>(new WeakMap())
  const prevColor = useRef<string>('')

  // 归一化：最长边 ≈ 4.6m，贴地居中；按材质名分类 mesh
  const { normalized, paintMats, paintMeshes, windowMeshes } = useMemo(() => {
    const cloned = scene.clone(true)
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const scale = 4.6 / Math.max(size.x, size.z)
    cloned.scale.setScalar(scale)
    box.setFromObject(cloned)
    const center = box.getCenter(new THREE.Vector3())
    cloned.position.set(-center.x, -box.min.y, -center.z)

    const paintMats = new Set<THREE.Material>()
    const paintMeshes = new Set<THREE.Mesh>()
    const windowMeshes = new Set<THREE.Mesh>()

    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        // 轿车只有车身大壳需要阴影，玻璃/小件关闭
        obj.castShadow = true
        obj.receiveShadow = true
        mats.forEach((m) => {
          if (m.name === 'Windows') {
            windowMeshes.add(obj)
          } else if (!NON_PAINT.has(m.name)) {
            paintMats.add(m)
            paintMeshes.add(obj)
          }
        })
      }
    })
    return { normalized: cloned, paintMats, paintMeshes, windowMeshes }
  }, [scene])

  // 增量更新车身颜色
  useEffect(() => {
    if (prevColor.current === colors.body_paint) return
    const c = colors.body_paint
    paintMats.forEach((m) => {
      const mat = m as THREE.MeshStandardMaterial
      mat.color.set(c)
    })
    prevColor.current = c
  }, [colors.body_paint, paintMats])

  // 组件卸载时释放 clone 出的几何体/材质
  useEffect(() => {
    return () => {
      normalized.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose())
        }
      })
    }
  }, [normalized])

  // 内饰模式：隐藏车漆车身 + 车窗，避免车顶/侧围/穿模问题
  useEffect(() => {
    paintMats.forEach((m) => {
      const mat = m as THREE.MeshStandardMaterial
      if (interiorMode) {
        mat.transparent = true
        mat.opacity = 0.12
        mat.depthWrite = false
      } else {
        mat.transparent = false
        mat.opacity = 1
        mat.depthWrite = true
      }
    })

    const allHidden = new Set<THREE.Mesh>([...paintMeshes, ...windowMeshes])
    allHidden.forEach((mesh) => {
      mesh.visible = !interiorMode
      if (interiorMode) {
        if (!originalRaycast.current.has(mesh)) {
          originalRaycast.current.set(mesh, mesh.raycast)
        }
        mesh.raycast = () => undefined
      } else {
        const orig = originalRaycast.current.get(mesh)
        if (orig) mesh.raycast = orig
      }
    })
  }, [interiorMode, paintMats, paintMeshes, windowMeshes])

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (interiorMode) return
    e.stopPropagation()
    select('body_paint')
  }, [interiorMode, select])

  return <primitive object={normalized} onClick={onClick} />
}
