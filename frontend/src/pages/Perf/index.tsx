import { useState, useEffect, useRef } from 'react'
import {
  Button, Select, Input, InputNumber, Slider, Form,
  Card, Space, Row, Col, Progress, Table, Tag, Statistic, message, Typography,
} from 'antd'
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { listEndpoints, startPerfTest } from '../../api'
import type { Endpoint, PerfResultItem, PerfStats } from '../../types'
import ModelSelect from '../../components/ModelSelect'

const { TextArea } = Input

const DEFAULT_MESSAGES = '[{"role": "user", "content": "你好，请用一句话介绍自己。"}]'

export default function PerfPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [endpointId, setEndpointId] = useState<number | undefined>()
  const [model, setModel] = useState('')
  const [messagesJson, setMessagesJson] = useState(DEFAULT_MESSAGES)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(1)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [n, setN] = useState(10)
  const [concurrency, setConcurrency] = useState(1)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [results, setResults] = useState<PerfResultItem[]>([])
  const [stats, setStats] = useState<PerfStats | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)

  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    listEndpoints().then(eps => {
      setEndpoints(eps)
      if (eps.length > 0) setEndpointId(eps[0].id)
    })
  }, [])

  const handleRun = () => {
    let msgs: unknown
    try {
      msgs = JSON.parse(messagesJson)
      if (!Array.isArray(msgs)) throw new Error()
    } catch {
      message.error('消息格式错误，请检查 JSON')
      return
    }
    if (!endpointId || !model.trim()) {
      message.warning('请配置 Endpoint 和 Model')
      return
    }

    setRunning(true)
    setResults([])
    setStats(null)
    setSessionId(null)
    setProgress({ completed: 0, total: n })

    const stop = startPerfTest({
      endpoint_id: endpointId,
      model,
      messages: msgs as { role: 'user' | 'assistant' | 'system'; content: string }[],
      system_prompt: systemPrompt || undefined,
      params: { temperature, max_tokens: maxTokens },
      n,
      concurrency,
      onProgress: (completed, total, result) => {
        setProgress({ completed, total })
        setResults(prev => [...prev, result])
      },
      onDone: (s, sid) => {
        setStats(s)
        setSessionId(sid)
        setRunning(false)
      },
      onError: err => {
        message.error(err)
        setRunning(false)
      },
    })
    stopRef.current = stop
  }

  const handleStop = () => {
    stopRef.current?.()
    setRunning(false)
  }

  const columns = [
    { title: '#', dataIndex: 'index', width: 50, render: (v: number) => v + 1 },
    {
      title: 'TTFT (ms)', dataIndex: 'ttft_ms', width: 100,
      render: (v?: number) => v != null ? v.toFixed(0) : '-',
    },
    {
      title: '总耗时 (ms)', dataIndex: 'total_ms', width: 110,
      render: (v?: number) => v != null ? v.toFixed(0) : '-',
    },
    { title: '输出 Token', dataIndex: 'output_tokens', width: 100, render: (v?: number) => v ?? '-' },
    {
      title: 'TPS', dataIndex: 'tokens_per_second', width: 80,
      render: (v?: number) => v != null ? v.toFixed(1) : '-',
    },
    {
      title: '状态', width: 70,
      render: (_: unknown, r: PerfResultItem) =>
        r.error ? <Tag color="red">错误</Tag> : <Tag color="green">OK</Tag>,
    },
  ]

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <Row gutter={16} style={{ height: '100%' }}>
      {/* 左侧配置 */}
      <Col span={7}>
        <Card size="small" title="压测配置" style={{ height: '100%' }}>
          <Form layout="vertical" size="small">
            <Form.Item label="Endpoint">
              <Select
                value={endpointId}
                onChange={v => { setEndpointId(v); setModel('') }}
                options={endpoints.map(e => ({ label: e.name, value: e.id }))}
                placeholder="选择 Endpoint"
              />
            </Form.Item>
            <Form.Item label="Model">
              <ModelSelect
                endpointId={endpointId}
                value={model}
                onChange={setModel}
              />
            </Form.Item>
            <Form.Item label="消息（JSON）">
              <TextArea
                rows={4}
                value={messagesJson}
                onChange={e => setMessagesJson(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
            <Form.Item label="System Prompt">
              <TextArea
                rows={2}
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
                min={1} max={32768} value={maxTokens}
                onChange={v => setMaxTokens(v ?? 2048)}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label="请求总数 (N)">
              <InputNumber
                min={1} max={200} value={n}
                onChange={v => setN(v ?? 10)}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label="并发数">
              <InputNumber
                min={1} max={20} value={concurrency}
                onChange={v => setConcurrency(v ?? 1)}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Space>
              {running ? (
                <Button danger icon={<StopOutlined />} onClick={handleStop}>停止</Button>
              ) : (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun}>开始压测</Button>
              )}
            </Space>
          </Form>
        </Card>
      </Col>

      {/* 右侧结果 */}
      <Col span={17} style={{ display: 'flex', flexDirection: 'column' }}>
        {(running || progress.completed > 0) && (
          <Card size="small" style={{ marginBottom: 12 }}>
            <Progress
              percent={pct}
              format={() => `${progress.completed} / ${progress.total}`}
              status={running ? 'active' : 'success'}
            />
          </Card>
        )}

        {stats && (
          <Card size="small" title="统计摘要" style={{ marginBottom: 12 }}
            extra={sessionId && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                会话 #{sessionId} 已存入历史
              </Typography.Text>
            )}
          >
            <Row gutter={[16, 8]}>
              <Col span={6}>
                <Statistic title="总请求 / 错误" value={stats.count} suffix={`/ ${stats.errors}`} />
              </Col>
              {stats.ttft && (
                <>
                  <Col span={6}><Statistic title="TTFT 均值 (ms)" value={stats.ttft.avg} precision={0} /></Col>
                  <Col span={6}><Statistic title="TTFT P95 (ms)" value={stats.ttft.p95} precision={0} /></Col>
                  <Col span={6}><Statistic title="TTFT 最大 (ms)" value={stats.ttft.max} precision={0} /></Col>
                </>
              )}
              {stats.total && (
                <>
                  <Col span={6}><Statistic title="耗时均值 (ms)" value={stats.total.avg} precision={0} /></Col>
                  <Col span={6}><Statistic title="耗时 P95 (ms)" value={stats.total.p95} precision={0} /></Col>
                  <Col span={6}><Statistic title="耗时最大 (ms)" value={stats.total.max} precision={0} /></Col>
                </>
              )}
              {stats.tps && (
                <>
                  <Col span={6}><Statistic title="TPS 均值" value={stats.tps.avg} precision={1} /></Col>
                  <Col span={6}><Statistic title="TPS 最小" value={stats.tps.min} precision={1} /></Col>
                </>
              )}
            </Row>
          </Card>
        )}

        {results.length > 0 && (
          <Table
            dataSource={results}
            columns={columns}
            rowKey="index"
            size="small"
            pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
            scroll={{ y: 420 }}
          />
        )}
      </Col>
    </Row>
  )
}
