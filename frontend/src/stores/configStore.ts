import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Endpoint } from '../types'

interface ConfigStore {
  endpoints: Endpoint[]
  setEndpoints: (eps: Endpoint[]) => void
  addEndpoint: (ep: Endpoint) => void
  updateEndpoint: (ep: Endpoint) => void
  removeEndpoint: (id: number) => void

  selectedEndpointId: number | null
  setSelectedEndpointId: (id: number | null) => void

  model: string
  setModel: (m: string) => void
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      endpoints: [],
      setEndpoints: (eps) => set({ endpoints: eps }),
      addEndpoint: (ep) => set(s => ({ endpoints: [...s.endpoints, ep] })),
      updateEndpoint: (ep) => set(s => ({ endpoints: s.endpoints.map(e => e.id === ep.id ? ep : e) })),
      removeEndpoint: (id) => set(s => ({ endpoints: s.endpoints.filter(e => e.id !== id) })),

      selectedEndpointId: null,
      setSelectedEndpointId: (id) => set({ selectedEndpointId: id }),

      model: 'claude-sonnet-4-5-20250929',
      setModel: (m) => set({ model: m }),
    }),
    { name: 'qa-config' }
  )
)
