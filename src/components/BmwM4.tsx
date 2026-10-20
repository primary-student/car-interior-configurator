import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, type PartId } from '../store'

/** BMW M4 CSL 分层 GLB（CC BY 4.0）
 *  天然分层：车身/车顶/车门/座椅/方向盘/仪表台/中控台均为独立 mesh。
 */
const MODEL_URL = `${import.meta.env.BASE_URL}models/bmw-m4-csl.glb`
// draco 解码器本地化：模型已用 gltf-transform 做 draco 压缩（2.0MB，比原 3.4MB 小 41%），
// 解码器放在 public/draco/，避免依赖 gstatic CDN，国内访问稳定。
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`

/** 车顶开口区域（车体归一化坐标系） */
type RoofOpenZone = { minX: number; maxX: number; minZ: number; maxZ: number; y: number }

const _v = new THREE.Vector3()

/**
 * 真正的去顶：把落在「车顶开口区」内的三角面从几何体中删除。
 * BMW 模型的车顶外板并进了 body_Paint / body_Black / interior_csl 三个大 mesh，
 * 只隐藏独立车顶板没用，必须裁掉这些整车网格顶部的面。
 * 返回裁剪后的几何（保留原几何用于外观模式切换）；无可裁面片返回 null。
 */
function clipRoofFaces(mesh: THREE.Mesh, zone: RoofOpenZone): { geometry: THREE.BufferGeometry; removed: number } | null {
  const geo = mesh.geometry
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!posAttr) return null

  const m = mesh.matrixWorld
  const count = posAttr.count
  const inside = new Uint8Array(count)
  let hit = 0
  for (let i = 0; i < count; i++) {
    _v.fromBufferAttribute(posAttr, i).applyMatrix4(m)
    if (_v.y > zone.y && _v.x >= zone.minX && _v.x <= zone.maxX && _v.z >= zone.minZ && _v.z <= zone.maxZ) {
      inside[i] = 1
      hit++
    }
  }
  if (hit < 3) return null

  const index = geo.getIndex()
  const total = index ? index.count : count
  const groups = geo.groups.length
    ? geo.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex ?? 0 }))
    : [{ start: 0, count: total, materialIndex: 0 }]

  const kept: number[] = []
  const newGroups: { start: number; count: number; materialIndex: number }[] = []
  let removed = 0
  for (const g of groups) {
    const gStart = kept.length
    const end = Math.min(g.start + g.count, total)
    for (let f = g.start; f + 2 < end; f += 3) {
      const a = index ? index.getX(f) : f
      const b = index ? index.getX(f + 1) : f + 1
      const c = index ? index.getX(f + 2) : f + 2
      if (inside[a] && inside[b] && inside[c]) { removed++; continue }
      kept.push(a, b, c)
    }
    if (kept.length > gStart) newGroups.push({ start: gStart, count: kept.length - gStart, materialIndex: g.materialIndex })
  }
  if (!removed || !kept.length) return null

  const clipped = geo.clone()
  clipped.clearGroups()
  newGroups.forEach((g) => clipped.addGroup(g.start, g.count, g.materialIndex))
  // 索引类型：顶点数超过 65535 必须用 Uint32
  clipped.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(kept, 1) : new THREE.Uint16BufferAttribute(kept, 1))
  clipped.computeBoundingBox()
  clipped.computeBoundingSphere()
  return { geometry: clipped, removed }
}

export default function BmwM4() {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH)
  const colors = useStore((s) => s.colors)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const interiorMode = useStore((s) => s.interiorMode)
  const setBmwAnchors = useStore((s) => s.setBmwAnchors)

  const prevColors = useRef<Record<PartId, string>>({
    seat_driver: '', seat_passenger: '', steering: '', dashboard: '',
    door_left: '', door_right: '', console: '', screen_frame: '', body_paint: '',
  })
  const prevSelected = useRef<string | null>(null)

  // 归一化、分类 mesh、建立材质映射
  const {
    normalized,
    paintMats,
    roofMeshes,
    glassMeshes,
    interiorMeshes,
    partMaterials,
    anchors,
    roofClip,
  } = useMemo(() => {
    const cloned = scene.clone(true)

    // 缩放到车长≈4.6m，贴地居中
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const scale = 4.6 / Math.max(size.x, size.z)
    cloned.scale.setScalar(scale)
    box.setFromObject(cloned)
    const center = box.getCenter(new THREE.Vector3())
    cloned.position.set(-center.x, -box.min.y, -center.z)

    const paintMats = new Set<THREE.Material>()
    const roofMeshes = new Set<THREE.Mesh>()
    const glassMeshes = new Set<THREE.Mesh>()
    const interiorMeshes = new Set<THREE.Mesh>()
    const partMaterials: Record<PartId, Set<THREE.Material>> = {
      seat_driver: new Set(),
      seat_passenger: new Set(),
      steering: new Set(),
      dashboard: new Set(),
      door_left: new Set(),
      door_right: new Set(),
      console: new Set(),
      screen_frame: new Set(),
      body_paint: new Set(),
    }

    const paintKeywords = ['Paint', 'Paint2']
    const isPaintMat = (name: string) => paintKeywords.some((k) => name.includes(k))
    const isGlassMat = (name: string) => name.includes('GlassClear')

    const roofNodeNames = new Set([
      'M4xNME_roof_carbon', 'M4xNME_roofline_csl',
    ])

    const partIdMap: Record<string, PartId> = {
      'M4xNME_seat_L_csl': 'seat_driver',
      'M4xNME_seat_R_csl': 'seat_passenger',
      'M4xNME_steer_stitch': 'steering',
      'M4xNME_dash': 'dashboard',
      'M4xNME_doorpanel_FL': 'door_left',
      'M4xNME_doorpanel_FR': 'door_right',
      'M4xNME_console_csl': 'console',
    }

    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const nodeName = obj.name.replace(/_M4xNME_.*$/, '')
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]

      // shadow 策略：BMW 模型 mesh 数量多，为避免低端设备卡顿，统一关闭实时阴影
      // 车身仍保留环境光 + 环境贴图反射，视觉上不会太平
      // 车顶判定：roof_carbon（碳纤维车顶板）+ roofline_csl（车顶线）及其所有子 mesh
      // 用前缀匹配更稳（子节点名形如 M4xNME_roof_carbon_M4xNME_Carbon1.002_0）
      const isRoof =
        roofNodeNames.has(obj.name) ||
        roofNodeNames.has(nodeName) ||
        nodeName.startsWith('M4xNME_roof')
      const isGlass = mats.some((m) => isGlassMat(m.name))
      const partId = partIdMap[obj.name] || partIdMap[nodeName]

      obj.castShadow = false
      obj.receiveShadow = false

      if (isRoof) {
        roofMeshes.add(obj)
      }

      if (isGlass) {
        glassMeshes.add(obj)
      }

      // 车漆
      mats.forEach((m) => {
        if (isPaintMat(m.name)) {
          paintMats.add(m)
          partMaterials.body_paint.add(m)
        }
      })

      // 内饰部件材质 + mesh
      if (partId) {
        interiorMeshes.add(obj)
        mats.forEach((m) => {
          if (
            m.name.includes('Leather') ||
            m.name.includes('Colorable') ||
            m.name.includes('Carbon') ||
            m.name.includes('Black')
          ) {
            partMaterials[partId].add(m)
          }
        })
      }
    })

    // ---- 去顶扩展：把「完全位于车顶区」的 mesh 也并入 roofMeshes ----
    // 车顶并不只有 roof_carbon / roofline：内饰顶棚(interior_csl)、车顶内衬等
    // 往往也是独立 mesh，且整体位于顶部。这里用包围盒判断：minY 高于车顶区阈值 → 整体在顶部 → 一并去除。
    cloned.updateMatrixWorld(true)
    let roofTopY = 0
    roofMeshes.forEach((m) => {
      const b = new THREE.Box3().setFromObject(m)
      if (!b.isEmpty()) roofTopY = Math.max(roofTopY, b.max.y)
    })
    const roofZoneY = roofTopY - 0.2 // 顶部 20cm 以内视为车顶区
    const roofZoneAdded: string[] = []
    if (roofTopY > 0) {
      cloned.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || roofMeshes.has(o)) return
        const b = new THREE.Box3().setFromObject(o)
        if (b.isEmpty()) return
        if (b.min.y >= roofZoneY) {
          roofMeshes.add(o)
          roofZoneAdded.push(o.name)
        }
      })
    }

    // ---- 真正去顶：裁剪掉整车大网格里属于车顶的三角面 ----
    // 车顶外板被建模进 body_Paint / body_Black / interior_csl（顶棚），
    // 仅隐藏独立车顶板会留下车顶。开口范围取碳纤维车顶板的 XZ 投影，
    // 下切面取顶板底缘（略下移 1cm 盖住内衬），把该区域上方所有面删掉。
    const carbonRoof = [...roofMeshes].filter((m) => m.name.startsWith('M4xNME_roof_carbon'))
    const roofBox = new THREE.Box3()
    ;(carbonRoof.length ? carbonRoof : [...roofMeshes]).forEach((m) => roofBox.expandByObject(m))
    // 开口：XZ 用车顶板 + 前后风挡的并集（车顶板只覆盖后段，前风挡上方仍有顶面），
    // Y 阈值必须单独取自车顶板底缘 —— 否则会被风挡(低至 0.96m)带偏，把座椅/仪表台一起切掉。
    const findFirst = (prefix: string): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null
      cloned.traverse((o) => {
        if (!found && o.name.startsWith(prefix)) found = o
      })
      return found
    }
    const wsObj = findFirst('M4xNME_windshield')
    const fbObj = findFirst('M4xNME_backlight')
    const openBox = roofBox.clone()
    for (const o of [wsObj, fbObj]) {
      if (!o) continue
      const b = new THREE.Box3().setFromObject(o)
      if (b.isEmpty()) continue
      openBox.min.x = Math.min(openBox.min.x, b.min.x)
      openBox.max.x = Math.max(openBox.max.x, b.max.x)
      openBox.min.z = Math.min(openBox.min.z, b.min.z)
      openBox.max.z = Math.max(openBox.max.z, b.max.z)
    }
    const roofClip = new Map<THREE.Mesh, { orig: THREE.BufferGeometry; clipped: THREE.BufferGeometry }>()
    const clipInfo: { name: string; removed: number }[] = []
    let openZone: RoofOpenZone | null = null
    if (!roofBox.isEmpty()) {
      const pad = 0.015
      const zone: RoofOpenZone = {
        minX: openBox.min.x - pad,
        maxX: openBox.max.x + pad,
        minZ: openBox.min.z - pad,
        maxZ: openBox.max.z + pad,
        y: roofBox.min.y - 0.01,
      }
      openZone = zone
      const cutY = zone.y
      cloned.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || roofMeshes.has(o) || glassMeshes.has(o)) return
        const b = new THREE.Box3().setFromObject(o)
        if (b.isEmpty() || b.max.y <= cutY) return
        // XZ 与开口区无交集则跳过
        if (b.max.x < zone.minX || b.min.x > zone.maxX || b.max.z < zone.minZ || b.min.z > zone.maxZ) return
        const r = clipRoofFaces(o, zone)
        if (!r) return
        roofClip.set(o, { orig: o.geometry, clipped: r.geometry })
        clipInfo.push({ name: o.name, removed: r.removed })
      })
    }

    // ---- 计算驾驶位相机锚点（归一化坐标系内） ----
    // 车头朝向沿车身纵轴（较长轴），用前/后风挡判定正负，视线严格沿中线朝前。
    let anchors: { eye: [number, number, number]; look: [number, number, number] } | null = null
    const seatObj = findFirst('M4xNME_seat_L') // 左舵：驾驶位在左
    if (seatObj && wsObj) {
      const sb = new THREE.Box3().setFromObject(seatObj)
      const wb = new THREE.Box3().setFromObject(wsObj)
      const sc = sb.getCenter(new THREE.Vector3())
      const wc = wb.getCenter(new THREE.Vector3())
      // 车头朝向：取车身较长轴作为纵轴，用「前风挡 vs 后风挡」判定正负方向，
      // 这样视线严格沿车身中线朝前，不受座椅左右偏移影响。
      const overall = new THREE.Box3().setFromObject(cloned)
      const osize = overall.getSize(new THREE.Vector3())
      let fwd: THREE.Vector3
      if (osize.z >= osize.x) {
        const rearZ = fbObj ? new THREE.Box3().setFromObject(fbObj).getCenter(new THREE.Vector3()).z : sc.z - 1
        fwd = new THREE.Vector3(0, 0, Math.sign(wc.z - rearZ) || 1)
      } else {
        const rearX = fbObj ? new THREE.Box3().setFromObject(fbObj).getCenter(new THREE.Vector3()).x : sc.x - 1
        fwd = new THREE.Vector3(Math.sign(wc.x - rearX) || 1, 0, 0)
      }
      const eye = sc.clone()
      eye.y = sb.max.y - 0.1 // 眼位贴近头枕顶部下方
      const look = eye.clone().addScaledVector(fwd, 6)
      look.y = eye.y - 0.25 // 略微俯视仪表台/前方路面
      anchors = {
        eye: [eye.x, eye.y, eye.z],
        look: [look.x, look.y, look.z],
      }
    }

    // ---- 调试：输出顶部 mesh 几何高度，确认车顶到底由哪些 mesh 构成 ----
    if (typeof window !== 'undefined') {
      const geoTop: { name: string; maxY: number }[] = []
      cloned.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const b = new THREE.Box3().setFromObject(o)
        if (!b.isEmpty()) geoTop.push({ name: o.name, maxY: +b.max.y.toFixed(2) })
      })
      geoTop.sort((a, b) => b.maxY - a.maxY)
      const roofNames = [...roofMeshes].map((m) => m.name)
      ;(window as unknown as Record<string, unknown>).__bmwDebug = {
        overallMaxY: geoTop[0]?.maxY ?? 0,
        roofTopY,
        roofZoneY,
        roofZoneAdded,
        openZone,
        clipped: clipInfo,
        top: geoTop.slice(0, 16),
        roof: roofNames,
        anchors,
      }
    }

    return {
      normalized: cloned,
      paintMats,
      roofMeshes,
      glassMeshes,
      interiorMeshes,
      partMaterials,
      anchors,
      roofClip,
    }
  }, [scene])

  // 把驾驶位锚点发布到全局 store，供相机控制器使用
  useEffect(() => {
    setBmwAnchors(anchors)
    return () => setBmwAnchors(null)
  }, [anchors, setBmwAnchors])

  // 增量更新颜色：只更新变化了的部件材质
  useEffect(() => {
    const ids: PartId[] = [
      'seat_driver', 'seat_passenger', 'steering', 'dashboard',
      'door_left', 'door_right', 'console', 'body_paint',
    ]
    ids.forEach((id) => {
      if (prevColors.current[id] === colors[id]) return
      const color = colors[id]
      partMaterials[id].forEach((m) => {
        const mat = m as THREE.MeshStandardMaterial
        mat.color.set(color)
      })
      prevColors.current[id] = color
    })
  }, [colors, partMaterials])

  // 增量更新选中高亮
  useEffect(() => {
    if (prevSelected.current === selected) return
    const prev = prevSelected.current as PartId | null
    const applyEmissive = (id: PartId | null, intensity: number) => {
      if (!id) return
      if (id === 'body_paint') {
        paintMats.forEach((m) => {
          const mat = m as THREE.MeshStandardMaterial
          mat.emissive.set('#ffffff')
          mat.emissiveIntensity = intensity
        })
      } else {
        partMaterials[id].forEach((m) => {
          const mat = m as THREE.MeshStandardMaterial
          mat.emissive.set('#ffffff')
          mat.emissiveIntensity = intensity
        })
      }
    }
    applyEmissive(prev, 0)
    applyEmissive(selected, selected === 'body_paint' ? 0.15 : selected ? 0.2 : 0)
    prevSelected.current = selected
  }, [selected, paintMats, partMaterials])

  // 车顶开合：内饰模式自动去顶（原「隐藏车顶」勾选框已移除，开关只剩视角模式）
  useEffect(() => {
    const topOpen = interiorMode
    roofMeshes.forEach((mesh) => { mesh.visible = !topOpen })
    // 车身/顶棚的顶部面片裁掉（外观模式切回原几何）
    roofClip.forEach(({ orig, clipped }, mesh) => {
      const want = topOpen ? clipped : orig
      if (mesh.geometry !== want) mesh.geometry = want
    })
    // 内饰模式下玻璃保持半透明，从敞篷口看进去更自然
    glassMeshes.forEach((mesh) => { mesh.visible = true })
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>
      w.__bmwRoofVisible = [...roofMeshes].map((m) => ({ name: m.name, visible: m.visible }))
      w.__bmwRoofClip = {
        topOpen,
        meshes: [...roofClip.entries()].map(([m, g]) => ({
          name: m.name,
          using: m.geometry === g.clipped ? 'clipped' : 'orig',
          origFaces: (g.orig.getIndex()?.count ?? g.orig.getAttribute('position').count) / 3,
          clippedFaces: (g.clipped.getIndex()?.count ?? 0) / 3,
        })),
      }
    }
  }, [interiorMode, roofMeshes, glassMeshes, roofClip])

  // 内饰件按需显示：外观模式隐藏内部细节以提升性能；内饰模式显示
  useEffect(() => {
    interiorMeshes.forEach((mesh) => { mesh.visible = interiorMode })
  }, [interiorMode, interiorMeshes])

  // 组件卸载时释放 clone 出的几何体/材质，避免反复切换车型导致内存增长
  useEffect(() => {
    return () => {
      roofClip.forEach(({ clipped }) => clipped.dispose())
      normalized.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose())
        }
      })
    }
  }, [normalized, roofClip])

  // BMW 内饰模式：仅掀开车顶 + 显示内饰，车身外壳与玻璃保持原样（用户要求去顶而非改玻璃）。
  // 不再将车身做半透明幽灵化，避免整车内透、也避免改动玻璃观感；从敞开的车顶俯视即可看内饰。

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const obj = e.object as THREE.Mesh

    const partIdMap: Record<string, PartId> = {
      'M4xNME_seat_L_csl': 'seat_driver',
      'M4xNME_seat_R_csl': 'seat_passenger',
      'M4xNME_steer_stitch': 'steering',
      'M4xNME_dash': 'dashboard',
      'M4xNME_doorpanel_FL': 'door_left',
      'M4xNME_doorpanel_FR': 'door_right',
      'M4xNME_console_csl': 'console',
      'M4xNME_body': 'body_paint',
      'M4xNME_hood_csl': 'body_paint',
      'M4xNME_trunk_csl': 'body_paint',
      'M4xNME_door_FL': 'body_paint',
      'M4xNME_door_FR': 'body_paint',
      'M4xNME_fender_L': 'body_paint',
      'M4xNME_fender_R': 'body_paint',
      'M4xNME_bumper_F': 'body_paint',
      'M4xNME_bumper_R': 'body_paint',
    }

    let target: THREE.Object3D | null = obj
    let id: PartId | null = null
    while (target) {
      const rawName = target.name.replace(/_.*$/m, '')
      id = partIdMap[rawName] || partIdMap[target.name] || null
      if (id) break
      target = target.parent
    }

    select(id)
  }, [select])

  return <primitive object={normalized} onClick={onClick} />
}
