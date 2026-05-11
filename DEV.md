# 模型测试平台 — 开发文档

## 技术栈

| 层次 | 选型 |
|------|------|
| 后端 | Python 3.14 + FastAPI + SQLAlchemy + SQLite |
| 前端 | React 19 + TypeScript + Vite + Ant Design + Zustand |
| 通信 | REST API + SSE 流式输出 |
| 存储 | SQLite（本地文件 `data/qa.db`） |

---

## 启动方式

### 后端
```bash
cd qa-platform/backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8006 --reload
```

### 前端
```bash
cd qa-platform/frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

> 前端 `src/api/index.ts` 中 `BASE` 常量硬编码为 `http://localhost:8006/api`，换端口时同步修改。

---

## 目录结构

```
qa-platform/
├── backend/
│   ├── main.py                      # FastAPI 入口，注册所有路由、CORS、启动初始化
│   ├── database.py                  # SQLite 连接、SessionLocal、init_db()
│   ├── requirements.txt
│   ├── models/                      # SQLAlchemy ORM 表定义
│   │   ├── endpoint.py              # endpoints 表
│   │   ├── preset.py                # presets 表
│   │   ├── test_case.py             # test_cases 表
│   │   ├── test_session.py          # test_sessions 表
│   │   └── test_result.py           # test_results 表
│   ├── schemas/                     # Pydantic 请求/响应模型
│   │   ├── endpoint.py              # EndpointCreate / EndpointUpdate / EndpointOut
│   │   ├── test_run.py              # SingleRunRequest / RunParams
│   │   ├── test_case.py             # TestCaseCreate / TestCaseUpdate / TestCaseOut
│   │   └── preset.py                # PresetCreate / PresetUpdate / PresetOut
│   ├── routers/
│   │   ├── endpoints.py             # Endpoint CRUD + GET /{id}/models（拉模型列表）
│   │   ├── run.py                   # POST /run/single（单条，流式/非流式）
│   │   ├── compare.py               # POST /run/compare（多模型并发对比）
│   │   ├── perf.py                  # POST /run/perf（压测，SSE 实时进度）
│   │   ├── batch.py                 # POST /run/batch（批量用例，SSE 实时进度）
│   │   ├── test_cases.py            # 测试用例 CRUD + JSON 导入/导出
│   │   ├── presets.py               # 参数预设 CRUD
│   │   └── history.py               # 历史会话查询 + CSV 导出 + 结果评分
│   └── adapters/
│       ├── base.py                  # 抽象基类 BaseAdapter、RunRequest、RunResult、ChunkEvent
│       ├── openai_cc.py             # OpenAI Chat Completions
│       ├── anthropic_native.py      # Anthropic 原生 Messages API
│       ├── gemini_native.py         # Google Gemini 原生 API
│       └── openai_responses.py      # OpenAI Responses API
│
├── frontend/
│   └── src/
│       ├── api/index.ts             # 所有后端接口封装（axios + fetch SSE）
│       ├── types/index.ts           # 全局 TypeScript 类型
│       ├── types/testCase.ts        # TestCase 类型
│       ├── stores/
│       │   └── configStore.ts       # Zustand 持久化 store（endpoint、model 选择）
│       ├── components/
│       │   ├── StreamOutput/        # 流式文本渲染 + Token 统计展示
│       │   └── ModelSelect/         # AutoComplete + 按 Endpoint 拉取模型列表
│       ├── pages/
│       │   ├── Chat/                # 对话测试（流式/非流式，支持加载预设）
│       │   ├── TestCases/           # 测试用例管理（CRUD + 单条运行 + 批量运行 + 导入/导出）
│       │   ├── Compare/             # 多模型对比
│       │   ├── Perf/                # 性能压测
│       │   ├── History/             # 历史记录（筛选 + 详情 + 评分 + 重跑 + CSV 导出）
│       │   ├── Presets/             # 参数预设管理
│       │   └── Settings/            # Endpoint 管理
│       ├── App.tsx                  # 布局 + 路由（7 个页面）
│       └── main.tsx                 # 入口，ConfigProvider zh_CN
│
└── data/
    └── qa.db                        # SQLite 数据库（自动创建）
```

---

## 数据库设计

### endpoints
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | TEXT | 显示名称 |
| protocol | TEXT | `openai_cc` / `anthropic` / `openai_resp` / `gemini` |
| base_url | TEXT | 如 `https://api.openai.com/v1` |
| api_key | TEXT | |
| extra_headers | TEXT | JSON 字符串 |
| proxy | TEXT | 如 `http://127.0.0.1:7890` |
| created_at | DATETIME | |

### presets
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | TEXT | |
| endpoint_id | INTEGER FK | |
| model | TEXT | |
| params | TEXT | JSON（temperature、max_tokens 等） |
| system_prompt | TEXT | |
| created_at | DATETIME | |

