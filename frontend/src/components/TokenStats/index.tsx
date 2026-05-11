import { Tag, Tooltip } from 'antd'
import type { UsageStats } from '../../types'

interface Props {
  usage: UsageStats
  ttft_ms?: number
  total_ms?: number
}

export default function TokenStats({ usage, ttft_ms, total_ms }: Props) {
  const items = [
    { label: '输入', value: usage.input_tokens },
    { label: '输出', value: usage.output_tokens },
    usage.cache_read_tokens ? { label: '缓存命中', value: usage.cache_read_tokens } : null,
    usage.cache_write_tokens ? { label: '缓存写入', value: usage.cache_write_tokens } : null,
    usage.reasoning_tokens ? { label: '推理', value: usage.reasoning_tokens } : null,
  ].filter(Boolean) as { label: string; value: number }[]

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {items.map(({ label, value }) => (
        <Tag key={label} color="blue">{label} {value} tok</Tag>
      ))}
      {usage.tokens_per_second != null && (
        <Tag color="green">{usage.tokens_per_second.toFixed(1)} tok/s</Tag>
      )}
      {ttft_ms != null && (
        <Tooltip title="首 Token 延迟">
          <Tag color="orange">TTFT {ttft_ms.toFixed(0)}ms</Tag>
        </Tooltip>
      )}
      {total_ms != null && (
        <Tag>总耗时 {(total_ms / 1000).toFixed(2)}s</Tag>
      )}
    </div>
  )
}
