import React from 'react'
import { useAuthStore } from '@/stores/authStore'

/**
 * ActionGuard: Hides elements when Executive Mode is OFF.
 * Used for Create, Edit, Delete, and Bulk action buttons.
 */
export default function ActionGuard({ children }) {
  const canEdit = useAuthStore((s) => s.canEdit())

  if (!canEdit) return null

  return <>{children}</>
}
