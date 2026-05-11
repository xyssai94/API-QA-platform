import { Layout, Menu } from 'antd'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { MessageOutlined, SettingOutlined, FileTextOutlined, SwapOutlined, ThunderboltOutlined, HistoryOutlined, ProfileOutlined } from '@ant-design/icons'
import ChatPage from './pages/Chat'
import SettingsPage from './pages/Settings'
import TestCasesPage from './pages/TestCases'
import ComparePage from './pages/Compare'
import PerfPage from './pages/Perf'
import HistoryPage from './pages/History'
import PresetsPage from './pages/Presets'

const { Content, Sider } = Layout

const NAV_ITEMS = [
  { key: '/chat', icon: <MessageOutlined />, label: '对话测试' },
  { key: '/test-cases', icon: <FileTextOutlined />, label: '测试用例' },
  { key: '/compare', icon: <SwapOutlined />, label: '多模型对比' },
  { key: '/perf', icon: <ThunderboltOutlined />, label: '性能压测' },
  { key: '/history', icon: <HistoryOutlined />, label: '历史记录' },
  { key: '/presets', icon: <ProfileOutlined />, label: '参数预设' },
  { key: '/settings', icon: <SettingOutlined />, label: '连接配置' },
]

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={200} style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px 24px', fontWeight: 700, fontSize: 16, borderBottom: '1px solid #f0f0f0' }}>
          模型测试平台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname === '/' ? '/chat' : location.pathname]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, height: '100vh', overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/test-cases" element={<TestCasesPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/perf" element={<PerfPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/presets" element={<PresetsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}
