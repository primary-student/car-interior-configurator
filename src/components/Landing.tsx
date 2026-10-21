import { memo } from 'react'

/**
 * 首页落地页：只展示品牌名与描述，点击「开始定制」才进入 3D 配置器。
 * 3D 场景在此之前不挂载（不占 WebGL 上下文），但 GLB 已在模块加载时预下载，
 * 所以点进配置器时通常直接命中缓存。
 */
export const Landing = memo(function Landing({
  exiting,
  onStart,
}: {
  exiting: boolean
  onStart: () => void
}) {
  return (
    <div className={`landing${exiting ? ' landing-exit' : ''}`}>
      <div className="landing-glow" aria-hidden="true" />

      <div className="landing-inner">
        <p className="landing-overline">Interior Atelier · 内饰定制所</p>

        <h1 className="landing-name">内秀</h1>

        <p className="landing-en">NEIXIU</p>

        <span className="landing-rule" aria-hidden="true" />

        <p className="landing-desc">外面给世界看，里面给自己。</p>

        <button className="landing-start" onClick={onStart} aria-label="开始定制，进入 3D 配置器">
          <span className="landing-start-label">开始定制</span>
          <span className="landing-start-arrow" aria-hidden="true">
            →
          </span>
        </button>

        <p className="landing-foot">2 款车型 · 9 类部件 · 实时换色</p>
      </div>

      <p className="landing-credit">BMW M4 CSL / Low Poly Sedan · CC BY 4.0 · CC0</p>
    </div>
  )
})
