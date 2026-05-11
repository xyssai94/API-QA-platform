import { useState, useEffect } from 'react'
import {
  Button, Select, InputNumber, Slider, Form,
  Card, Space, Row, Col, Typography, message, Tag, Input,
} from 'antd'
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { listEndpoints, runCompare } from '../../api'
import type { Endpoint, CompareResult } from '../../types'
import ModelSelect from '../../components/ModelSelect'

const { TextArea } = Input

interface Config {
  endpoint_id: number | null
  model: string
}

const DEFAULT_MESSAGES = '[{"role": "user", "content": "你好，请用一句话介绍自己。"}]'

export default function ComparePage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [messagesJson, setMessagesJson] = useState(DEFAULT_MESSAGES)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(1)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [configs, setConfigs] = useState<Config[]>([
    { endpoint_id: null, model: '' },
    { endpoint_id: null, model: '' },
  ])
  const [results, setResults] = useState<CompareResult[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    listEndpoints().then(eps => {
      setEndpoints(eps)
      if (eps.length > 0) {
        setConfigs(c => c.map(cfg => ({
          ...cfg,
          endpoint_id: cfg.endpoint_id ?? eps[0].id,
        })))
      }
    })
  }, [])

  const addConfig = () => {
    setConfigs(c => [...c, { endpoint_id: endpoints[0]?.id ?? null, model: '' }])
  }

  const removeConfig = (i: number) => {
    setConfigs(c => c.filter((_, idx) => idx !== i))
  }

  const updateConfig = (i: number, field: keyof Config, value: number | string | null) => {
    setConfigs(c => c.map((cfg, idx) => idx === i ? { ...cfg, [field]: value } : cfg))
  }

  const handleRun = async () => {
    let msgs: unknown[]
    try {
      msgs = JSON.parse(messagesJson)
      if (!Array.isArray(msgs)) throw new Error()
    } catch {
      message.error('消息格式错误，请检查 JSON')
      return
    }

    const validConfigs = configs.filter(c => c.endpoint_id && c.model.trim())
    if (validConfigs.length < 1) {
      message.warning('请至少配置一个有效的模型')
      return
    }

    setLoading(true)
    setResults([])
    setSessionId(null)
    try {
      const res = await runCompare({
        messages: msgs as { role: 'user' | 'assistant' | 'system'; content: string }[],
        system_prompt: systemPrompt || undefined,
        params: { temperature, max_tokens: maxTokens },
        configs: validConfigs as { endpoint_id: number; model: string }[],
      })
      setResults(res.results)
      setSessionId(res.session_id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      message.error(err.response?.data?.detail ?? '运行失败')
    } finally {
      setLoading(false)
    }
  }

  const colSpan = results.length <= 2 ? 12 : results.length === 3 ? 8 : 6

  return (
    <div>
      {/* 输入区 */}
      <Card size="small" title="输入配置" style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item label="消息（JSON）" style={{ marginBottom: 8 }}>
              <TextArea
                rows={5}
                value={messagesJson}
                onChange={e => setMessagesJson(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
            <Form.Item label="System Prompt" style={{ marginBottom: 0 }}>
              <Input
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="可选"
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item label={`Temperature: ${temperature}`} style={{ marginBottom: 8 }}>
              <Slider min={0} max={2} step={0.1} value={temperature} onChange={setTemperature} />
            </Form.Item>
            <Form.Item label="Max Tokens" style={{ marginBottom: 0 }}>
              <InputNumber
                min={1} max={32768}
                value={maxTokens}
                onChange={v => setMaxTokens(v ?? 2048)}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* 模型配置 */}
      <Card
        size="small"
        title="模型配置"
        extra={<Button size="small" icon={<PlusOutlined />} onClick={addConfig}>添加</Button>}
        style={{ marginBottom: 12 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {configs.map((cfg, i) => (
            <Space key={i}>
              <Select
                value={cfg.endpoint_id ?? undefined}
                onChange={v => updateConfig(i, 'endpoint_id', v)}
                options={endpoints.map(e => ({ label: e.name, value: e.id }))}
                placeholder="选择 Endpoint"
                style={{ width: 200 }}
              />
              <ModelSelect
                endpointId={cfg.endpoint_id}
                value={cfg.model}
                onChange={v => updateConfig(i, 'model', v)}
                style={{ width: 320 }}
              />
              {configs.length > 1 && (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeConfig(i)}
                />
              )}
            </Space>
          ))}
        </Space>
      </Card>

      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleRun}
          loading={loading}
        >
          开始对比
        </Button>
        {sessionId && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            会话 #{sessionId} 已存入历史
          </Typography.Text>
        )}
      </Space>

      {/* 结果区 */}
      {results.length > 0 && (
        <Row gutter={12}>
          {results.map(r => (
            <Col key={r.index} span={colSpan} style={{ marginBottom: 12 }}>
              <Card
                size="small"
                title={
                  <Space size={4}>
                    <span style={{ fontWeight: 600 }}>{r.endpoint_name}</span>
                    <Tag color="blue" style={{ fontSize: 11 }}>{r.model}</Tag>
                  </Space>
                }
                extra={
                  r.total_ms != null && (
                    <Space size={4}>
                      {r.ttft_ms != null && (
                        <Tag color="cyan" style={{ fontSize: 11 }}>TTFT {r.ttft_ms.toFixed(0)}ms</Tag>
                      )}
                      <Tag color="green" style={{ fontSize: 11 }}>{r.total_ms.toFixed(0)}ms</Tag>
                      {r.usage?.tokens_per_second != null && (
                        <Tag color="orange" style={{ fontSize: 11 }}>
                          {r.usage.tokens_per_second.toFixed(1)} t/s
                        </Tag>
                      )}
                    </Space>
                  )
                }
                style={{ height: '100%' }}
              >
                {r.error ? (
                  <Typography.Text type="danger" style={{ fontSize: 13 }}>{r.error}</Typography.Text>
                ) : (
                  <>
                    <Typography.Paragraph
                      style={{ whiteSpace: 'pre-wrap', marginBottom: 8, fontSize: 13 }}
                    >
                      {r.response}
                    </Typography.Paragraph>
                    <Space size={4} wrap>
                      {r.usage?.input_tokens != null && (
                        <Tag style={{ fontSize: 11 }}>输入 {r.usage.input_tokens}</Tag>
                      )}
                      {r.usage?.output_tokens != null && (
                        <Tag style={{ fontSize: 11 }}>输出 {r.usage.output_tokens}</Tag>
                      )}
                      {r.usage?.cache_read_tokens ? (
                        <Tag color="purple" style={{ fontSize: 11 }}>
                          缓存读 {r.usage.cache_read_tokens}
                        </Tag>
                      ) : null}
                    </Space>
                  </>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
