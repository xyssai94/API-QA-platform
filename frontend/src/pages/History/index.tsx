import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Tag, Space, Popconfirm, message,
  Typography, Tooltip, Select, Row, Col, Rate,
} from 'antd'
import {
  DownloadOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, PlayCircleOutlined,
} from '@ant-design/icons'
import {
  listHistory, getHistorySession, deleteHistorySession, exportHistoryCsv,
  setResultScore, listEndpoints, runSingle,
} from '../../api'
import type { HistorySession, HistoryResult, Endpoint } from '../../types'
import StreamOutput from '../../components/StreamOutput'
import ModelSelect from '../../components/ModelSelect'

const TYPE_LABEL: Record<string, string> = {
  single: '单条', batch: '批量', compare: '对比', perf: '压测',
}
const STATUS_COLOR: Record<string, string> = {
  done: 'green', running: 'blue', error: 'red',
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState<string | undefined>()
  const [filterStatus, setFilterStatus] = useState<string | undefined>()

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailResults, setDetailResults] = useState<HistoryResult[]>([])
  const [detailSession, setDetailSession] = useState<HistorySession | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // rerun state
  const [rerunOpen, setRerunOpen] = useState(false)
  const [rerunResult, setRerunResult] = useState<HistoryResult | null>(null)
  const [rerunEndpointId, setRerunEndpointId] = useState<number | undefined>()
  const [rerunModel, setRerunModel] = useState('')
  const [rerunOutput, setRerunOutput] = useState('')
  const [rerunUsage, setRerunUsage] = useState({})
  const [rerunLoading, setRerunLoading] = useState(false)
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])

  const PAGE_SIZE = 20

  const load = useCallback(async (p = page, t = filterType, s = filterStatus) => {
    setLoading(true)
    try {
      const data = await listHistory({ skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE, type: t, status: s })
      setSessions(data.items)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [page, filterType, filterStatus])

  useEffect(() => {
    load()
    listEndpoints().then(eps => {
      setEndpoints(eps)
      if (eps.length > 0) setRerunEndpointId(eps[0].id)
    })
  }, [load])

  const handleFilter = (type?: string, status?: string) => {
    setFilterType(type)
    setFilterStatus(status)
    setPage(1)
    load(1, type, status)
  }

  const openDetail = async (s: HistorySession) => {
    setDetailSession(s)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const data = await getHistorySession(s.id)
      setDetailResults(data.results)
    } catch {
      message.error('加载失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    await deleteHistorySession(id)
    message.success('已删除')
    load()
  }

  const handleScore = async (resultId: number, score: number) => {
    await setResultScore(resultId, score)
    setDetailResults(prev => prev.map(r => r.id === resultId ? { ...r, score } : r))
  }

  const openRerun = (r: HistoryResult) => {
    setRerunResult(r)
    setRerunModel(r.request_snapshot?.model ?? '')
    setRerunOutput('')
    setRerunUsage({})
    setRerunOpen(true)
  }

  const executeRerun = async () => {
    if (!rerunResult || !rerunEndpointId || !rerunModel) {
      message.warning('请选择 Endpoint 和 Model')
      return
    }
    const msgs = rerunResult.request_snapshot?.messages as { role: 'user' | 'assistant' | 'system'; content: string }[] | undefined
    if (!msgs) { message.error('无法获取原始消息'); return }

    setRerunLoading(true)
    try {
      const res = await runSingle({
        endpoint_id: rerunEndpointId,
        model: rerunModel,
        messages: msgs,
        system_prompt: rerunResult.request_snapshot?.system_prompt,
      })
      setRerunOutput(res.response)
      setRerunUsage(res.usage)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      message.error(err.response?.data?.detail ?? '运行失败')
    } finally {
      setRerunLoading(false)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '类型', dataIndex: 'type', width: 80,
      render: (t: string) => <Tag>{TYPE_LABEL[t] ?? t}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
    },
    { title: '结果数', dataIndex: 'result_count', width: 80 },
    {
      title: '时间', dataIndex: 'created_at', width: 170,
      render: (t?: string) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', width: 160,
      render: (_: unknown, s: HistorySession) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(s)}>查看</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => exportHistoryCsv(s.id)}>CSV</Button>
          <Popconfirm title="确认删除此会话及其所有结果？" onConfirm={() => handleDelete(s.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const resultColumns = [
    { title: '#', dataIndex: 'id', width: 55 },
    {
      title: '用例', width: 140,
      render: (_: unknown, r: HistoryResult) =>
        r.test_case_name
          ? <Tag color="geekblue" style={{ fontSize: 11 }}>{r.test_case_name}</Tag>
          : <Typography.Text type="secondary" style={{ fontSize: 11 }}>{r.request_snapshot?.model ?? '-'}</Typography.Text>,
    },
    {
      title: 'TTFT', dataIndex: 'ttft_ms', width: 75,
      render: (v?: number) => v != null ? `${v.toFixed(0)}ms` : '-',
    },
    {
      title: '耗时', dataIndex: 'total_ms', width: 80,
      render: (v?: number) => v != null ? `${v.toFixed(0)}ms` : '-',
    },
    {
      title: '输出T', dataIndex: 'output_tokens', width: 65,
      render: (v?: number) => v ?? '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 60,
      render: (s: string) => <Tag color={s === 'ok' ? 'green' : 'red'} style={{ fontSize: 11 }}>{s}</Tag>,
    },
    {
      title: '评分', dataIndex: 'score', width: 120,
      render: (score: number | undefined, r: HistoryResult) => (
        <Rate
          count={5}
          value={score ?? 0}
          style={{ fontSize: 13 }}
          onChange={v => handleScore(r.id, v)}
        />
      ),
    },
    {
      title: '回复',
      render: (_: unknown, r: HistoryResult) => {
        const text = r.error_msg || r.response_text || ''
        return (
          <Tooltip title={<pre style={{ maxWidth: 500, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>{text}</pre>}>
            <Typography.Text ellipsis style={{ maxWidth: 160, fontSize: 12 }}>{text}</Typography.Text>
          </Tooltip>
        )
      },
    },
    {
      title: '', width: 60,
      render: (_: unknown, r: HistoryResult) => (
        <Button size="small" icon={<PlayCircleOutlined />} onClick={() => openRerun(r)} />
      ),
    },
  ]

  return (
    <>
      <Row gutter={8} style={{ marginBottom: 12 }}>
        <Col>
          <Select allowClear placeholder="类型" style={{ width: 110 }} value={filterType}
            onChange={v => handleFilter(v, filterStatus)}
            options={[
              { label: '单条', value: 'single' }, { label: '批量', value: 'batch' },
              { label: '对比', value: 'compare' }, { label: '压测', value: 'perf' },
            ]}
          />
        </Col>
        <Col>
          <Select allowClear placeholder="状态" style={{ width: 100 }} value={filterStatus}
            onChange={v => handleFilter(filterType, v)}
            options={[
              { label: '完成', value: 'done' }, { label: '运行中', value: 'running' },
              { label: '错误', value: 'error' },
            ]}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
        </Col>
        <Col flex={1}>
          <Typography.Text type="secondary">共 {total} 条</Typography.Text>
        </Col>
      </Row>

      <Table
        dataSource={sessions} columns={columns} rowKey="id"
        loading={loading} size="small"
        pagination={{
          current: page, pageSize: PAGE_SIZE, total, size: 'small',
          onChange: p => { setPage(p); load(p) },
        }}
      />

      {/* 详情弹窗 */}
      <Modal
        title={`会话 #${detailSession?.id}（${TYPE_LABEL[detailSession?.type ?? ''] ?? ''}）`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          <Button key="csv" icon={<DownloadOutlined />}
            onClick={() => detailSession && exportHistoryCsv(detailSession.id)}>
            导出 CSV
          </Button>,
          <Button key="close" onClick={() => setDetailOpen(false)}>关闭</Button>,
        ]}
        width={1060}
        destroyOnClose
      >
        <Table
          dataSource={detailResults} columns={resultColumns} rowKey="id"
          size="small" loading={detailLoading}
          pagination={{ pageSize: 20, size: 'small' }}
          scroll={{ y: 400 }}
        />
      </Modal>

      {/* 重跑弹窗 */}
      <Modal
        title="重跑"
        open={rerunOpen}
        onCancel={() => setRerunOpen(false)}
        onOk={executeRerun}
        confirmLoading={rerunLoading}
        okText="运行"
        width={700}
        destroyOnClose
      >
        <Space style={{ marginBottom: 12 }}>
          <Select
            value={rerunEndpointId}
            onChange={v => { setRerunEndpointId(v); setRerunModel('') }}
            options={endpoints.map(e => ({ label: e.name, value: e.id }))}
            style={{ width: 200 }}
            placeholder="选择 Endpoint"
          />
          <ModelSelect
            endpointId={rerunEndpointId}
            value={rerunModel}
            onChange={setRerunModel}
            style={{ width: 280 }}
          />
        </Space>
        {rerunOutput && (
          <StreamOutput
            text={rerunOutput}
            loading={false}
            usage={rerunUsage as never}
          />
        )}
      </Modal>
    </>
  )
}
