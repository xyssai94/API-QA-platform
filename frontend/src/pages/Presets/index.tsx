import { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Space,
  Popconfirm, message, InputNumber, Slider,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { listPresets, createPreset, updatePreset, deletePreset, listEndpoints } from '../../api'
import type { Preset, Endpoint } from '../../types'
import ModelSelect from '../../components/ModelSelect'

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Preset | null>(null)
  const [form] = Form.useForm()
  const [selectedEndpointId, setSelectedEndpointId] = useState<number | undefined>()

  const load = async () => {
    setLoading(true)
    try {
      const [ps, eps] = await Promise.all([listPresets(), listEndpoints()])
      setPresets(ps)
      setEndpoints(eps)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setSelectedEndpointId(undefined)
    form.resetFields()
    form.setFieldsValue({ params: { temperature: 1, max_tokens: 2048 } })
    setOpen(true)
  }

  const openEdit = (p: Preset) => {
    setEditing(p)
    setSelectedEndpointId(p.endpoint_id)
    form.setFieldsValue({
      name: p.name,
      endpoint_id: p.endpoint_id,
      model: p.model,
      system_prompt: p.system_prompt,
      temperature: p.params.temperature ?? 1,
      max_tokens: p.params.max_tokens ?? 2048,
    })
    setOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload = {
      name: values.name,
      endpoint_id: values.endpoint_id,
      model: values.model,
      system_prompt: values.system_prompt || undefined,
      params: {
        temperature: values.temperature,
        max_tokens: values.max_tokens,
      },
    }
    try {
      if (editing) {
        await updatePreset(editing.id, payload)
        message.success('已更新')
      } else {
        await createPreset(payload)
        message.success('已创建')
      }
      setOpen(false)
      load()
    } catch {
      message.error('操作失败')
    }
  }

  const endpointName = (id: number) => endpoints.find(e => e.id === id)?.name ?? id

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name' },
    {
      title: 'Endpoint', dataIndex: 'endpoint_id', width: 160,
      render: (id: number) => endpointName(id),
    },
    { title: 'Model', dataIndex: 'model' },
    {
      title: 'Temperature', width: 110,
      render: (_: unknown, p: Preset) => p.params.temperature ?? '-',
    },
    {
      title: 'Max Tokens', width: 110,
      render: (_: unknown, p: Preset) => p.params.max_tokens ?? '-',
    },
    {
      title: 'System Prompt', dataIndex: 'system_prompt', ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '操作', width: 140,
      render: (_: unknown, p: Preset) => (
        <Space>
          <Button size="small" onClick={() => openEdit(p)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(p.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleDelete = async (id: number) => {
    await deletePreset(id)
    message.success('已删除')
    load()
  }

  const watchEndpointId = Form.useWatch('endpoint_id', form)

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 16 }}>
        新建预设
      </Button>

      <Table dataSource={presets} columns={columns} rowKey="id" loading={loading} size="small" />

      <Modal
        title={editing ? '编辑预设' : '新建预设'}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="预设名称" rules={[{ required: true }]}>
            <Input placeholder="如：Claude 高创意" />
          </Form.Item>
          <Form.Item name="endpoint_id" label="Endpoint" rules={[{ required: true }]}>
            <Select
              options={endpoints.map(e => ({ label: e.name, value: e.id }))}
              onChange={v => setSelectedEndpointId(v)}
              placeholder="选择 Endpoint"
            />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true }]}>
            <ModelSelect endpointId={watchEndpointId ?? selectedEndpointId} />
          </Form.Item>
          <Form.Item name="system_prompt" label="System Prompt">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
          <Form.Item name="temperature" label={`Temperature: ${form.getFieldValue('temperature') ?? 1}`}>
            <Slider min={0} max={2} step={0.1} />
          </Form.Item>
          <Form.Item name="max_tokens" label="Max Tokens">
            <InputNumber min={1} max={32768} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
