import { useEffect, useRef } from 'react'
import { Typography } from 'antd'
import TokenStats from '../TokenStats'
import type { UsageStats } from '../../types'

interface Props {
  text: string
  loading: boolean
  usage?: UsageStats
  ttft_ms?: number
  total_ms?: number
  error?: string
}

export default function StreamOutput({ text, loading, usage, ttft_ms, total_ms, error }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [text])

  return (
    <div style={{ minHeight: 120, padding: '12px 16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
      {error ? (
        <Typography.Text type="danger">{error}</Typography.Text>
      ) : (
        <Typography.Text style={{ whiteSpace: 'pre-wrap', display: 'block' }}>
          {text}
          {loading && <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span>}
        </Typography.Text>
      )}
      <div ref={bottomRef} />
      {!loading && (usage?.output_tokens != null || ttft_ms != null) && (
        <TokenStats usage={usage!} ttft_ms={ttft_ms} total_ms={total_ms} />
      )}
    </div>
  )
}
