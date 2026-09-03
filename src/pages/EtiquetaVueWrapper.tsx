import { useEffect, useRef } from 'react'
import { createApp, h } from 'vue'
import EtiquetaVue from './EtiquetaVue.vue'

export default function EtiquetaVueWrapper() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Monta o app Vue dentro do React
    const app = createApp({
      render: () => h(EtiquetaVue)
    })
    app.mount(containerRef.current)
    appRef.current = app
    return () => {
      try { app.unmount() } catch {}
    }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 'calc(100vh - 80px)' }}>
      {/* Vue será montado aqui */}
    </div>
  )
}
