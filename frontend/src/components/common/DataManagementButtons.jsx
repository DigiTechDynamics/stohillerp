import React, { useRef } from 'react'
import { Download, Upload, FileSpreadsheet, ChevronDown, Loader2 } from 'lucide-react'
import { dataManagementAPI } from '@/services/api'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'

/**
 * Reusable component for Data Management (Import, Export, Template)
 * @param {string} module - The module name (properties, leases, crm, coa, assets, employees, statements)
 * @param {object} filters - Current filters/sort applied to the data
 * @param {function} onImportSuccess - Callback after successful import
 */
export default function DataManagementButtons({ module, filters, onImportSuccess }) {
  const [isExporting, setIsExporting] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)
  const [isDownloadingTemplate, setIsDownloadingTemplate] = React.useState(false)
  const [showDropdown, setShowDropdown] = React.useState(false)
  const fileInputRef = useRef(null)
  const dropdownRef = useRef(null)
  const canEdit = useAuthStore((s) => s.canEdit())

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true)
    try {
      const response = await dataManagementAPI.getTemplate(module)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${module}_template.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Template downloaded successfully')
    } catch (error) {
      console.error('Template download error:', error)
      toast.error('Failed to download template')
    } finally {
      setIsDownloadingTemplate(false)
      setShowDropdown(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await dataManagementAPI.exportData(module, filters)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${module}_export_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Data exported successfully')
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export data')
    } finally {
      setIsExporting(false)
      setShowDropdown(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
    setShowDropdown(false)
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const response = await dataManagementAPI.importData(module, file)
      toast.success(response.data.message || 'Import successful')
      if (onImportSuccess) onImportSuccess()
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Import failed'
      console.error('Import error:', error)
      toast.error(errorMsg)
    } finally {
      setIsImporting(false)
      event.target.value = '' // Clear input
    }
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        className="btn-secondary flex items-center gap-2"
        disabled={isExporting || isImporting || isDownloadingTemplate}
      >
        {(isExporting || isImporting || isDownloadingTemplate) ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <FileSpreadsheet size={16} />
        )}
        <span>Data Management</span>
        <ChevronDown size={14} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-dark-800 border border-white/5 shadow-2xl z-50 overflow-hidden divide-y divide-white/5">
          <div className="py-1">
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-200 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Download size={16} className="text-primary" />
              <span>Export {module}</span>
            </button>
            {canEdit && (
              <button
                onClick={handleImportClick}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-200 hover:bg-white/5 hover:text-white transition-colors"
              >
                <Upload size={16} className="text-emerald-400" />
                <span>Import {module}</span>
              </button>
            )}
          </div>
          {canEdit && (
            <div className="py-1">
              <button
                onClick={handleDownloadTemplate}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-400 hover:bg-white/5 hover:text-dark-200 transition-colors"
              >
                <FileSpreadsheet size={16} />
                <span>Download Template</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        className="hidden"
      />
    </div>
  )
}
