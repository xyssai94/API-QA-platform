import { useEffect, useState, useRef } from 'react'
import {
  Table, Button, Modal, Form, Input, Space, Popconfirm, message,
  Tag, Select, Progress, Typography, Tooltip, Upload,
} from 'antd'
import {
  PlusOutlined, PlayCircleOutlined, ThunderboltOutlined,
  DownloadOutlined, UploadOutlined,
} from '@ant-design/icons'
import {
  listTestCases, createTestCase, updateTestCase, deleteTestCase,
  runSingle, listEndpoints, startBatchTest,
  exportTestCasesJson, importTestCasesJson,
} from '../../api'
import type { TestCase } from '../../types/testCase'
import type { Endpoint, BatchResultItem } from '../../types'
import StreamOutput from '../../components/StreamOutput'
import ModelSelect from '../../components/ModelSelect'

const { TextArea } = Input

export default function TestCasesPage() {
  const [cases, setCases] = useState<TestCase[]>([])
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TestCase | null>(null)
  const [form] = Form.useForm()

  // Single run
  const [runModal, setRunModal] = useState(false)
  const [runningCase, setRunningCase] = useState<TestCase | null>(null)
  const [runResult, setRunResult] = useState({ text: '', usage: {}, ttft: 0, total: 0 })
  const [runLoading, setRunLoading] = useState(false)
  const [runEndpointId, setRunEndpointId] = useState<number | undefined>()

  // Batch run
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchModal, setBatchModal] = useState(false)
  const [batchForm] = Form.useForm()
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([])
  const [batchDone, setBatchDone] = useState<{ sessionId: number; errors: number } | null>(null)
  const batchStopRef = useRef<(() => void) | null>(null)

  const loadCases = async () => {
    setLoading(true)
    try {
      const data = await listTestCases()
      setCases(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCases()
    listEndpoints().then(setEndpoints)
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (tc: TestCase) => {
    setEditing(tc)
    form.setFieldsValue({
      ...tc,
      messages: JSON.stringify(tc.messages, null, 2),
      tags: tc.tags?.join(', '),
    })
    setOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload = {
      ...values,
      messages: JSON.parse(values.messages),
      tags: values.tags ? values.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
    }
    try {
      if (editing) {
        await updateTestCase(editing.id, payload)
        message.success('已更新')
      } else {
        await createTestCase(payload)
        message.success('已创建')
      }
      setOpen(false)
      loadCases()
    } catch {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    await deleteTestCase(id)
    message.success('已删除')
    loadCases()
  }

  const handleRun = (tc: TestCase) => {
    setRunningCase(tc)
    setRunResult({ text: '', usage: {}, ttft: 0, total: 0 })
    setRunEndpointId(endpoints[0]?.id)
    setRunModal(true)
  }

  const executeRun = async (values: { endpoint_id: number; model: string }) => {
    if (!runningCase) return
    setRunLoading(true)
    try {
      const result = await runSingle({
        endpoint_id: values.endpoint_id,
        model: values.model,
        messages: runningCase.messages,
      })
      setRunResult({
        text: result.response,
        usage: result.usage,
        ttft: result.ttft_ms ?? 0,
        total: result.total_ms ?? 0,
      })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      message.error(err.response?.data?.detail ?? '运行失败')
    } finally {
      setRunLoading(false)
    }
  }

  const openBatch = () => {
    setBatchResults([])
    setBatchProgress({ completed: 0, total: 0 })
    setBatchDone(null)
    setBatchRunning(false)
    if (endpoints.length > 0) {
      batchForm.setFieldsValue({ endpoint_id: endpoints[0].id })
    }
    setBatchModal(true)
  }

  const executeBatch = async (values: { endpoint_id: number; model: string }) => {
    setBatchRunning(true)
    setBatchResults([])
    setBatchDone(null)
    setBatchProgress({ completed: 0, total: selectedIds.length })

    const stop = startBatchTest({
      endpoint_id: values.endpoint_id,
      model: values.model,
      test_case_ids: selectedIds,
      onProgress: (completed, total, result) => {
        setBatchProgress({ completed, total })
        setBatchResults(prev => [...prev, result])
      },
      onDone: (sessionId, total, errors) => {
        setBatchDone({ sessionId, errors })
        setBatchRunning(false)
        message.success(`批量运行完成，共 ${total} 条，错误 ${errors} 条`)
      },
      onError: err => {
        message.error(err)
        setBatchRunning(false)
      },
    })
    batchStopRef.current = stop
  }

  const batchResultColumns = [
    { title: '用例名称', dataIndex: 'test_case_name', ellipsis: true },
    {
      title: 'TTFT (ms)', dataIndex: 'ttft_ms', width: 100,
      render: (v?: number) => v != null ? v.toFixed(0) : '-',
    },
    {
      title: '耗时 (ms)', dataIndex: 'total_ms', width: 100,
      render: (v?: number) => v != null ? v.toFixed(0) : '-',
    },
    { title: '输出 Token', dataIndex: 'output_tokens', width: 100, render: (v?: number) => v ?? '-' },
    {
      title: '匹配期望', dataIndex: 'matched', width: 90,
      render: (v: boolean | null | undefined) =>
        v == null ? <Tag>N/A</Tag> : v ? <Tag color="green">✓</Tag> : <Tag color="red">✗</Tag>,
    },
    {
      title: '状态', width: 70,
      render: (_: unknown, r: BatchResultItem) =>
        r.error ? <Tag color="red">错误</Tag> : <Tag color="green">OK</Tag>,
    },
    {
      title: '回复摘要',
      render: (_: unknown, r: BatchResultItem) => {
        const text = r.error || r.response || ''
        return (
          <Tooltip title={<pre style={{ maxWidth: 480, whiteSpace: 'pre-wrap', maxHeight: 280, overflowY: 'auto' }}>{text}</pre>}>
            <Typography.Text ellipsis style={{ maxWidth: 180, fontSize: 12 }}>{text}</Typography.Text>
          </Tooltip>
        )
      },
    },
  ]

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name' },
    { title: '分组', dataIndex: 'group_name', width: 120 },
    {
      title: '标签', dataIndex: 'tags', width: 150,
      render: (tags?: string[]) => tags?.map(t => <Tag key={t}>{t}</Tag>),
    },
    {
      title: '消息数', dataIndex: 'messages', width: 80,
      render: (msgs: TestCase['messages']) => msgs.length,
    },
    {
      title: '操作', width: 200,
      render: (_: unknown, tc: TestCase) => (
        <Space>
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleRun(tc)}>运行</Button>
          <Button size="small" onClick={() => openEdit(tc)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(tc.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建用例</Button>
        {selectedIds.length > 0 && (
          <Button icon={<ThunderboltOutlined />} onClick={openBatch}>
            批量运行（{selectedIds.length} 条）
          </Button>
        )}
        <Button icon={<DownloadOutlined />} onClick={exportTestCasesJson}>导出 JSON</Button>
        <Upload
          accept=".json"
          showUploadList={false}
          beforeUpload={async (file) => {
            try {
              const text = await file.text()
              const data = JSON.parse(text)
              const arr = Array.isArray(data) ? data : [data]
              const res = await importTestCasesJson(arr)
              message.success(`导入完成：新增 ${res.created} 条，跳过 ${res.skipped} 条`)
              loadCases()
            } catch {
              message.error('导入失败，请检查文件格式')
            }
            return false
          }}
        >
          <Button icon={<UploadOutlined />}>导入 JSON</Button>
        </Upload>
      </Space>

      <Table
        dataSource={cases}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: keys => setSelectedIds(keys as number[]),
        }}
      />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editing ? '编辑用例' : '新建用例'}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="group_name" label="分组">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input placeholder="如：问候, 简单" />
          </Form.Item>
          <Form.Item name="messages" label="消息（JSON）" rules={[{ required: true }]}>
            <TextArea
              rows={10}
              placeholder='[{"role": "user", "content": "hello"}]'
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
          <Form.Item name="expected" label="期望输出（用于批量运行时匹配判断）">
            <TextArea rows={3} placeholder="可选，填写后批量运行会判断是否包含此内容" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 单条运行弹窗 */}
      <Modal
        title={`运行用例：${runningCase?.name}`}
        open={runModal}
        onCancel={() => setRunModal(false)}
        footer={null}
        width={800}
      >
        <Form layout="inline" onFinish={executeRun} style={{ marginBottom: 16 }}>
          <Form.Item name="endpoint_id" label="Endpoint" rules={[{ required: true }]} style={{ width: 200 }}>
            <Select
              options={endpoints.map(e => ({ label: e.name, value: e.id }))}
              placeholder="选择"
              onChange={v => setRunEndpointId(v)}
            />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true }]} style={{ width: 280 }}>
            <ModelSelect endpointId={runEndpointId} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={runLoading}>运行</Button>
        </Form>
        {runResult.text && (
          <StreamOutput
            text={runResult.text}
            loading={false}
            usage={runResult.usage as never}
            ttft_ms={runResult.ttft}
            total_ms={runResult.total}
          />
        )}
      </Modal>

      {/* 批量运行弹窗 */}
      <Modal
        title={`批量运行（${selectedIds.length} 条用例）`}
        open={batchModal}
        onCancel={() => {
          if (batchRunning) batchStopRef.current?.()
          setBatchModal(false)
        }}
        footer={null}
        width={900}
        destroyOnClose
      >
        <Form layout="inline" form={batchForm} onFinish={executeBatch} style={{ marginBottom: 16 }}>
          <Form.Item name="endpoint_id" label="Endpoint" rules={[{ required: true }]} style={{ width: 220 }}>
            <Select options={endpoints.map(e => ({ label: e.name, value: e.id }))} placeholder="选择" />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true }]} style={{ width: 260 }}>
            <Input placeholder="模型名称" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={batchRunning} icon={<ThunderboltOutlined />}>
            开始
          </Button>
          {batchRunning && (
            <Button danger style={{ marginLeft: 8 }} onClick={() => { batchStopRef.current?.(); setBatchRunning(false) }}>
              停止
            </Button>
          )}
        </Form>

        {batchProgress.total > 0 && (
          <Progress
            percent={Math.round((batchProgress.completed / batchProgress.total) * 100)}
            format={() => `${batchProgress.completed} / ${batchProgress.total}`}
            status={batchRunning ? 'active' : 'success'}
            style={{ marginBottom: 12 }}
          />
        )}

        {batchDone && (
          <Typography.Text type={batchDone.errors > 0 ? 'warning' : 'success'} style={{ display: 'block', marginBottom: 8 }}>
            完成，会话 #{batchDone.sessionId}，错误 {batchDone.errors} 条。可在「历史记录」页查看详情或导出 CSV。
          </Typography.Text>
        )}

        {batchResults.length > 0 && (
          <Table
            dataSource={batchResults}
            columns={batchResultColumns}
            rowKey="test_case_id"
            size="small"
            pagination={{ pageSize: 15, size: 'small' }}
            scroll={{ y: 360 }}
          />
        )}
      </Modal>
    </>
  )
}
