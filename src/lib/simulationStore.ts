import { create } from 'zustand'

interface SimulationState {
  simulationActive: boolean
  nextUpdate: number
  lastDecrement: Date | null
  setSimulationActive: (v: boolean) => void
  setNextUpdate: (n: number) => void
  setLastDecrement: (d: Date | null) => void
  toggleSimulation: () => void
}

export const useSimulationStore = create<SimulationState>((set: any) => ({
  simulationActive: true,
  nextUpdate: 30,
  lastDecrement: null,
  setSimulationActive: (v: boolean) => set({ simulationActive: v }),
  setNextUpdate: (n: number) => set({ nextUpdate: n }),
  setLastDecrement: (d: Date | null) => set({ lastDecrement: d }),
  toggleSimulation: () => set((s: any) => ({ simulationActive: !s.simulationActive })),
}))

export default useSimulationStore