### test_cases
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| group_name | TEXT | 分组 |
| tags | TEXT | JSON 数组 |
| name | TEXT | |
| messages | TEXT | JSON messages 数组 |
| attachments | TEXT | JSON 多模态输入（预留） |
| expected | TEXT | 期望输出，批量运行时用于匹配判断 |
| created_at | DATETIME | |

### test_sessions
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| type | TEXT | `single` / `batch` / `compare` / `perf` |
| name | TEXT | |
| status | TEXT | `running` / `done` / `error` |
| created_at | DATETIME | |
| finished_at | DATETIME | |

### test_results
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| session_id | INTEGER FK | |
| test_case_id | INTEGER FK | 批量测试时关联用例 |
| request_snapshot | TEXT | JSON，实际发送的请求快照 |
| response_text | TEXT | |
| thinking_text | TEXT | Thinking 模式推理内容 |
| ttft_ms | REAL | 首 Token 延迟（毫秒） |
| total_ms | REAL | 总耗时 |
| input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| cache_read_tokens | INTEGER | |
| cache_write_tokens | INTEGER | |
| reasoning_tokens | INTEGER | |
| tokens_per_second | REAL | |
| score | INTEGER | 1-5 手动评分 |
| status | TEXT | `ok` / `error` |
| error_msg | TEXT | |
| created_at | DATETIME | |

---

## API 接口

### Endpoint 管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/endpoints/ | 列表 |
| POST | /api/endpoints/ | 创建 |
| GET | /api/endpoints/{id} | 详情 |
| PATCH | /api/endpoints/{id} | 更新 |
| DELETE | /api/endpoints/{id} | 删除 |
| GET | /api/endpoints/{id}/models | 拉取该 Endpoint 可用模型列表（调 `/models` 接口） |

### 参数预设
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/presets/ | 列表 |
| POST | /api/presets/ | 创建 |
| PATCH | /api/presets/{id} | 更新 |
| DELETE | /api/presets/{id} | 删除 |

### 测试用例
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/test-cases/ | 列表，支持 `?group=` `?tag=` 过滤 |
| POST | /api/test-cases/ | 创建 |
| GET | /api/test-cases/{id} | 详情 |
| PATCH | /api/test-cases/{id} | 更新 |
| DELETE | /api/test-cases/{id} | 删除 |
| GET | /api/test-cases/export/json | 导出全部为 JSON 文件 |
| POST | /api/test-cases/import/json | 批量导入，支持 `skip_duplicates`（默认 true） |

### 测试执行

#### 单条测试
```
POST /api/run/single
```
```json
{
  "endpoint_id": 1,
  "model": "claude-sonnet-4-5-20250929",
  "messages": [{"role": "user", "content": "hello"}],
  "system_prompt": "可选",
  "params": {"temperature": 0.7, "max_tokens": 2048},
  "stream": true
}
```
SSE 流式事件格式：
```
data: {"type": "content", "content": "Hello", "ttft_ms": 320.5}
data: {"type": "done", "usage": {...}, "total_ms": 1200}
data: {"type": "error", "error": "..."}
```

#### 多模型对比
```
POST /api/run/compare
```
```json
{
  "messages": [...],
  "system_prompt": "可选",
  "params": {"temperature": 1, "max_tokens": 2048},
  "configs": [
    {"endpoint_id": 1, "model": "claude-sonnet-4-5-20250929"},
    {"endpoint_id": 1, "model": "claude-opus-4-7"}
  ]
}
```
返回：`{"session_id": 5, "results": [...]}`，结果同时写入历史。

#### 批量测试
```
POST /api/run/batch
```
```json
{
  "endpoint_id": 1,
  "model": "claude-sonnet-4-5-20250929",
  "test_case_ids": [1, 2, 3],
  "params": {"temperature": 1, "max_tokens": 2048}
}
```
SSE 推送：
```
data: {"type": "progress", "completed": 1, "total": 3, "result": {"test_case_id": 1, "test_case_name": "...", "response": "...", "matched": true, ...}}
data: {"type": "done", "session_id": 6, "total": 3, "errors": 0}
```

#### 性能压测
```
POST /api/run/perf
```
```json
{
  "endpoint_id": 1,
  "model": "claude-sonnet-4-5-20250929",
  "messages": [...],
  "n": 20,
  "concurrency": 4
}
```
SSE 推送每条进度，最终 `done` 事件含统计摘要：
```json
{"type": "done", "session_id": 7, "stats": {"count": 20, "errors": 0, "ttft": {"min": 200, "avg": 350, "p50": 320, "p95": 580, "max": 720}, "total": {...}, "tps": {...}}}
```

### 历史记录
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/history/ | 会话列表，支持 `?type=` `?status=` `?skip=` `?limit=` |
| GET | /api/history/{id} | 会话详情 + 所有结果（含 `test_case_name`） |
| DELETE | /api/history/{id} | 删除会话及其所有结果 |
| GET | /api/history/{id}/export.csv | 导出 CSV（utf-8-sig 编码，Excel 可直接打开） |
| PATCH | /api/history/results/{id}/score | 设置结果评分（1-5），body: `{"score": 4}` |

