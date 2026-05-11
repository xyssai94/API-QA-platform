import { useState, useEffect } from 'react'
import { AutoComplete, Button, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { fetchEndpointModels } from '../../api'

interface Props {
  endpointId?: number | null
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
}

export default function ModelSelect({ endpointId, value, onChange, placeholder, style }: Props) {
  const [options, setOptions] = useState<{ value: string }[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (epId: number) => {
    setLoading(true)
    try {
      const models = await fetchEndpointModels(epId)
      setOptions(models.map(m => ({ value: m })))
    } catch {
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (endpointId) load(endpointId)
    else setOptions([])
  }, [endpointId])

  return (
    <span style={{ display: 'inline-flex', width: '100%', gap: 4, ...style }}>
      <AutoComplete
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? '模型名称'}
        filterOption={(input, opt) =>
          (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())
        }
        style={{ flex: 1 }}
      />
      {endpointId && (
        <Tooltip title="重新获取模型列表">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => load(endpointId)}
          />
        </Tooltip>
      )}
    </span>
  )
}
