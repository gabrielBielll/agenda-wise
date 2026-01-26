import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon | React.ElementType;
  description?: string;
  footerText?: string;
  footerIcon?: LucideIcon | React.ElementType;
  colorVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'default';
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  footerText,
  footerIcon: FooterIcon,
  colorVariant = 'default',
}: StatsCardProps) {

  const getVariantClasses = () => {
    switch (colorVariant) {
      case 'primary':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800';
      case 'danger':
        return 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800';
      default:
        return 'bg-white dark:bg-gray-800';
    }
  };

  const getIconColor = () => {
    switch (colorVariant) {
      case 'primary':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'danger':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={`rounded-lg border shadow-sm p-6 ${getVariantClasses()}`}>
      <div className="flex items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Icon className={`h-5 w-5 ${getIconColor()}`} />
      </div>
      <div className="pt-0">
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        )}
        {(footerText || FooterIcon) && (
          <div className="flex items-center mt-2 text-xs text-gray-600 dark:text-gray-400">
            {FooterIcon && <FooterIcon className={`h-3 w-3 mr-1 ${getIconColor()}`} />}
            {footerText && <span>{footerText}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
