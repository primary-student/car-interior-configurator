import { Component, type ReactNode } from 'react'
import { Html } from '@react-three/drei'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

/** 捕获 Canvas 内 GLB 加载/渲染异常，避免整页崩溃为黑屏 */
export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[ModelErrorBoundary]', this.props.label, error)
  }

  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div className="model-error">
            <div className="model-error-title">⚠️ 模型加载失败</div>
            <div className="model-error-sub">{this.props.label || '请检查网络后重试'}</div>
          </div>
        </Html>
      )
    }
    return this.props.children
  }
}
