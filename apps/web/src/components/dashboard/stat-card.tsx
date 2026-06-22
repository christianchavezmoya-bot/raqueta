import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'purple';
}

const colorMap = {
  green: 'bg-green-50 text-green-600',
  blue: 'bg-blue-50 text-blue-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
};

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'green' }: StatCardProps) {
  return (
    <div className="card flex items-start gap-4">
      <div className={clsx('p-3 rounded-xl flex-shrink-0', colorMap[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
