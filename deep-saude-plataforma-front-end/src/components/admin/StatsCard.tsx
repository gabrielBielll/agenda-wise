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
        return 'bg-primary/10 border-primary/10';
      case 'success':
        return 'bg-primary/5 border-primary/10';
      case 'warning':
        return 'bg-secondary/15 border-secondary/20';
      case 'danger':
        return 'bg-accent/10 border-accent/15';
      default:
        return 'bg-card/70 border-white/70';
    }
  };

  const getIconColor = () => {
    switch (colorVariant) {
      case 'primary':
        return 'text-primary';
      case 'success':
        return 'text-primary';
      case 'warning':
        return 'text-secondary';
      case 'danger':
        return 'text-accent';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className={`rounded-[20px] border p-6 shadow-[0_16px_45px_rgba(74,67,55,.06)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(74,67,55,.1)] ${getVariantClasses()}`}>
      <div className="flex items-center justify-between space-y-0 pb-2">
        <h3 className="page-eyebrow text-muted-foreground">{title}</h3>
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-white/55 shadow-sm"><Icon className={`h-5 w-5 ${getIconColor()}`} /></span>
      </div>
      <div className="pt-0">
        <div className="font-headline text-4xl font-normal">{value}</div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {(footerText || FooterIcon) && (
          <div className="mt-2 flex items-center text-xs text-muted-foreground">
            {FooterIcon && <FooterIcon className={`h-3 w-3 mr-1 ${getIconColor()}`} />}
            {footerText && <span>{footerText}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
