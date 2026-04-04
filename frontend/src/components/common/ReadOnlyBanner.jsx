import React from 'react';
import { ShieldAlert, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';

export default function ReadOnlyBanner() {
  const { user, executiveMode } = useAuthStore();

  // Show only for users who have the ability to toggle or use executive mode
  const canUseExecutiveMode = user?.roles?.some(r => 
    r.role_type === 'super_admin' || r.role_type === 'executive' || r.can_view_executive_dashboard
  );

  if (!canUseExecutiveMode || executiveMode) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between overflow-hidden"
      >
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/20 p-1.5 rounded-lg text-amber-600">
            <ShieldAlert size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">
              System is in View-Only Mode
            </p>
            <p className="text-xs text-amber-700/80">
              You can browse data but cannot save changes. Enable Executive Mode to make edits.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
          <Zap size={12} className="fill-current" />
          EXHIBIT SAFETY ACTIVE
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
