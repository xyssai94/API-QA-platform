# API QA Platform — 模型测试平台

一个面向 LLM API 的全功能测试平台，支持多协议、流式输出、批量测试、性能压测、多模型对比等功能。

## 技术栈

| 层次 | 选型 |
|------|------|
| 后端 | Python 3.14 + FastAPI + SQLAlchemy + SQLite |
| 前端 | React 19 + TypeScript + Vite + Ant Design + Zustand |
| 通信 | REST API + SSE 流式输出 |
| 存储 | SQLite（本地文件 `data/qa.db`） |

## 功能特性

- **对话测试**：流式 / 非流式对话，支持加载参数预设，可保存为测试用例
- **测试用例管理**：CRUD、单条运行、批量运行（含期望匹配）、JSON 导入 / 导出
- **多模型对比**：同一 prompt 并发发往多个 endpoint / model，并排展示结果
- **性能压测**：配置并发数和请求次数，实时进度 + P95 / 均值统计
- **历史记录**：按类型 / 状态筛选，查看详情、手动评分（1-5 星）、重跑、CSV 导出
- **参数预设**：管理常用配置，Chat 页一键加载
- **Endpoint 管理**：支持 OpenAI CC、Anthropic、Gemini、OpenAI Responses 四种协议

## 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8006 --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

## 目录结构

```
qa-platform/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models/
│   ├── schemas/
│   ├── routers/
│   └── adapters/
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       └── types/
└── data/
    └── qa.db
```

## 支持的协议

| 协议 | 说明 |
|------|------|
| `openai_cc` | OpenAI Chat Completions（兼容所有 OpenAI 格式接口） |
| `anthropic` | Anthropic 原生 Messages API |
| `gemini` | Google Gemini 原生 API |
| `openai_resp` | OpenAI Responses API |

## 开发文档

详见 [DEV.md](./DEV.md)
