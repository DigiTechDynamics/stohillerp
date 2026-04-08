import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend, LineChart, Line 
} from 'recharts'
import { 
  TrendingUp, Users, Home, DollarSign, ArrowUpRight, ArrowDownRight, 
  Calendar, Layers, Filter, Download, Zap, Target
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { analyticsAPI } from '@/services/api'
import { formatCurrency } from '@/utils/format'

const COLORS = ['#D4AF37', '#E5A645', '#C0C0C0', '#4A5568', '#2D3748']

export default function AnalyticsDashboard({ isEmbedded = false }) {
  const [timeRange, setTimeRange] = useState('current_year')

  // Queries
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['analytics-portfolio'],
    queryFn: () => analyticsAPI.portfolio().then(res => res.data)
  })

  const { data: funnel, isLoading: funnelLoading } = useQuery({
    queryKey: ['analytics-funnel'],
    queryFn: () => analyticsAPI.salesFunnel().then(res => res.data)
  })

  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ['analytics-forecast'],
    queryFn: () => analyticsAPI.forecast().then(res => res.data)
  })

  const isLoading = portfolioLoading || funnelLoading || forecastLoading

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1, 
      transition: { staggerChildren: 0.1 } 
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  }

  return (
    <div className={isEmbedded ? "space-y-8" : "p-8 space-y-8 bg-dark-950 min-h-screen"}>
      {/* Header Section */}
      {!isEmbedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light tracking-widest text-white uppercase flex items-center gap-3">
               Business <span className="text-primary font-bold">Intelligence</span>
            </h1>
            <p className="text-dark-400 text-sm mt-1">Real-time performance metrics and predictive analytics</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-dark-900/50 p-1 rounded-xl border border-white/5">
              {['current_year', 'q3', 'q4'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    timeRange === range ? 'bg-primary text-dark-900 shadow-lg' : 'text-dark-400 hover:text-white'
                  }`}
                >
                  {range.replace('_', ' ')}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 bg-dark-900 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold text-white hover:border-primary/50 transition-all">
              <Download size={14} />
              Export BI Report
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <KpiCard 
          title="Net Portfolio Yield" 
          value={`${portfolio?.overview?.net_yield || 0}%`} 
          trend="+1.2%" 
          positive={true} 
          icon={<TrendingUp className="text-primary" />} 
          subtitle="Annualized ROI"
        />
        <KpiCard 
          title="Vacancy Rate" 
          value={`${portfolio?.overview?.vacancy_rate || 0}%`} 
          trend="-0.5%" 
          positive={true} 
          icon={<Home className="text-primary" />} 
          subtitle="Portfolio Occupancy"
        />
        <KpiCard 
          title="Lead Conversion" 
          value={`${funnel?.metrics?.win_rate || 0}%`} 
          trend="+4.8%" 
          positive={true} 
          icon={<Target className="text-primary" />} 
          subtitle="Sales Performance"
        />
        <KpiCard 
          title="Coll. Rate" 
          value={`${forecast?.current_month?.collection_rate || 0}%`} 
          trend="-2.1%" 
          positive={false} 
          icon={<DollarSign className="text-primary" />} 
          subtitle="Cash flow efficiency"
        />
      </motion.div>

      {/* Main Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Yield Analysis */}
        <motion.div 
          variants={itemVariants}
          className="lg:col-span-2 bg-dark-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-medium text-white flex items-center gap-3">
              Portfolio Yield <span className="text-xs text-dark-500 uppercase tracking-widest font-bold">BY PROPERTY TYPE</span>
            </h3>
            <div className="flex items-center gap-2 text-xs text-dark-400">
              <Zap size={14} className="text-primary" />
              <span>Target: 10.5%</span>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={portfolio?.by_type || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false} />
                <XAxis dataKey="type" stroke="#718096" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#718096" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A202C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#D4AF37' }}
                />
                <Bar 
                  dataKey="yield" 
                  fill="#D4AF37" 
                  radius={[6, 6, 0, 0]} 
                  barSize={40}
                  animationBegin={200}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Sales Pipeline Funnel */}
        <motion.div 
          variants={itemVariants}
          className="bg-dark-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl"
        >
          <h3 className="text-lg font-medium text-white mb-8">Pipeline Funnel</h3>
          <div className="space-y-6">
            {funnel?.funnel?.map((item, i) => (
              <div key={item.stage} className="relative">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-dark-400 uppercase font-bold tracking-wider">{item.stage}</span>
                  <span className="text-white font-bold">{item.count}</span>
                </div>
                <div className="h-2 w-full bg-dark-900 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.count / (funnel?.metrics?.total_leads || 1)) * 100}%` }}
                    transition={{ duration: 1, delay: i * 0.1 }}
                    className="h-full bg-gradient-to-r from-primary/40 to-primary rounded-full shadow-[0_0_10px_rgba(212,175,55,0.3)]"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 p-6 bg-primary/5 rounded-2xl border border-primary/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-dark-400 text-[10px] uppercase font-bold tracking-widest">Avg. Cycle Time</p>
                <p className="text-xl font-bold text-white tracking-widest">{funnel?.metrics?.avg_close_cycle_days} DAYS</p>
              </div>
            </div>
          </div>
        </motion.div>

      </div>

      {/* Bottom Row - Projections & Occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Cash Flow Forecast */}
        <motion.div 
          variants={itemVariants}
          className="bg-dark-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl"
        >
           <h3 className="text-lg font-medium text-white mb-8 flex items-center gap-3">
             Expected Collections <span className="text-xs text-dark-500 uppercase tracking-widest font-bold">CURRENT MONTH</span>
           </h3>
           <div className="grid grid-cols-3 gap-6 mb-8 text-center">
             <div className="p-4 bg-dark-900/50 rounded-2xl border border-white/5">
                <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest mb-1">Forecasted</p>
                <p className="text-lg font-bold text-white">{formatCurrency(forecast?.current_month?.forecasted)}</p>
             </div>
             <div className="p-4 bg-dark-900/50 rounded-2xl border border-white/5">
                <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest mb-1">Actual</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(forecast?.current_month?.actual_collected)}</p>
             </div>
             <div className="p-4 bg-dark-900/50 rounded-2xl border border-white/5">
                <p className="text-[10px] text-dark-500 uppercase font-bold tracking-widest mb-1">Variance</p>
                <p className={`text-lg font-bold ${forecast?.current_month?.variance >= 0 ? 'text-green-500' : 'text-rose-500'}`}>
                  {formatCurrency(forecast?.current_month?.variance)}
                </p>
             </div>
           </div>
        </motion.div>

        {/* Portfolio Value Breakdown */}
        <motion.div 
          variants={itemVariants}
          className="bg-dark-900/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl"
        >
          <h3 className="text-lg font-medium text-white mb-8 text-center uppercase tracking-widest">Asset Allocation</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={portfolio?.by_type || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  animationBegin={400}
                >
                  {portfolio?.by_type?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>
    </div>
  )
}

function KpiCard({ title, value, trend, positive, icon, subtitle }) {
  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, scale: 0.95 },
        visible: { opacity: 1, scale: 1 }
      }}
      className="bg-dark-900/60 border border-white/5 rounded-3xl p-6 relative overflow-hidden group hover:border-primary/30 transition-all duration-500"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-[40px] group-hover:bg-primary/10 transition-all" />
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-dark-950 flex items-center justify-center border border-white/5 group-hover:border-primary/20 transition-all">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${positive ? 'bg-green-500/10 text-green-500' : 'bg-rose-500/10 text-rose-500'}`}>
          {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {trend}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-[10px] text-dark-500 uppercase font-bold tracking-[0.2em] mb-1">{title}</p>
        <h4 className="text-3xl font-light text-white tracking-widest">{value}</h4>
        <p className="text-[11px] text-dark-600 mt-2 italic">{subtitle}</p>
      </div>
    </motion.div>
  )
}
