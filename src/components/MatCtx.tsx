import { createContext } from 'react'
import * as THREE from 'three'

export interface MatKey {
  roughness: number
  metalness: number
  physical: boolean
}

export interface MatCtxValue {
  getMat: (key: MatKey) => THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
}

export const MatCtx = createContext<MatCtxValue | null>(null)
