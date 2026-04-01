import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, Plus, FileText, Upload, Folder, Shield, 
  Filter, Download, MoreVertical, LayoutGrid, 
  List, Tag, ChevronRight, Inbox, Briefcase, 
  Users, HardDrive, Settings, Star, Clock, 
  Zap, Info, X
} from 'lucide-react'
import { documentsAPI } from '@/services/api'
import { useUIStore } from '@/stores/authStore'
import DocumentCard from '@/components/modules/documents/DocumentCard'
import DocumentInspector from '@/components/modules/documents/DocumentInspector'
import Pagination from '@/components/common/Pagination'

export default function DocumentsPage() {
  const [view, setView] = useState('grid') // grid or list
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [activeWorkspace, setActiveWorkspace] = useState('all')
  const [activeTags, setActiveTags] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  
  const queryClient = useQueryClient()
  const openPanel = useUIStore((s) => s.openSidePanel)

  // Fetch Documents
  const { data: docsData, isLoading: isLoadingDocs } = useQuery({
    queryKey: ['documents', { search, workspace: activeWorkspace, tags: activeTags, page }],
    queryFn: () => documentsAPI.list({ 
      search, 
      workspace: activeWorkspace === 'all' ? undefined : activeWorkspace,
      tags: activeTags.length > 0 ? activeTags.join(',') : undefined,
      page 
    }),
  })

  // Fetch Workspaces
  const { data: workspacesData } = useQuery({
    queryKey: ['document-workspaces'],
    queryFn: () => documentsAPI.workspaces.list(),
  })

  // Fetch Tags
  const { data: tagsData } = useQuery({
    queryKey: ['document-tags'],
    queryFn: () => documentsAPI.tags.list(),
  })

  const documents = docsData?.data?.results || []
  const workspaces = workspacesData?.data || []
  const tags = tagsData?.data || []
  
  const selectedDoc = documents.find(d => d.id === selectedDocId)

  const toggleTag = (tagId) => {
    setActiveTags(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    )
    setPage(1)
  }

  return (
    <div className="flex h-full overflow-hidden bg-dark-950 font-body">
      {/* 1. Left Sidebar: Navigation & Filters */}
      <aside className="w-64 border-r border-white/5 flex flex-col bg-dark-900/30">
        <div className="p-6">
          <button 
            className="btn-primary w-full h-11 gap-2 shadow-gold"
            onClick={() => openPanel('document-upload')}
          >
            <Upload size={16} />
            <span>Upload File</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar">
          {/* Workspaces Section */}
          <div className="space-y-1">
            <h3 className="px-2 text-[10px] font-bold text-dark-500 uppercase tracking-[0.2em] mb-3">Workspaces</h3>
            <button 
              onClick={() => setActiveWorkspace('all')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all
                ${activeWorkspace === 'all' ? 'bg-primary/10 text-primary font-semibold' : 'text-dark-400 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex items-center gap-3">
                <Inbox size={18} />
                <span>All Documents</span>
              </div>
            </button>
            {workspaces.map(ws => (
              <button 
                key={ws.id}
                onClick={() => setActiveWorkspace(ws.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all
                  ${activeWorkspace === ws.id ? 'bg-primary/10 text-primary font-semibold border border-primary/20' : 'text-dark-400 hover:bg-white/5 hover:text-white'}`}
              >
                <div className="flex items-center gap-3">
                  <Folder size={18} />
                  <span>{ws.name}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Smart Filters */}
          <div className="space-y-1">
            <h3 className="px-2 text-[10px] font-bold text-dark-500 uppercase tracking-[0.2em] mb-3">Smart Filters</h3>
             <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-dark-400 hover:bg-white/5 hover:text-white transition-all">
                <Star size={18} />
                <span>Starred</span>
             </button>
             <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-dark-400 hover:bg-white/5 hover:text-white transition-all">
                <Clock size={18} />
                <span>Recent Activities</span>
             </button>
             <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-dark-400 hover:bg-white/5 hover:text-white transition-all">
                <Zap size={18} />
                <span>Needs Action</span>
             </button>
          </div>

          {/* Tags Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.2em]">Tags</h3>
              <button className="text-primary hover:text-primary-light"><Plus size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-2 px-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`
                    px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1.5
                    ${activeTags.includes(tag.id)
                      ? 'bg-primary/20 border-primary text-white'
                      : 'bg-dark-800 border-white/5 text-dark-400 hover:border-white/20'}
                  `}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Storage usage */}
        <div className="p-6 border-t border-white/5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-dark-500">
              <span>Cloud Storage</span>
              <span className="text-white">4.2 / 10 GB</span>
            </div>
            <div className="h-1.5 w-full bg-dark-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary shadow-gold w-[42%]" />
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Center: Document Workspace / Kanban */}
      <main className="flex-1 flex flex-col bg-dark-950 overflow-hidden relative">
        {/* Top toolbar */}
        <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between bg-dark-900/20 backdrop-blur-sm z-20">
          <div className="flex items-center gap-6">
             <div className="relative group">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 group-hover:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search in vault..." 
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  className="bg-dark-800/50 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm w-80 
                            focus:border-primary/50 focus:ring-0 focus:bg-dark-800 transition-all"
                />
             </div>
             <div className="flex items-center gap-1 bg-dark-800/50 p-1 rounded-xl border border-white/5">
                <button 
                  onClick={() => setView('grid')}
                  className={`p-1.5 rounded-lg transition-all ${view === 'grid' ? 'bg-dark-700 text-white shadow-lg' : 'text-dark-500 hover:text-white'}`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button 
                  onClick={() => setView('list')}
                  className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-dark-700 text-white shadow-lg' : 'text-dark-500 hover:text-white'}`}
                >
                  <List size={16} />
                </button>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="text-[10px] text-dark-500 font-bold uppercase tracking-widest mr-2 flex items-center gap-2">
                <Info size={12} />
                Select a document to inspect
             </div>
             <button className="btn-secondary h-10 px-4 rounded-xl gap-2 font-display">
                <Settings size={16} />
                Settings
             </button>
          </div>
        </header>

        {/* Grid content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
           {isLoadingDocs ? (
             <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Initializing Workspace...</p>
             </div>
           ) : documents.length > 0 ? (
             <motion.div 
               layout
               className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
             >
                <AnimatePresence mode="popLayout">
                  {documents.map(doc => (
                    <DocumentCard 
                      key={doc.id}
                      doc={doc}
                      isSelected={selectedDocId === doc.id}
                      onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                    />
                  ))}
                </AnimatePresence>
             </motion.div>
           ) : (
             <div className="flex flex-col items-center justify-center h-full text-center py-20 px-4">
                <div className="w-20 h-20 rounded-full bg-dark-900 border border-white/5 flex items-center justify-center text-dark-600 mb-6">
                   <HardDrive size={32} />
                </div>
                <h2 className="text-xl font-display text-white mb-2">No documents found</h2>
                <p className="text-dark-400 text-sm max-w-sm mx-auto">
                   Try adjusting your filters or upload a new file to this workspace to get started.
                </p>
                <button 
                   onClick={() => setSearch('')}
                   className="mt-6 text-primary hover:underline font-bold uppercase text-[10px] tracking-widest"
                >
                   Clear all filters
                </button>
             </div>
           )}

           <div className="mt-8 pt-8 border-t border-white/5 flex justify-center">
              <Pagination 
                currentPage={page}
                totalPages={docsData?.data?.total_pages}
                totalCount={docsData?.data?.count}
                onPageChange={setPage}
              />
           </div>
        </div>
      </main>

      {/* 3. Right Panel: Inspector */}
      <AnimatePresence>
        {selectedDocId && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="flex-shrink-0 z-30 overflow-hidden"
          >
            <DocumentInspector 
              doc={selectedDoc} 
              onClose={() => setSelectedDocId(null)}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
