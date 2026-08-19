import * as React from 'react';

import {cn} from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, ...props}, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-xl border border-input/70 bg-white/55 px-3.5 py-3 text-base shadow-sm ring-offset-background transition-all placeholder:text-muted-foreground/70 focus-visible:border-primary/45 focus-visible:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card/60 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};
