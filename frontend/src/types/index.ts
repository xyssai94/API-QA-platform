export interface Endpoint {
  id: number
  name: string
  protocol: string
  base_url: string
  api_key?: string
  extra_headers?: Record<string, string>
  proxy?: string
  created_at?: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface RunParams {
  temperature?: number
  max_tokens?: number
  top_p?: number
  stop?: string[]
  extra?: Record<string, unknown>
}

export interface UsageStats {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  reasoning_tokens?: number
  tokens_per_second?: number
}

export interface RunResult {
  session_id: number
  response: string
  usage: UsageStats
  ttft_ms?: number
  total_ms?: number
}

export interface CompareResult {
  index: number
  endpoint_id: number
  endpoint_name: string
  model: string
  response: string
  thinking: string
  usage: UsageStats
  ttft_ms?: number
  total_ms?: number
  error?: string
}

export interface PerfResultItem {
  index: number
  ttft_ms?: number
  total_ms?: number
  input_tokens?: number
  output_tokens?: number
  tokens_per_second?: number
  error?: string
}

export interface StatGroup {
  min: number
  max: number
  avg: number
  p50: number
  p95: number
}

export interface PerfStats {
  count: number
  errors: number
  ttft?: StatGroup
  total?: StatGroup
  tps?: StatGroup
}

export interface HistorySession {
  id: number
  type: string
  name?: string
  status: string
  result_count: number
  created_at?: string
}

export interface HistoryResult {
  id: number
  test_case_id?: number
  test_case_name?: string
  request_snapshot?: { model?: string; messages?: unknown[]; system_prompt?: string; endpoint_name?: string }
  response_text?: string
  ttft_ms?: number
  total_ms?: number
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  tokens_per_second?: number
  score?: number
  status: string
  error_msg?: string
  created_at?: string
}

export interface HistorySessionDetail extends HistorySession {
  results: HistoryResult[]
}

export interface BatchResultItem {
  test_case_id: number
  test_case_name: string
  response?: string
  ttft_ms?: number
  total_ms?: number
  output_tokens?: number
  tokens_per_second?: number
  matched?: boolean | null
  error?: string
}

export interface Preset {
  id: number
  name: string
  endpoint_id: number
  model: string
  params: { temperature?: number; max_tokens?: number; [key: string]: unknown }
  system_prompt?: string
  created_at?: string
}
