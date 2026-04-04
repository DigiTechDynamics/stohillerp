import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  Clock, MapPin, User, Search, Filter, Loader2,
  Phone, Mail, MessageSquare, Home, Plus
} from 'lucide-react'
import { crmAPI } from '@/services/api'
import { formatDate } from '@/utils/format'
import { useUIStore } from '@/stores/authStore'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CrmCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const openPanel = useUIStore(s => s.openSidePanel)

  // Calculate date range for current month view (including padding days)
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
  
  // Padding for the 42-cell grid
  const startDay = startOfMonth.getDay()
  const startDate = new Date(startOfMonth)
  startDate.setDate(startDate.getDate() - startDay)
  
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 41)

  const { data: activitiesRes, isLoading } = useQuery({
    queryKey: ['crm-calendar-activities', currentDate.getMonth(), currentDate.getFullYear()],
    queryFn: () => crmAPI.activities.list({ 
      due_date__gte: startDate.toISOString().split('T')[0],
      due_date__lte: endDate.toISOString().split('T')[0],
      page_size: 200,
    })
  })

  const activities = activitiesRes?.data?.results || []

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  const daysArr = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })

  const getActivitiesForDay = (date) => {
    return activities.filter(act => {
      const actDate = new Date(act.due_date)
      return actDate.getDate() === date.getDate() &&
             actDate.getMonth() === date.getMonth() &&
             actDate.getFullYear() === date.getFullYear()
    })
  }

  const handleDayClick = (date) => {
    const localDateStr = date.toISOString().split('T')[0]
    openPanel('activity-form', { 
      date: localDateStr,
      status: 'planned'
    })
  }

  const handleActivityClick = (act) => {
    openPanel('activity-form', { activity: act })
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case 'call': return <Phone size={10} />
      case 'email': return <Mail size={10} />
      case 'meeting': return <User size={10} />
      case 'viewing': return <Home size={10} />
      default: return <MessageSquare size={10} />
    }
  }

  const getActivityColor = (type) => {
    switch (type) {
      case 'viewing': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'meeting': return 'bg-primary/10 text-primary border-primary/20'
      case 'call': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      case 'email': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      default: return 'bg-dark-700 text-dark-300 border-white/5'
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-hidden border border-white/5 rounded-3xl shadow-2xl">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5 bg-dark-800/40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/5 shadow-inner">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest opacity-60">
                {activities.length} Activities Scheduled
              </p>
            </div>
          </div>

          <div className="flex items-center bg-dark-700/50 rounded-xl p-1 border border-white/5">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white/5 rounded-lg text-dark-400 hover:text-white transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-dark-300 hover:text-primary transition-all"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white/5 rounded-lg text-dark-400 hover:text-white transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input 
                type="text" 
                placeholder="Find event..." 
                className="bg-dark-700/50 border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:border-primary/30 outline-none w-48 transition-all"
              />
           </div>
           <button className="btn-secondary h-9 px-4 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
             <Filter size={14} /> Filter
           </button>
           <button 
             onClick={() => openPanel('activity-form')}
             className="btn-primary h-9 px-4 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20"
           >
             <Plus size={14} /> Schedule
           </button>
        </div>
      </div>

      {/* Days Grid Header */}
      <div className="grid grid-cols-7 bg-dark-800/20 border-b border-white/5">
        {DAYS.map(day => (
          <div key={day} className="py-3 text-center text-[10px] font-bold text-dark-500 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-7 h-full min-h-[600px]">
          {daysArr.map((date, i) => {
            const dayActs = getActivitiesForDay(date)
            const isToday = date && date.toDateString() === new Date().toDateString()
            const isEmpty = !date

            return (
              <div 
                key={i} 
                className={`min-h-[120px] p-2 border-r border-b border-white/5 transition-all group
                  ${isEmpty ? 'bg-dark-900/50' : 'hover:bg-white/[0.02]'}
                  ${isToday ? 'bg-primary/[0.02]' : ''}
                `}
              >
                {date && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-all
                        ${isToday ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-dark-400 group-hover:text-white'}
                      `}>
                        {date.getDate()}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDayClick(date) }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all"
                        title="Schedule Activity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <div className="space-y-1.5 overflow-hidden">
                      {dayActs.map(act => (
                        <div 
                          key={act.id}
                          onClick={(e) => { e.stopPropagation(); handleActivityClick(act) }}
                          className={`px-2 py-1 rounded-lg border text-[10px] font-medium truncate cursor-pointer transition-all hover:scale-102 active:scale-98 flex items-center gap-1.5 shadow-sm
                            ${getActivityColor(act.activity_type)}
                          `}
                        >
                          {getActivityIcon(act.activity_type)}
                          <span className="truncate">{act.subject}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
