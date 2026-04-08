import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RefreshCw, 
  CheckCircle, 
  FileText, 
  Download, 
  DollarSign, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { rentalsAPI } from '@/services/api';
import toast from 'react-hot-toast';
import { useConfirmStore } from '@/stores/useConfirmStore';

const SettlementDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const confirm = useConfirmStore((s) => s.confirm);

  const fetchData = async () => {
    setLoading(true);
    try {
      const month = currentMonth.getMonth() + 1;
      const year = currentMonth.getFullYear();
      const res = await rentalsAPI.settlements.list({ month, year });
      setData(res.data.results || res.data || []);
    } catch (error) {
      toast.error('Failed to load settlements');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const handleGenerate = async () => {
    const ok = await confirm({
      title: 'Generate Monthly Settlements?',
      message: `This will calculate payouts for all owners based on collections in ${format(currentMonth, 'MMMM yyyy')}. This action may take a few moments.`,
      confirmLabel: 'Generate Now',
      type: 'confirm'
    });

    if (!ok) return;

    try {
      setLoading(true);
      const month = currentMonth.getMonth() + 1;
      const year = currentMonth.getFullYear();
      await rentalsAPI.settlements.generate(month, year);
      toast.success('Settlements generated successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    const ok = await confirm({
      title: 'Approve & Post Settlement?',
      message: 'This will finalize the settlement and create corresponding journal entries in the General Ledger. This action cannot be undone.',
      confirmLabel: 'Approve & Post',
      type: 'danger'
    });

    if (!ok) return;

    try {
      await rentalsAPI.settlements.approve(id);
      toast.success('Settlement approved and posted to General Ledger');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Approval failed');
    }
  };

  const handleExportEFT = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      const res = await rentalsAPI.settlements.exportEft(selectedRowKeys);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `EFT_Settlement_${format(new Date(), 'yyyyMMdd')}.csv`);
      document.body.appendChild(link);
      link.click();
      toast.success('EFT Bank File exported');
    } catch (error) {
      toast.error('EFT Export failed');
    }
  };

  const toggleSelectAll = () => {
    if (selectedRowKeys.length === filteredData.length) {
      setSelectedRowKeys([]);
    } else {
      setSelectedRowKeys(filteredData.map(item => item.id));
    }
  };

  const toggleSelectRow = (id) => {
    if (selectedRowKeys.includes(id)) {
      setSelectedRowKeys(selectedRowKeys.filter(k => k !== id));
    } else {
      setSelectedRowKeys([...selectedRowKeys, id]);
    }
  };

  const filteredData = data.filter(item => 
    item.owner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.property_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.property_ref?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPayout = data.reduce((sum, item) => sum + parseFloat(item.net_payout_amount || 0), 0);
  const approvedCount = data.filter(i => i.status === 'approved' || i.status === 'paid').length;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto overflow-hidden">
      {/* ── Header Area ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-1">Owner Settlements</h1>
          <p className="text-dark-400">Review and approve monthly property owner payouts</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-dark-900/50 p-2 rounded-2xl border border-white/5 backdrop-blur-md">
          {/* Month Navigation */}
          <div className="flex items-center gap-1 bg-dark-950 p-1 rounded-xl border border-white/5 mr-2">
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.setMonth(prev.getMonth() - 1)))}
              className="p-2 hover:bg-white/5 rounded-lg text-dark-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-3 py-1.5 text-sm font-bold min-w-[140px] text-center text-primary uppercase tracking-widest bg-primary/5 rounded-lg border border-primary/20">
              {format(currentMonth, 'MMMM yyyy')}
            </div>
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.setMonth(prev.getMonth() + 1)))}
              className="p-2 hover:bg-white/5 rounded-lg text-dark-400 hover:text-white transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-dark-950 rounded-xl shadow-lg shadow-gold/20 transition-all active:scale-95"
          >
            <DollarSign size={16} />
            Generate Settlements
          </button>

          <button 
            onClick={handleExportEFT}
            disabled={selectedRowKeys.length === 0}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border transition-all active:scale-95
              ${selectedRowKeys.length > 0 
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                : 'bg-white/2 border-white/5 text-dark-500 cursor-not-allowed opacity-50'}
            `}
          >
            <Download size={16} />
            {selectedRowKeys.length > 0 ? `Export EFT (${selectedRowKeys.length})` : 'Export Bank File'}
          </button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Total Payouts Pending" 
          value={`$${totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="primary"
          subtitle={`${data.length} Settlements Generated`}
        />
        <KPICard 
          title="Approved Settlements" 
          value={approvedCount}
          icon={CheckCircle}
          color="emerald"
          subtitle={`${data.length - approvedCount} Pending Approval`}
          percentage={(approvedCount / (data.length || 1)) * 100}
        />
        <KPICard 
          title="Selected for Payment" 
          value={`$${data.filter(i => selectedRowKeys.includes(i.id)).reduce((s, i) => s + parseFloat(i.net_payout_amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={Check}
          color="blue"
          subtitle={`${selectedRowKeys.length} Records Selected`}
        />
        <KPICard 
          title="Period Status" 
          value={data.length > 0 ? "Processed" : "No Activity"}
          icon={Calendar}
          color="amber"
          subtitle={`Billing cycle: ${format(currentMonth, 'MMM yyyy')}`}
        />
      </div>

      {/* ── Table Area ────────────────────────────────────────────────── */}
      <div className="bg-dark-900/50 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-md">
        <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-primary rounded-full" />
            <h2 className="text-xl font-display font-semibold text-white">Settlement Registry</h2>
          </div>
          
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500 group-focus-within:text-primary transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Search by owner or property..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-dark-950/50 border border-white/5 rounded-2xl text-white placeholder:text-dark-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/2 border-b border-white/5">
                <th className="px-6 py-4 w-10 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedRowKeys.length === filteredData.length && filteredData.length > 0}
                    onChange={toggleSelectAll}
                    style={{ accentColor: '#E5A645' }}
                    className="w-4 h-4 rounded border-white/10"
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Owner & Property</th>
                <th className="px-6 py-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Monthly Rent</th>
                <th className="px-6 py-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Mgt Fee</th>
                <th className="px-6 py-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest">Net Payout</th>
                <th className="px-6 py-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-dark-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/2">
              <AnimatePresence>
                {filteredData.map((item, idx) => (
                  <motion.tr 
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`hover:bg-white/2 group transition-colors ${selectedRowKeys.includes(item.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-6 py-5 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedRowKeys.includes(item.id)}
                        onChange={() => toggleSelectRow(item.id)}
                        style={{ accentColor: '#E5A645' }}
                        className="w-4 h-4 rounded border-white/10"
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-semibold text-white group-hover:text-primary transition-colors">{item.owner_name}</div>
                      <div className="text-xs text-dark-400 mt-0.5 flex items-center gap-1.5 font-medium uppercase tracking-tighter">
                        {item.property_name} 
                        <span className="text-dark-600 block px-1.5 py-0.5 bg-dark-950 rounded border border-white/5 border-dashed">
                          {item.property_ref}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-white font-mono text-sm leading-none flex items-center gap-1.5">
                        <span className="text-[10px] text-dark-500">{item.currency_code}</span>
                        {parseFloat(item.total_rent_collected).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-dark-400 text-sm italic">
                      {item.currency_code} {parseFloat(item.management_fee_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-emerald-400 font-bold font-mono text-base bg-emerald-500/5 px-2.5 py-1 rounded-lg border border-emerald-500/20 inline-block">
                        <span className="text-[10px] mr-1 opacity-60 font-medium tracking-normal">{item.currency_code}</span>
                        {parseFloat(item.net_payout_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === 'draft' && (
                          <button 
                            onClick={() => handleApprove(item.id)}
                            className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl border border-emerald-500/20 transition-all shadow-lg hover:shadow-emerald-500/20"
                            title="Approve Settlement"
                          >
                            <Check size={16} strokeWidth={3} />
                          </button>
                        )}
                        <button className="p-2 bg-dark-950 hover:bg-white/10 text-dark-400 hover:text-white rounded-xl border border-white/5 transition-all">
                          <FileText size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredData.length === 0 && !loading && (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-dark-950 border border-white/5 rounded-3xl flex items-center justify-center mb-4 text-dark-500">
                <AlertCircle size={40} strokeWidth={1.5} />
              </div>
              <h3 className="text-white text-lg font-bold">No settlements found</h3>
              <p className="text-dark-500 max-w-xs mx-auto">No settlement records match your search or were generated for this period.</p>
            </div>
          )}

          {loading && filteredData.length === 0 && (
            <div className="p-20 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="text-primary animate-spin" size={40} />
              <p className="text-dark-400 font-medium">Fetching settlement data...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const KPICard = ({ title, value, icon: Icon, color, subtitle, percentage }) => {
  const colorMap = {
    primary: 'text-primary bg-primary/10 border-primary/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div className="bg-dark-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-md relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className="relative z-10 flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl border ${colorMap[color] || colorMap.primary}`}>
          <Icon size={24} />
        </div>
        {percentage !== undefined && (
          <div className="text-[10px] font-bold px-2 py-1 bg-white/5 rounded-lg text-dark-400 border border-white/5 uppercase tracking-widest">
            {Math.round(percentage)}% complete
          </div>
        )}
      </div>
      <div>
        <h3 className="text-dark-500 text-xs font-bold uppercase tracking-widest mb-1">{title}</h3>
        <div className="text-3xl font-display font-bold text-white tracking-tight leading-none mb-2">{value}</div>
        <p className="text-dark-500 text-xs font-medium">{subtitle}</p>
      </div>

      {percentage !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-dark-950">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={`h-full ${color === 'emerald' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-primary shadow-gold'}`}
          />
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    draft: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    approved: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    paid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
};

export default SettlementDashboard;
