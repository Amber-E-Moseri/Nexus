import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #FED9B3',
            backgroundColor: '#FEF0E6',
            color: '#C94830',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '8px' }}>
            ⚠️ Something went wrong
          </p>
          <p style={{ fontSize: '13px', marginBottom: '12px', color: '#9E5C3C' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              border: '1px solid #FED9B3',
              borderRadius: '6px',
              background: '#FFFFFF',
              color: '#C94830',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
