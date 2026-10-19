import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, type PartId } from '../store'

/** BMW M4 CSL 分层 GLB（CC BY 4.0）
 *  天然分层：车身/车顶/车门/座椅/方向盘/仪表台/中控台均为独立 mesh。
 */
const MODEL_URL = `${import.meta.env.BASE_URL}models/bmw-m4-csl.glb`

export default function BmwM4() {
  const { scene } = useGLTF(MODEL_URL)
  const colors = useStore((s) => s.colors)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const interiorMode = useStore((s) => s.interiorMode)
  const roofHidden = useStore((s) => s.roofHidden)

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
      const isRoof = roofNodeNames.has(obj.name) || roofNodeNames.has(nodeName)
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

    return {
      normalized: cloned,
      paintMats,
      roofMeshes,
      glassMeshes,
      interiorMeshes,
      partMaterials,
    }
  }, [scene])

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

  // 车顶/玻璃可见性：隐藏车顶开关 或 内饰模式 → 自动去顶，便于看内饰
  useEffect(() => {
    const topOpen = roofHidden || interiorMode
    roofMeshes.forEach((mesh) => { mesh.visible = !topOpen })
    // 玻璃仅在「隐藏车顶」开关时隐藏；内饰模式下保留半透明玻璃，从敞篷口看进去更自然
    glassMeshes.forEach((mesh) => { mesh.visible = !roofHidden })
  }, [roofHidden, interiorMode, roofMeshes, glassMeshes])

  // 内饰件按需显示：外观模式隐藏内部细节以提升性能；内饰模式显示
  useEffect(() => {
    interiorMeshes.forEach((mesh) => { mesh.visible = interiorMode })
  }, [interiorMode, interiorMeshes])

  // 组件卸载时释放 clone 出的几何体/材质，避免反复切换车型导致内存增长
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
