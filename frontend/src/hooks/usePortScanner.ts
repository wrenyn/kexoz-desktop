import { useEffect, useState } from 'react'

const COMMON_PORTS = [
  { port: 3000, label: 'React / Next.js' },
  { port: 4000, label: 'Gatsby / GraphQL' },
  { port: 4321, label: 'Astro' },
  { port: 5173, label: 'Vite' },
  { port: 5000, label: 'Flask / Express' },
  { port: 8000, label: 'Django / FastAPI' },
  { port: 8080, label: 'Spring / Go' },
  { port: 8888, label: 'Jupyter' },
  { port: 9000, label: 'PHP / SonarQube' },
]

export type DetectedPort = { port: number; label: string; docker?: boolean }

/** Ports with something listening: every local server (including Docker) when the OS allows it, else common dev ports. */
export function usePortScanner(enabled: boolean): DetectedPort[] {
  const [detected, setDetected] = useState<DetectedPort[]>([])

  useEffect(() => {
    if (!enabled || !window.kexoz?.checkPort) return
    let cancelled = false
    const scan = async () => {
      const results = new Map<number, DetectedPort>()
      const listed = await window.kexoz?.listListeningPorts?.().catch(() => []) ?? []
      for (const item of listed) results.set(item.port, { port: item.port, label: item.label, docker: item.source === 'docker' })
      await Promise.all(COMMON_PORTS.map(async ({ port, label }) => {
        if (results.has(port)) return
        const listening = await window.kexoz!.checkPort(port).catch(() => false)
        if (listening) results.set(port, { port, label })
      }))
      if (!cancelled) setDetected([...results.values()].sort((a, b) => a.port - b.port))
    }
    void scan()
    const id = window.setInterval(() => void scan(), 8000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return detected
}
