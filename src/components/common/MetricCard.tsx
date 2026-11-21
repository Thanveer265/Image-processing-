import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  delta?: {
    value: string;
    isPositive?: boolean;
  };
  accent?: boolean;
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  description,
  icon: Icon,
  delta,
  accent = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 transition-all ${
        onClick ? 'cursor-pointer hover:border-[#FE7F2D] dark:hover:border-[#FE7F2D]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <span className="text-[12.5px] font-semibold text-[#526575] dark:text-[#8FA3B3]">
          {label}
        </span>
        {Icon && (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              accent
                ? 'bg-[#FE7F2D]/15 text-[#D96014] dark:text-[#FE7F2D]'
                : 'bg-[#EAECEF] dark:bg-[#1B2D3A] text-[#233D4D] dark:text-[#FE7F2D]'
            }`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold tracking-tight text-[#111C24] dark:text-[#EAECEF] font-mono tabular-nums leading-none">
          {value}
        </span>
        {unit && (
          <span className="text-[12px] font-mono text-[#6D8090] dark:text-[#7D95A8]">
            {unit}
          </span>
        )}
      </div>

      {(description || delta) && (
        <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6D8090] dark:text-[#7D95A8]">
          {description && <span className="truncate">{description}</span>}
          {delta && (
            <span
              className={`font-mono tabular-nums shrink-0 ml-2 font-semibold ${
                delta.isPositive ? 'text-[#2EA876]' : 'text-[#E56B6B]'
              }`}
            >
              {delta.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
