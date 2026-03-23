import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

/**
 * Pagination Component
 * 
 * @param {number} currentPage - Currently active page
 * @param {number} totalPages - Total number of pages
 * @param {function} onPageChange - Callback when a page is selected
 * @param {number} totalCount - Total number of items
 */
export default function Pagination({ currentPage, totalPages, onPageChange, totalCount }) {
  if (!totalPages || totalPages <= 1) return null

  // Generate page numbers to show (e.g., 1, 2, 3, ..., 10)
  const getPageNumbers = () => {
    const pages = []
    const showMax = 5
    
    if (totalPages <= showMax) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      // Logic for ellipsis
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
      }
    }
    return pages
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/5 mt-6">
      <div className="text-xs text-dark-400">
        Showing <span className="text-white font-medium">Page {currentPage}</span> of <span className="text-white font-medium">{totalPages}</span>
        {totalCount !== undefined && (
          <span className="ml-1">· <span className="text-white font-medium">{totalCount}</span> total results</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 font-mono">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
          className="p-2 rounded-lg bg-white/2 border border-white/5 text-dark-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
          title="First Page"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-2 rounded-lg bg-white/2 border border-white/5 text-dark-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
          title="Previous Page"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex items-center gap-1 px-1">
          {getPageNumbers().map((page, idx) => (
            page === '...' ? (
              <span key={`dots-${idx}`} className="px-2 text-dark-500 text-xs">...</span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                  currentPage === page
                    ? 'bg-primary text-dark-900 shadow-[0_0_10px_rgba(212,175,55,0.3)]'
                    : 'bg-white/2 border border-white/5 text-dark-400 hover:text-white hover:border-white/20 hover:bg-white/5'
                }`}
              >
                {page}
              </button>
            )
          ))}
        </div>

        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-2 rounded-lg bg-white/2 border border-white/5 text-dark-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
          title="Next Page"
        >
          <ChevronRight size={16} />
        </button>
        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          className="p-2 rounded-lg bg-white/2 border border-white/5 text-dark-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
          title="Last Page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  )
}
