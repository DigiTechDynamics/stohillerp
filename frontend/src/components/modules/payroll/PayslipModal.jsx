import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, X, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { payrollAPI } from '@/services/api';
import { formatCurrency } from '@/utils/format';

const PayslipModal = ({ isOpen, onClose, itemId }) => {
  const printRef = useRef();

  const { data: payslip, isLoading } = useQuery({
    queryKey: ['payslip', itemId],
    queryFn: () => payrollAPI.payslips.details(itemId).then(res => res.data),
    enabled: !!itemId && isOpen,
  });

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
    const windowUrl = 'about:blank';
    const uniqueName = new Date();
    const windowName = 'Print' + uniqueName.getTime();
    const printWindow = window.open(windowUrl, windowName, 'left=50000,top=50000,width=0,height=0');

    printWindow.document.write(`
      <html>
        <head>
          <title>Payslip - ${payslip?.employee?.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
            .company { font-weight: 800; font-size: 24px; color: #E5A645; }
            .payslip-title { font-size: 18px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
            .section-title { font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px; font-weight: 700; letter-spacing: 1px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .info-label { color: #666; }
            .info-value { font-weight: 600; color: #111; }
            .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .table th { text-align: left; padding: 12px; background: #f9fafb; color: #6b7280; font-size: 11px; text-transform: uppercase; font-weight: 700; }
            .table td { padding: 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
            .amount { text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600; }
            .totals { background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .total-label { font-size: 13px; color: #64748b; font-weight: 600; }
            .total-value { font-size: 15px; font-weight: 700; color: #0f172a; }
            .net-pay { border-top: 2px dashed #cbd5e1; padding-top: 15px; margin-top: 15px; }
            .net-pay .total-label { color: #1e293b; font-size: 14px; }
            .net-pay .total-value { font-size: 24px; color: #E5A645; }
            .footer { margin-top: 60px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #eee; padding-top: 20px; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  if (!isOpen) return null;

  const earnings = payslip?.lines?.filter(l => ['basic', 'allowance'].includes(l.category)) || [];
  const deductions = payslip?.lines?.filter(l => l.category === 'deduction') || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-dark-950/90 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-widest text-xs">
                   <FileText size={16} className="text-primary" /> Employee Payslip
                </div>
                <div className="flex gap-2">
                  <button onClick={handlePrint} className="btn-primary h-9 gap-2 text-xs">
                    <Printer size={16} /> Print Payslip
                  </button>
                  <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Printable Body */}
              <div className="flex-1 overflow-y-auto p-12 bg-white" ref={printRef}>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-slate-400 font-medium animate-pulse">Generating payslip details...</p>
                  </div>
                ) : !payslip ? (
                  <div className="text-center py-20 text-slate-400">Failed to load payslip data.</div>
                ) : (
                  <div className="space-y-8 text-slate-900">
                    <div className="header">
                      <div>
                        <div className="company text-primary font-black">STOHILL PROPERTIES</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Premium Real Estate Solutions</div>
                      </div>
                      <div className="text-right">
                        <div className="payslip-title">Official Payslip</div>
                        <div className="font-mono text-xs text-slate-400 mt-1">Ref: #{payslip.id.toString().padStart(6, '0')}</div>
                      </div>
                    </div>

                    <div className="grid">
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="section-title">Employee Information</div>
                        <div className="space-y-3">
                          <div className="info-row"><span className="info-label">Full Name</span><span className="info-value">{payslip.employee.name}</span></div>
                          <div className="info-row"><span className="info-label">Staff ID</span><span className="info-value">{payslip.employee.number}</span></div>
                          <div className="info-row"><span className="info-label">Designation</span><span className="info-value">{payslip.employee.contract || '—'}</span></div>
                        </div>
                      </div>
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="section-title">Payroll Period</div>
                        <div className="space-y-3">
                          <div className="info-row"><span className="info-label">Schedule</span><span className="info-value">{payslip.run.name}</span></div>
                          <div className="info-row"><span className="info-label">Duration</span><span className="info-value">{payslip.run.period}</span></div>
                          <div className="info-row"><span className="info-label">Currency</span><span className="info-value font-mono">{payslip.run.currency}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="grid">
                      <div>
                        <div className="section-title">Earnings Breakdown</div>
                        <table className="table">
                          <thead>
                            <tr><th>Description</th><th className="amount">Amount</th></tr>
                          </thead>
                          <tbody>
                            {earnings.map((e, idx) => (
                              <tr key={idx}><td>{e.name}</td><td className="amount">{formatCurrency(e.amount, payslip.run.currency)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <div className="section-title">Statutory Deductions</div>
                        <table className="table">
                          <thead>
                            <tr><th>Description</th><th className="amount">Amount</th></tr>
                          </thead>
                          <tbody>
                            {deductions.map((d, idx) => (
                              <tr key={idx}><td>{d.name}</td><td className="amount text-rose-600">({formatCurrency(d.amount, payslip.run.currency)})</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4">
                      <div className="w-80 totals shadow-xl shadow-slate-200/50">
                        <div className="total-row">
                          <span className="total-label uppercase tracking-widest text-[10px]">Gross Salary</span>
                          <span className="total-value">{formatCurrency(payslip.totals.gross, payslip.run.currency)}</span>
                        </div>
                        <div className="total-row">
                          <span className="total-label uppercase tracking-widest text-[10px]">Total Deductions</span>
                          <span className="total-value text-rose-600">-{formatCurrency(payslip.totals.deductions, payslip.run.currency)}</span>
                        </div>
                        <div className="total-row net-pay">
                          <span className="total-label font-bold uppercase tracking-widest">Net Disbursed</span>
                          <span className="total-value font-black">{formatCurrency(payslip.totals.net, payslip.run.currency)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 p-8 border border-slate-100 rounded-3xl bg-slate-50/50">
                      <div className="section-title">Bank Disbursement Details</div>
                      <div className="grid grid-cols-2 gap-10">
                        <div className="info-row"><span className="info-label">Financial Institution</span><span className="info-value">{payslip.employee.bank || 'Standard Chartered'}</span></div>
                        <div className="info-row"><span className="info-label">Account Number</span><span className="info-value font-mono">{payslip.employee.account || '••••••••1234'}</span></div>
                      </div>
                    </div>

                    <div className="footer">
                      <p className="font-bold text-slate-400">Computer Generated Document — No Signature Required</p>
                      <p className="mt-1">Generated by Stohill ERP Payroll Systems on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PayslipModal;
