import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const Toast: React.FC = () => {
  const { toast, dismissToast } = useWorkspace();

  if (!toast) return null;

  const icons = {
    info: <Info className="w-4 h-4 text-[#FE7F2D] shrink-0" />,
    success: <CheckCircle2 className="w-4 h-4 text-[#2EA876] shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-[#FE7F2D] shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-[#E56B6B] shrink-0" />,
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border bg-[#FFFFFF] dark:bg-[#142029] border-[#D8E0E6] dark:border-[#233D4D] shadow-xl max-w-md animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {icons[toast.type]}
      <p className="text-[13px] font-medium text-[#111C24] dark:text-[#EAECEF] leading-snug flex-1">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={dismissToast}
        className="p-1 rounded-lg text-[#7C90A0] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#EAECEF] dark:hover:bg-[#1E3140] transition-colors shrink-0 cursor-pointer"
        title="Dismiss notification"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </aside>
  );
};
