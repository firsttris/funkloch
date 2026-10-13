// Pan and zoom for the network map: drag to move, wheel or pinch to zoom, buttons to zoom and fit.
// The map fits its frame until the viewer moves it; a drag never counts as a click on a device.
import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'

type View = { k: number; x: number; y: number }

const MIN = 0.3
const MAX = 2
/** Room the controls take at the top of the frame */
const TOP = 56

export const usePanZoom = (size: { width: number; height: number }) => {
  const frame = useRef<HTMLElement>(null)
  const [view, setView] = useState<View | null>(null)
  const [gliding, setGliding] = useState(false)
  const [dragging, setDragging] = useState(false)
  const touched = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<number | null>(null)
  const moved = useRef(0)

  const fitted = useCallback((): View | null => {
    const el = frame.current
    if (!el) return null
    const w = el.clientWidth
    const h = el.clientHeight
    const k = Math.min(1, (w - 32) / size.width, (h - TOP - 16) / size.height)
    return { k, x: (w - size.width * k) / 2, y: TOP + (h - TOP - size.height * k) / 2 }
  }, [size.width, size.height])

  // Fit on the first render and whenever the frame or the map changes size, until moved by hand
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const refit = () => {
      if (!touched.current) setView(fitted())
    }
    refit()
    const observer = new ResizeObserver(refit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [fitted])

  const zoomAt = useCallback((factor: number, cx: number, cy: number, glide: boolean) => {
    touched.current = true
    setGliding(glide)
    setView((v) => {
      if (!v) return v
      const k = Math.min(MAX, Math.max(MIN, v.k * factor))
      const f = k / v.k
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
    })
  }, [])

  // The wheel needs a listener that may prevent scrolling the page
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const r = el.getBoundingClientRect()
      if (event.ctrlKey || (!event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX))) {
        zoomAt(
          Math.exp(-event.deltaY * 0.0015),
          event.clientX - r.left,
          event.clientY - r.top,
          false,
        )
      } else {
        touched.current = true
        setGliding(false)
        setView((v) => (v ? { ...v, x: v.x - (event.deltaX || event.deltaY) } : v))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('[data-topo-control]')) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    pinch.current = null
    moved.current = 0
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const prev = pointers.current.get(event.pointerId)
    if (!prev) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      const dx = event.clientX - prev.x
      const dy = event.clientY - prev.y
      moved.current += Math.abs(dx) + Math.abs(dy)
      if (moved.current <= 4) return
      // Only a real drag takes the pointer, so a click still reaches the device under it
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }
      touched.current = true
      setGliding(false)
      setView((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v))
      return
    }
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinch.current) {
      const r = event.currentTarget.getBoundingClientRect()
      zoomAt(distance / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, false)
    }
    pinch.current = distance
  }
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId)
    pinch.current = null
    if (pointers.current.size === 0) setDragging(false)
  }
  /** Swallows the click that ends a drag */
  const onClickCapture = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (moved.current > 4) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const centre = () => {
    const el = frame.current
    return el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 }
  }
  return {
    frame,
    view,
    gliding,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
    zoomIn: () => zoomAt(1.25, centre().x, centre().y, true),
    zoomOut: () => zoomAt(0.8, centre().x, centre().y, true),
    fit: () => {
      touched.current = false
      setGliding(true)
      setView(fitted())
    },
  }
}
