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
        return 'bg-primary/10 border-primary/20';
      case 'success':
        return 'bg-success/10 border-success/20';
      case 'warning':
        return 'bg-secondary/15 border-secondary/20';
      case 'danger':
        return 'bg-destructive/10 border-destructive/20';
      default:
        return 'bg-card/70 border-border/70';
    }
  };

  const getIconColor = () => {
    switch (colorVariant) {
      case 'primary':
        return 'text-primary';
      case 'success':
        return 'text-success';
      case 'warning':
        return 'text-secondary';
      case 'danger':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className={`rounded-[20px] border p-5 shadow-[var(--quiet-shadow-soft)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--quiet-shadow)] sm:p-6 ${getVariantClasses()}`}>
      <div className="flex items-center justify-between space-y-0 pb-2">
        <h3 className="page-eyebrow text-muted-foreground">{title}</h3>
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-card/60 shadow-sm"><Icon className={`h-5 w-5 ${getIconColor()}`} /></span>
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
