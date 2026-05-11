import type { Message } from './index'

export interface TestCase {
  id: number
  group_name?: string
  tags?: string[]
  name: string
  messages: Message[]
  attachments?: Record<string, unknown>
  expected?: string
  created_at?: string
}
