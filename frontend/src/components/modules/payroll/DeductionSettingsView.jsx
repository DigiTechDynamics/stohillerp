import { useQuery } from '@tanstack/react-query';
import { payrollAPI } from '@/services/api';
import { formatCurrency, getDefaultCurrency } from '@/utils/format';
import { Calculator, DollarSign, Save, Plus } from 'lucide-react';

const DeductionSettingsView = ({ selectedRun }) => {
  const { data: settingsData } = useQuery({
    queryKey: ['payrollSettings'],
    queryFn: () => payrollAPI.settings.list().then(res => res.data),
  });
  const settings = settingsData?.results || [];

  const { data: bracketsData } = useQuery({
    queryKey: ['taxBrackets', selectedRun?.currency],
    queryFn: () => payrollAPI.taxBrackets.list({ currency: selectedRun?.currency }).then(res => res.data),
    enabled: !!selectedRun?.currency,
  });
  const brackets = bracketsData?.results || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Statutory Rates Card */}
        <div className="card overflow-hidden bg-dark-900 border-white/5 shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-dark-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
                <Calculator size={20} />
              </div>
              <div>
                <h3 className="text-white font-bold">Statutory Rates</h3>
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Zimbabwe Social Security & Levies</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {settings.map(setting => (
                <div key={setting.id} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:border-white/10 transition-all">
                  <div>
                    <div className="font-bold text-white text-sm">{setting.name}</div>
                    <div className="text-[10px] text-dark-500 uppercase tracking-tight">{setting.description}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      className="w-24 h-9 p-2 text-right font-mono bg-dark-950 border border-white/10 rounded-lg focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-white text-xs"
                      defaultValue={setting.value}
                      step="0.001"
                    />
                    <button className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-primary/20 shadow-gold-sm">
                      <Save size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {settings.length === 0 && (
                <div className="text-center py-10 text-dark-500 text-xs italic">
                  No statutory settings found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tax Brackets Info Card */}
        <div className="card overflow-hidden border-white/5 shadow-2xl bg-dark-950">
          <div className="p-6 border-b border-white/5 bg-dark-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-gold-sm">
                <DollarSign size={20} />
              </div>
              <div>
                <h3 className="text-white font-bold">PAYE Tax Brackets</h3>
                <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold">Thresholds for {selectedRun?.currency_code || getDefaultCurrency()}</p>
              </div>
            </div>
          </div>
          <div className="p-0">
            <table className="data-table">
              <thead>
                <tr className="bg-white/[0.01]">
                  <th className="px-6 py-4">Income Range</th>
                  <th className="px-6 py-4 text-right">Tax Rate</th>
                  <th className="px-6 py-4 text-right">Fixed Ded.</th>
                </tr>
              </thead>
              <tbody>
                {brackets.map(bracket => (
                  <tr key={bracket.id} className="hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-dark-200 font-mono text-xs">
                      {formatCurrency(bracket.min_amount, selectedRun?.currency_code)} — {bracket.max_amount ? formatCurrency(bracket.max_amount, selectedRun?.currency_code) : 'Above'}
                    </td>
                    <td className="px-6 py-4 text-right text-white font-bold">
                       <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] border border-primary/20">
                          {bracket.tax_rate}%
                       </span>
                    </td>
                    <td className="px-6 py-4 text-right text-dark-400 font-mono text-xs italic">
                      {formatCurrency(bracket.fixed_deduction, selectedRun?.currency_code)}
                    </td>
                  </tr>
                ))}
                {brackets.length === 0 && (
                  <tr>
                    <td colSpan="3" className="p-10 text-center text-dark-500 text-xs italic">
                      No tax brackets defined for this currency.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="p-4 bg-white/[0.02] border-t border-white/5">
               <button className="w-full btn-ghost border border-dashed border-white/10 hover:border-primary/30 h-10 text-[10px] font-bold uppercase tracking-widest gap-2">
                 <Plus size={14} /> Add New Bracket
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeductionSettingsView;
