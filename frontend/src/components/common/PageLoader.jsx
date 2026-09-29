// Stohill Properties - route-level loading state.
// Shown while a lazily-loaded page chunk downloads. Occupies the content area
// only, so the sidebar and header stay interactive.
import React from 'react'

export default function PageLoader() {
  return (
    <div role="status" aria-live="polite" className="flex h-[60vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
        <span className="text-xs uppercase tracking-[0.2em] text-dark-500">Loading module</span>
      </div>
    </div>
  )
}
