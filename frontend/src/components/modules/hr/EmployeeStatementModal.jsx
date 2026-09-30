import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, X, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { hrAPI } from '@/services/api';
import { formatCurrency, formatDate } from '@/utils/format';

const EmployeeStatementModal = ({ isOpen, onClose, employeeId }) => {
  const printRef = useRef();

  const { data: statement, isLoading } = useQuery({
    queryKey: ['employee-statement', employeeId],
    queryFn: () => hrAPI.employees.statement(employeeId).then(res => res.data),
    enabled: !!employeeId && isOpen,
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
          <title>Statement - ${statement?.employee?.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
            .company { font-weight: 800; font-size: 24px; color: #E5A645; }
            .statement-title { font-size: 18px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
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
            .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; background: #f1f5f9; color: #64748b; }
            .badge.paid { background: #dcfce7; color: #166534; }
            .badge.pending { background: #fef9c3; color: #854d0e; }
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
              className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-widest text-xs">
                   <FileText size={16} className="text-primary" /> Comprehensive Employee Statement
                </div>
                <div className="flex gap-2">
                  <button onClick={handlePrint} className="btn-primary h-9 gap-2 text-xs">
                    <Printer size={16} /> Print Statement
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
                    <p className="text-slate-400 font-medium animate-pulse">Generating statement data...</p>
                  </div>
                ) : !statement ? (
                  <div className="text-center py-20 text-slate-400">Failed to load statement data.</div>
                ) : (
                  <div className="space-y-8 text-slate-900">
                    <div className="header">
                      <div>
                        <div className="company text-primary font-black">STOHILL PROPERTIES</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Premium Real Estate Solutions</div>
                      </div>
                      <div className="text-right">
                        <div className="statement-title">Employee Ledger</div>
                        <div className="font-mono text-xs text-slate-400 mt-1">Ref: EMP-${statement.employee.id}</div>
                      </div>
                    </div>

                    <div className="grid">
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="section-title">Employee Information</div>
                        <div className="space-y-3">
                          <div className="info-row"><span className="info-label">Full Name</span><span className="info-value">{statement.employee.name}</span></div>
                          <div className="info-row"><span className="info-label">Staff ID</span><span className="info-value">{statement.employee.number}</span></div>
                          <div className="info-row"><span className="info-label">Report Generated</span><span className="info-value font-mono">{formatDate(new Date())}</span></div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="section-title">Payroll History</div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Period / Run Name</th>
                            <th>Status</th>
                            <th>Ref</th>
                            <th className="amount">Gross Earnings</th>
                            <th className="amount">Deductions</th>
                            <th className="amount">Net Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.history.length === 0 && (
                            <tr><td colSpan="6" className="text-center text-slate-400 p-8">No payroll history found.</td></tr>
                          )}
                          {statement.history.map((record, idx) => (
                            <tr key={idx}>
                              <td>
                                <div className="font-bold">{record.run_name}</div>
                                <div className="text-xs text-slate-500">{record.period}</div>
                              </td>
                              <td><span className={`badge ${record.status}`}>{record.status}</span></td>
                              <td><span className="font-mono text-xs text-slate-500">{record.reference || '—'}</span></td>
                              <td className="amount">{formatCurrency(record.gross, record.currency)}</td>
                              <td className="amount text-rose-600">({formatCurrency(record.deductions, record.currency)})</td>
                              <td className="amount font-bold text-emerald-700">{formatCurrency(record.net, record.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end pt-4">
                      <div className="w-80 totals shadow-xl shadow-slate-200/50">
                        <div className="total-row">
                          <span className="total-label uppercase tracking-widest text-[10px]">Total Gross Earned</span>
                          <span className="total-value">{formatCurrency(statement.summary.total_earnings, "USD")}</span>
                        </div>
                        <div className="total-row">
                          <span className="total-label uppercase tracking-widest text-[10px]">Total Deductions</span>
                          <span className="total-value text-rose-600">-{formatCurrency(statement.summary.total_deductions, "USD")}</span>
                        </div>
                        <div className="total-row net-pay">
                          <span className="total-label font-bold uppercase tracking-widest">Total Net Disbursed</span>
                          <span className="total-value font-black text-emerald-700">{formatCurrency(statement.summary.total_net, "USD")}</span>
                        </div>
                      </div>
                    </div>

                    <div className="footer">
                      <p className="font-bold text-slate-400">Computer Generated Document — No Signature Required</p>
                      <p className="mt-1">Generated by Stohill ERP Payroll Systems</p>
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

export default EmployeeStatementModal;
