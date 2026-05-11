import { useState, useEffect, useRef } from 'react'
import {
  Button, Select, Input, Slider, Form, Card, Space,
  Typography, Divider, Switch, InputNumber, Row, Col, message, Modal, Tooltip,
} from 'antd'
import { SendOutlined, ClearOutlined, SaveOutlined, ProfileOutlined } from '@ant-design/icons'
import StreamOutput from '../../components/StreamOutput'
import ModelSelect from '../../components/ModelSelect'
import { useConfigStore } from '../../stores/configStore'
import { listEndpoints, streamSingle, runSingle, createTestCase, listPresets } from '../../api'
import type { Message, UsageStats, Preset } from '../../types'

const { TextArea } = Input

export default function ChatPage() {
  const { endpoints, setEndpoints, selectedEndpointId, setSelectedEndpointId, model, setModel } = useConfigStore()

  const [systemPrompt, setSystemPrompt] = useState('')
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [streamMode, setStreamMode] = useState(true)
  const [temperature, setTemperature] = useState<number>(1)
  const [maxTokens, setMaxTokens] = useState<number>(2048)
  const [presets, setPresets] = useState<Preset[]>([])

  const [outputText, setOutputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState<UsageStats | undefined>()
  const [ttft, setTtft] = useState<number | undefined>()
  const [totalMs, setTotalMs] = useState<number | undefined>()
  const [error, setError] = useState<string | undefined>()

  const stopRef = useRef<(() => void) | null>(null)
  const accTextRef = useRef('')

  useEffect(() => {
    listEndpoints().then(eps => {
      setEndpoints(eps)
      if (eps.length > 0 && !selectedEndpointId) setSelectedEndpointId(eps[0].id)
    })
    listPresets().then(setPresets)
  }, [])

  const applyPreset = (presetId: number) => {
    const p = presets.find(x => x.id === presetId)
    if (!p) return
    setSelectedEndpointId(p.endpoint_id)
    setModel(p.model)
    if (p.system_prompt) setSystemPrompt(p.system_prompt)
    if (p.params.temperature != null) setTemperature(p.params.temperature as number)
    if (p.params.max_tokens != null) setMaxTokens(p.params.max_tokens as number)
    message.success(`已加载预设「${p.name}」`)
  }

  const send = async () => {
    if (!input.trim()) return
    if (!selectedEndpointId) { message.warning('请先选择 Endpoint'); return }

    const userMsg: Message = { role: 'user', content: input.trim() }
    const messages = [...history, userMsg]
    setHistory(messages)
    setInput('')
    setOutputText('')
    setUsage(undefined)
    setTtft(undefined)
    setTotalMs(undefined)
    setError(undefined)
    setLoading(true)
    accTextRef.current = ''

    const params = { temperature, max_tokens: maxTokens }
    const payload = {
      endpoint_id: selectedEndpointId,
      model,
      messages,
      system_prompt: systemPrompt || undefined,
      params,
    }

    if (streamMode) {
      const stop = streamSingle({
        ...payload,
        onChunk: (text, ttft_ms) => {
          accTextRef.current += text
          setOutputText(prev => prev + text)
          if (ttft_ms != null) setTtft(ttft_ms)
        },
        onDone: (u, ms) => {
          setUsage(u)
          setTotalMs(ms)
          setLoading(false)
          setHistory(prev => [...prev, { role: 'assistant', content: accTextRef.current }])
        },
        onError: (err) => {
          setError(err)
          setLoading(false)
        },
      })
      stopRef.current = stop
    } else {
      try {
        const result = await runSingle(payload)
        setOutputText(result.response)
        setUsage(result.usage)
        setTtft(result.ttft_ms)
        setTotalMs(result.total_ms)
        setHistory(prev => [...prev, { role: 'assistant', content: result.response }])
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } }
        setError(err.response?.data?.detail ?? String(e))
      } finally {
        setLoading(false)
      }
    }
  }

  const handleStop = () => {
    stopRef.current?.()
    setLoading(false)
  }

  const clearHistory = () => {
    setHistory([])
    setOutputText('')
    setUsage(undefined)
    setTtft(undefined)
    setTotalMs(undefined)
    setError(undefined)
  }

  const saveAsTestCase = () => {
    if (history.length === 0) {
      message.warning('没有对话记录')
      return
    }
    Modal.confirm({
      title: '保存为测试用例',
      content: (
        <Form id="saveForm" layout="vertical" onFinish={async (values) => {
          try {
            await createTestCase({
              name: values.name,
              group_name: values.group_name,
              messages: history.filter(m => m.content),
            })
            message.success('已保存')
            Modal.destroyAll()
          } catch {
            message.error('保存失败')
          }
        }}>
          <Form.Item name="name" label="用例名称" rules={[{ required: true }]}>
            <Input placeholder="如：多轮问答测试" />
          </Form.Item>
          <Form.Item name="group_name" label="分组">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      ),
      okText: '保存',
      onOk: () => {
        const form = document.querySelector<HTMLFormElement>('#saveForm')
        form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        return Promise.resolve()
      },
    })
  }

  return (
    <Row gutter={16} style={{ height: '100%' }}>
      {/* 左侧参数面板 */}
      <Col span={6}>
        <Card
          size="small"
          title="配置"
          extra={
            presets.length > 0 && (
              <Tooltip title="加载预设">
                <Select
                  size="small"
                  placeholder={<><ProfileOutlined /> 加载预设</>}
                  style={{ width: 120 }}
                  options={presets.map(p => ({ label: p.name, value: p.id }))}
                  onChange={applyPreset}
                  value={null}
                />
              </Tooltip>
            )
          }
          style={{ height: '100%' }}
        >
          <Form layout="vertical" size="small">
            <Form.Item label="Endpoint">
              <Select
                value={selectedEndpointId}
                onChange={v => { setSelectedEndpointId(v) }}
                options={endpoints.map(e => ({ label: e.name, value: e.id }))}
                placeholder="选择 Endpoint"
              />
            </Form.Item>
            <Form.Item label="Model">
              <ModelSelect
                endpointId={selectedEndpointId}
                value={model}
                onChange={setModel}
              />
            </Form.Item>
            <Form.Item label="System Prompt">
              <TextArea
                rows={4}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="可选"
              />
            </Form.Item>
            <Form.Item label={`Temperature: ${temperature}`}>
              <Slider min={0} max={2} step={0.1} value={temperature} onChange={setTemperature} />
            </Form.Item>
            <Form.Item label="Max Tokens">
              <InputNumber
                min={1} max={32768}
                value={maxTokens}
                onChange={v => setMaxTokens(v ?? 2048)}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label="流式输出">
              <Switch checked={streamMode} onChange={setStreamMode} />
            </Form.Item>
          </Form>
        </Card>
      </Col>

      {/* 右侧对话区 */}
      <Col span={18} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {history.length > 0 && (
          <Card size="small" style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
            {history.filter(m => m.content).map((msg, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <Typography.Text strong type={msg.role === 'user' ? 'success' : 'secondary'}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </Typography.Text>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0, marginTop: 4 }}>
                  {msg.content}
                </Typography.Paragraph>
                {i < history.length - 1 && <Divider style={{ margin: '8px 0' }} />}
              </div>
            ))}
          </Card>
        )}

        {(loading || outputText || error) && (
          <div style={{ marginBottom: 8 }}>
            <StreamOutput
              text={outputText}
              loading={loading}
              usage={usage}
              ttft_ms={ttft}
              total_ms={totalMs}
              error={error}
            />
          </div>
        )}

        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            autoSize={{ minRows: 3, maxRows: 6 }}
            disabled={loading}
          />
        </Space.Compact>
        <Space style={{ marginTop: 8 }}>
          {loading ? (
            <Button danger onClick={handleStop}>停止</Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={send}>发送</Button>
          )}
          <Button icon={<ClearOutlined />} onClick={clearHistory}>清空</Button>
          {history.length > 0 && (
            <Button icon={<SaveOutlined />} onClick={saveAsTestCase}>保存为用例</Button>
          )}
        </Space>
      </Col>
    </Row>
  )
}
