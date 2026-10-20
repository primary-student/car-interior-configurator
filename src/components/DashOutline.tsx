import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

/** 选中描边颜色：青色，深色内饰/深蓝车漆上都能辨认 */
export const OUTLINE_COLOR = '#3fd0ff'
/** 描边线宽（CSS 像素） */
const OUTLINE_WIDTH = 2.2
/** 沿部件自身包围盒中心微放大，避免虚线与表面共面导致 z-fighting */
const OUTLINE_INFLATE = 1.0025
/** 折边阈值：从「只留结构棱线」逐级放宽，直到能描出足够线段 */
const THRESHOLDS = [42, 22, 12]
/** 每个 mesh 至少需要这么多段，否则说明折边太少（光滑曲面），换更低的阈值 */
const MIN_SEGMENTS = 8
/** 每段至少要是部件尺寸的这个比例，否则视为碎边（虚线相位按段长重置，碎段会变成一堆实心点） */
const MIN_SEG_RATIO = 0.02
const MIN_SEG_FLOOR = 0.015
const MIN_SEG_CEIL = 0.05

/**
 * 选中态虚线描边。
 * 把一组 mesh 的折边（EdgesGeometry）烘焙成世界坐标的虚线，挂到场景根节点。
 * 用 LineSegments2 保证线宽可控（默认 1px 的线在内饰件上几乎看不见）。
 * 只做叠加显示，**不改动**被选物体的材质颜色/自发光 —— 选中不再靠变色表达。
 */
export function DashOutlineLayer({ meshes, version }: { meshes: THREE.Object3D[]; version?: string }) {
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const key = version ?? ''
  const matRef = useRef<LineMaterial | null>(null)

  // LineMaterial 的线宽是按像素算的，必须跟上画布尺寸
  useEffect(() => {
    matRef.current?.resolution.set(size.width, size.height)
  }, [size])

  useEffect(() => {
    if (meshes.length === 0) return

    let line: LineSegments2 | null = null
    let geo: LineSegmentsGeometry | null = null
    let mat: LineMaterial | null = null

    const build = () => {
      scene.updateMatrixWorld(true)

      const invScene = new THREE.Matrix4().copy(scene.matrixWorld).invert()
      const m4 = new THREE.Matrix4()
      const a = new THREE.Vector3()
      const b = new THREE.Vector3()
      const c = new THREE.Vector3()
      const box = new THREE.Box3()
      const boxSize = new THREE.Vector3()
      const verts: number[] = []

      meshes.forEach((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.visible) return
        const src = obj.geometry
        if (!src || !src.getAttribute('position')) return

        src.computeBoundingBox()
        src.boundingBox?.getCenter(c)
        m4.copy(invScene).multiply(obj.matrixWorld)

        // 最短线段阈值随部件尺寸走：大件滤碎边防噪点，小件（方向盘/拨杆）保留细边
        box.setFromObject(obj)
        const diag = box.isEmpty() ? 1 : box.getSize(boxSize).length()
        const minLen = Math.min(MIN_SEG_CEIL, Math.max(MIN_SEG_FLOOR, diag * MIN_SEG_RATIO))
        const minLen2 = minLen * minLen

        // 逐级放宽阈值，取第一个能描出足够线段的档位（光滑曲面在 42° 下没有折边）
        for (const th of THRESHOLDS) {
          const edges = new THREE.EdgesGeometry(src, th)
          const pos = edges.getAttribute('position') as THREE.BufferAttribute | undefined
          const out: number[] = []
          if (pos) {
            for (let i = 0; i + 1 < pos.count; i += 2) {
              a.fromBufferAttribute(pos, i).sub(c).multiplyScalar(OUTLINE_INFLATE).add(c).applyMatrix4(m4)
              b.fromBufferAttribute(pos, i + 1).sub(c).multiplyScalar(OUTLINE_INFLATE).add(c).applyMatrix4(m4)
              if (a.distanceToSquared(b) < minLen2) continue
              out.push(a.x, a.y, a.z, b.x, b.y, b.z)
            }
          }
          edges.dispose()
          if (out.length / 6 >= MIN_SEGMENTS) {
            verts.push(...out)
            return
          }
        }
      })
      if (verts.length === 0) return

      geo = new LineSegmentsGeometry()
      geo.setPositions(verts)
      mat = new LineMaterial({
        color: OUTLINE_COLOR,
        linewidth: OUTLINE_WIDTH,
        dashed: true,
        dashSize: 0.075,
        gapSize: 0.055,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      })
      mat.resolution.set(size.width, size.height)
      line = new LineSegments2(geo, mat)
      line.computeLineDistances()
      // 纯视觉层：不参与射线拾取，避免挡住部件点击
      line.raycast = () => undefined
      line.renderOrder = 8
      line.frustumCulled = false
      scene.add(line)
      matRef.current = mat

      if (typeof window !== 'undefined') {
        ;(window as unknown as Record<string, unknown>).__dashStats = {
          verts: verts.length / 3,
          meshes: meshes.length,
          color: OUTLINE_COLOR,
        }
      }
    }

    // 等本帧其它 effect（部件可见性、车顶几何切换）先落地，避免描到已隐藏/旧几何上
    const raf = requestAnimationFrame(build)

    return () => {
      cancelAnimationFrame(raf)
      if (line) scene.remove(line)
      geo?.dispose()
      mat?.dispose()
      matRef.current = null
      if (typeof window !== 'undefined') {
        ;(window as unknown as Record<string, unknown>).__dashStats = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes, scene, key])

  return null
}
