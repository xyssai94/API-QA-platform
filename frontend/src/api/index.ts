import axios from 'axios'
import type {
  Endpoint, RunParams, Message, RunResult,
  CompareResult, PerfResultItem, PerfStats,
  HistorySession, HistorySessionDetail, BatchResultItem, Preset,
} from '../types'
import type { TestCase } from '../types/testCase'

const BASE = 'http://localhost:8006/api'
const http = axios.create({ baseURL: BASE })

// Endpoints
export const listEndpoints = () =>
  http.get<Endpoint[]>('/endpoints/').then(r => r.data)

export const createEndpoint = (data: Omit<Endpoint, 'id' | 'created_at'>) =>
  http.post<Endpoint>('/endpoints/', data).then(r => r.data)

export const updateEndpoint = (id: number, data: Partial<Endpoint>) =>
  http.patch<Endpoint>(`/endpoints/${id}`, data).then(r => r.data)

export const deleteEndpoint = (id: number) =>
  http.delete(`/endpoints/${id}`)

// Run
export const runSingle = (payload: {
  endpoint_id: number
  model: string
  messages: Message[]
  system_prompt?: string
  params?: RunParams
}) => http.post<RunResult>('/run/single', { ...payload, stream: false }).then(r => r.data)

export const streamSingle = (payload: {
  endpoint_id: number
  model: string
  messages: Message[]
  system_prompt?: string
  params?: RunParams
  onChunk: (text: string, ttft?: number) => void
  onDone: (usage: RunResult['usage'], totalMs: number) => void
  onError: (err: string) => void
}): (() => void) => {
  const controller = new AbortController()

  fetch(`${BASE}/run/single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint_id: payload.endpoint_id,
      model: payload.model,
      messages: payload.messages,
      system_prompt: payload.system_prompt,
      params: payload.params,
      stream: true,
    }),
    signal: controller.signal,
  }).then(async res => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        try {
          const obj = JSON.parse(raw)
          if (obj.type === 'content') payload.onChunk(obj.content, obj.ttft_ms ?? undefined)
          else if (obj.type === 'done') payload.onDone(obj.usage, obj.total_ms)
          else if (obj.type === 'error') payload.onError(obj.error)
        } catch { /* ignore */ }
      }
    }
  }).catch(e => {
    if (e.name !== 'AbortError') payload.onError(String(e))
  })

  return () => controller.abort()
}

// Test Cases
export const listTestCases = (params?: { group?: string; tag?: string }) =>
  http.get<TestCase[]>('/test-cases/', { params }).then(r => r.data)

export const createTestCase = (data: Omit<TestCase, 'id' | 'created_at'>) =>
  http.post<TestCase>('/test-cases/', data).then(r => r.data)

export const getTestCase = (id: number) =>
  http.get<TestCase>(`/test-cases/${id}`).then(r => r.data)

export const updateTestCase = (id: number, data: Partial<TestCase>) =>
  http.patch<TestCase>(`/test-cases/${id}`, data).then(r => r.data)

export const deleteTestCase = (id: number) =>
  http.delete(`/test-cases/${id}`)

// Compare
export const runCompare = (payload: {
  messages: Message[]
  system_prompt?: string
  params?: Pick<RunParams, 'temperature' | 'max_tokens'>
  configs: { endpoint_id: number; model: string }[]
}) => http.post<{ session_id: number; results: CompareResult[] }>('/run/compare', payload).then(r => r.data)

// Perf
export const startPerfTest = (payload: {
  endpoint_id: number
  model: string
  messages: Message[]
  system_prompt?: string
  params?: Pick<RunParams, 'temperature' | 'max_tokens'>
  n: number
  concurrency: number
  onProgress: (completed: number, total: number, result: PerfResultItem) => void
  onDone: (stats: PerfStats, sessionId: number) => void
  onError: (err: string) => void
}): (() => void) => {
  const controller = new AbortController()

  fetch(`${BASE}/run/perf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint_id: payload.endpoint_id,
      model: payload.model,
      messages: payload.messages,
      system_prompt: payload.system_prompt,
      params: payload.params,
      n: payload.n,
      concurrency: payload.concurrency,
    }),
    signal: controller.signal,
  }).then(async res => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        try {
          const obj = JSON.parse(raw)
          if (obj.type === 'progress') payload.onProgress(obj.completed, obj.total, obj.result)
          else if (obj.type === 'done') payload.onDone(obj.stats, obj.session_id)
          else if (obj.type === 'error') payload.onError(obj.error)
        } catch { /* ignore */ }
      }
    }
  }).catch(e => {
    if (e.name !== 'AbortError') payload.onError(String(e))
  })

  return () => controller.abort()
}

// History
export const listHistory = (params?: { skip?: number; limit?: number; type?: string; status?: string }) =>
  http.get<{ total: number; items: HistorySession[] }>('/history/', { params }).then(r => r.data)

export const getHistorySession = (id: number) =>
  http.get<HistorySessionDetail>(`/history/${id}`).then(r => r.data)

export const deleteHistorySession = (id: number) =>
  http.delete(`/history/${id}`)

export const exportHistoryCsv = (id: number) => {
  window.open(`${BASE}/history/${id}/export.csv`)
}

// Presets
export const listPresets = () =>
  http.get<Preset[]>('/presets/').then(r => r.data)

export const createPreset = (data: Omit<Preset, 'id' | 'created_at'>) =>
  http.post<Preset>('/presets/', data).then(r => r.data)

export const updatePreset = (id: number, data: Partial<Omit<Preset, 'id' | 'created_at'>>) =>
  http.patch<Preset>(`/presets/${id}`, data).then(r => r.data)

export const deletePreset = (id: number) =>
  http.delete(`/presets/${id}`)

// Models list
export const fetchEndpointModels = (endpointId: number) =>
  http.get<{ models: string[] }>(`/endpoints/${endpointId}/models`).then(r => r.data.models)

// Test case import/export
export const exportTestCasesJson = () => {
  window.open(`${BASE}/test-cases/export/json`)
}

export const importTestCasesJson = (cases: unknown[], skipDuplicates = true) =>
  http.post<{ created: number; skipped: number }>('/test-cases/import/json', {
    cases,
    skip_duplicates: skipDuplicates,
  }).then(r => r.data)

// History score
export const setResultScore = (resultId: number, score: number) =>
  http.patch(`/history/results/${resultId}/score`, { score })

// Batch
export const startBatchTest = (payload: {
  endpoint_id: number
  model: string
  test_case_ids: number[]
  params?: Pick<RunParams, 'temperature' | 'max_tokens'>
  onProgress: (completed: number, total: number, result: BatchResultItem) => void
  onDone: (sessionId: number, total: number, errors: number) => void
  onError: (err: string) => void
}): (() => void) => {
  const controller = new AbortController()

  fetch(`${BASE}/run/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint_id: payload.endpoint_id,
      model: payload.model,
      test_case_ids: payload.test_case_ids,
      params: payload.params,
    }),
    signal: controller.signal,
  }).then(async res => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        try {
          const obj = JSON.parse(raw)
          if (obj.type === 'progress') payload.onProgress(obj.completed, obj.total, obj.result)
          else if (obj.type === 'done') payload.onDone(obj.session_id, obj.total, obj.errors)
          else if (obj.type === 'error') payload.onError(obj.error)
        } catch { /* ignore */ }
      }
    }
  }).catch(e => {
    if (e.name !== 'AbortError') payload.onError(String(e))
  })

  return () => controller.abort()
}