---

## 协议适配器

### 已实现的四种协议

| 协议 Key | 类 | URL 规则 | 认证头 |
|---|---|---|---|
| `openai_cc` | OpenAICCAdapter | `{base_url}/chat/completions` | `Authorization: Bearer {key}` |
| `anthropic` | AnthropicNativeAdapter | `{base_url}/messages` | `x-api-key: {key}` + `anthropic-version: 2023-06-01` |
| `gemini` | GeminiNativeAdapter | `{base_url}/models/{model}:generateContent` | `x-goog-api-key: {key}` |
| `openai_resp` | OpenAIResponsesAdapter | `{base_url}/responses` | `Authorization: Bearer {key}` |

> **注意**：`base_url` 已含 `/v1`（如 `https://api.openai.com/v1`），适配器内部只追加路径后缀，不再加 `/v1`。

> Gemini 和 OpenAI Responses 适配器适用于对接官方原生 API，通过 API 代理（`openai_cc` 协议）使用 Gemini 模型时应选 `openai_cc`。

### 扩展方法
继承 `BaseAdapter`，实现 `run()` 和 `stream()` 两个方法，然后在 `routers/run.py` 的 `ADAPTERS` 字典中注册：
```python
ADAPTERS = {
    "openai_cc": OpenAICCAdapter(),
    "anthropic": AnthropicNativeAdapter(),
    "gemini": GeminiNativeAdapter(),
    "openai_resp": OpenAIResponsesAdapter(),
    "my_protocol": MyAdapter(),   # 新增
}
```

---

## 前端页面说明

| 路由 | 页面 | 主要功能 |
|------|------|----------|
| `/chat` | 对话测试 | 流式/非流式对话，顶部可加载参数预设，支持保存为测试用例 |
| `/test-cases` | 测试用例 | CRUD、单条运行、勾选后批量运行（含期望匹配）、JSON 导入/导出 |
| `/compare` | 多模型对比 | 同一 prompt 发往多个 endpoint/model，并排展示结果，自动存历史 |
| `/perf` | 性能压测 | 配置 N 次请求 + 并发数，实时进度条 + P95/均值统计，自动存历史 |
| `/history` | 历史记录 | 按类型/状态筛选，查看详情、手动评分（1-5 星）、重跑、CSV 导出 |
| `/presets` | 参数预设 | 管理常用配置（endpoint + model + system prompt + 参数），可在 Chat 页一键加载 |
| `/settings` | 连接配置 | Endpoint CRUD（名称、协议、Base URL、API Key、代理） |

### ModelSelect 组件
`src/components/ModelSelect/` — 带刷新按钮的 AutoComplete，绑定 `endpointId` 后自动调 `/api/endpoints/{id}/models` 拉取可用模型列表，支持手动输入。用于 Chat、Compare、Perf、Presets、TestCases 等页面的 Model 输入框。

---

## 注意事项

- **Python 3.14**：pydantic-core 需较新版本才支持，`requirements.txt` 全部用 `>=` 不锁版本
- **端口**：后端历次因进程残留从 8003 累积到 8006，当前固定使用 **8006**
- **SSE 跨域**：前端 `streamSingle` 和 `startPerfTest` 使用原生 `fetch`（非 axios），需确保后端 CORS 允许 `http://localhost:5173`
- **SQLite 并发**：压测高并发场景下 SQLite 写入可能产生锁竞争，当前每条结果独立 commit 缓解，大规模压测建议降低并发数

---

## 已完成功能

- [x] Phase 1：项目脚手架 + 数据库（5 张表）+ Endpoint CRUD
- [x] Phase 2：OpenAI CC 适配器 + 单条测试（流式/非流式）+ Chat 页面 + Settings 页面
- [x] Phase 3：Anthropic / Gemini / OpenAI Responses 三个适配器
- [x] Phase 4：测试用例 CRUD + 单条运行 + Chat 页"保存为用例"
- [x] Phase 5：多模型对比（asyncio.gather 并发，结果存历史）
- [x] Phase 6：性能压测（Semaphore 控并发，SSE 实时推送，统计 min/avg/p50/p95/max，结果存历史）
- [x] Phase 7：历史记录（分页列表 + 详情 + CSV 导出 + 按类型/状态筛选）
- [x] 批量测试（从测试用例库勾选，SSE 进度，期望匹配，结果存历史）
- [x] 参数预设（CRUD + Chat 页一键加载）
- [x] ModelSelect 组件（按 Endpoint 拉取模型列表，全平台复用）
- [x] 测试用例 JSON 导入/导出
- [x] 历史结果手动评分（1-5 星，实时保存）
- [x] 历史结果重跑（选 Endpoint/Model，复用原始消息，结果展示）
- [x] 历史详情显示关联用例名
