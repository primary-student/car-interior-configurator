import { create } from 'zustand'

export type PartId =
  | 'seat_driver'
  | 'seat_passenger'
  | 'steering'
  | 'dashboard'
  | 'door_left'
  | 'door_right'
  | 'console'
  | 'screen_frame'
  | 'body_paint'

export const PART_NAMES: Record<PartId, string> = {
  seat_driver: '主驾座椅',
  seat_passenger: '副驾座椅',
  steering: '方向盘',
  dashboard: '仪表台',
  door_left: '左门板',
  door_right: '右门板',
  console: '中控台',
  screen_frame: '中控屏边框',
  body_paint: '车身漆面',
}

export const PALETTE = [
  { name: '曜石黑', value: '#1a1a1c' },
  { name: '琥珀棕', value: '#6b4226' },
  { name: '米白', value: '#e8e0d0' },
  { name: '酒红', value: '#7a2020' },
  { name: '深蓝', value: '#1f3a5f' },
  { name: '钛灰', value: '#8a8d91' },
  { name: '碳纤维', value: '#2b2f33' },
  { name: '原木色', value: '#a9784b' },
]

export const PAINT_PALETTE = [
  { name: '珍珠白', value: '#e9eaea' },
  { name: '曜石黑', value: '#141518' },
  { name: '钛银', value: '#a8adb3' },
  { name: '深海蓝', value: '#1e3d6e' },
  { name: '烈焰红', value: '#a01c1c' },
  { name: '墨绿', value: '#1e4433' },
  { name: '香槟金', value: '#c2a878' },
  { name: '水泥灰', value: '#6f7276' },
]

const DEFAULT_COLORS: Record<PartId, string> = {
  seat_driver: '#6b4226',
  seat_passenger: '#6b4226',
  steering: '#1a1a1c',
  dashboard: '#2b2f33',
  door_left: '#1a1a1c',
  door_right: '#1a1a1c',
  console: '#2b2f33',
  screen_frame: '#1a1a1c',
  body_paint: '#1e3d6e',
}

export const PRESETS: { name: string; colors: Record<PartId, string> }[] = [
  { name: '沉稳商务', colors: { ...DEFAULT_COLORS } },
  {
    name: '米白轻奢',
    colors: {
      seat_driver: '#e8e0d0', seat_passenger: '#e8e0d0', steering: '#6b4226',
      dashboard: '#a9784b', door_left: '#e8e0d0', door_right: '#e8e0d0',
      console: '#6b4226', screen_frame: '#1a1a1c', body_paint: '#e9eaea',
    },
  },
  {
    name: '运动红黑',
    colors: {
      seat_driver: '#7a2020', seat_passenger: '#7a2020', steering: '#1a1a1c',
      dashboard: '#1a1a1c', door_left: '#2b2f33', door_right: '#2b2f33',
      console: '#1a1a1c', screen_frame: '#2b2f33', body_paint: '#141518',
    },
  },
]

export type ViewMode = 'sedan' | 'concept' | 'bmw'

/** BMW 模型归一化后计算出的相机锚点（坐在驾驶位向前看） */
export interface BmwAnchors {
  /** 驾驶位眼睛位置 */
  eye: [number, number, number]
  /** 视线目标点（正前方） */
  look: [number, number, number]
}

interface ConfiguratorState {
  selected: PartId | null
  colors: Record<PartId, string>
  roofHidden: boolean
  view: ViewMode
  interiorMode: boolean
  bmwAnchors: BmwAnchors | null
  select: (p: PartId | null) => void
  setColor: (p: PartId, color: string) => void
  applyPreset: (colors: Record<PartId, string>) => void
  toggleRoof: () => void
  setView: (v: ViewMode) => void
  setInteriorMode: (v: boolean) => void
  setBmwAnchors: (a: BmwAnchors | null) => void
}

export const useStore = create<ConfiguratorState>((set) => ({
  selected: null,
  colors: DEFAULT_COLORS,
  roofHidden: false,
  view: 'sedan',
  interiorMode: false,
  bmwAnchors: null,
  select: (p) => set({ selected: p }),
  setColor: (p, color) =>
    set((s) => ({ colors: { ...s.colors, [p]: color } })),
  applyPreset: (colors) => set({ colors }),
  toggleRoof: () => set((s) => ({ roofHidden: !s.roofHidden })),
  setView: (v) => set({ view: v, selected: null, interiorMode: false }),
  setInteriorMode: (v) =>
    set({ interiorMode: v, selected: v ? 'seat_driver' : 'body_paint' }),
  setBmwAnchors: (a) => set({ bmwAnchors: a }),
}))
