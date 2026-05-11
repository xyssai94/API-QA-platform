import { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, Space, Popconfirm, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useConfigStore } from '../../stores/configStore'
import { listEndpoints, createEndpoint, updateEndpoint, deleteEndpoint } from '../../api'
import type { Endpoint } from '../../types'

const PROTOCOLS = [
  { label: 'OpenAI Chat Completions', value: 'openai_cc' },
  { label: 'Anthropic 原生', value: 'anthropic' },
  { label: 'OpenAI Responses API', value: 'openai_resp' },
  { label: 'Google Gemini 原生', value: 'gemini' },
]

export default function SettingsPage() {
  const { endpoints, setEndpoints, addEndpoint, updateEndpoint: updateStore, removeEndpoint } = useConfigStore()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Endpoint | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listEndpoints().then(setEndpoints)
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (ep: Endpoint) => {
    setEditing(ep)
    form.setFieldsValue(ep)
    setOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        const updated = await updateEndpoint(editing.id, values)
        updateStore(updated)
        message.success('已更新')
      } else {
        const created = await createEndpoint(values)
        addEndpoint(created)
        message.success('已创建')
      }
      setOpen(false)
    } catch {
      message.error('操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await deleteEndpoint(id)
    removeEndpoint(id)
    message.success('已删除')
  }

  const columns = [
    { title: '名称', dataIndex: 'name' },
    { title: '协议', dataIndex: 'protocol', render: (v: string) => PROTOCOLS.find(p => p.value === v)?.label ?? v },
    { title: 'Base URL', dataIndex: 'base_url' },
    { title: 'API Key', dataIndex: 'api_key', render: (v?: string) => v ? `${v.slice(0, 6)}...` : '-' },
    {
      title: '操作',
      render: (_: unknown, ep: Endpoint) => (
        <Space>
          <Button size="small" onClick={() => openEdit(ep)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(ep.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 16 }}>
        添加 Endpoint
      </Button>
      <Table dataSource={endpoints} columns={columns} rowKey="id" size="small" />

      <Modal
        title={editing ? '编辑 Endpoint' : '新建 Endpoint'}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="protocol" label="协议" rules={[{ required: true }]}>
            <Select options={PROTOCOLS} />
          </Form.Item>
          <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key">
            <Input.Password />
          </Form.Item>
          <Form.Item name="proxy" label="代理">
            <Input placeholder="http://127.0.0.1:7890" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
