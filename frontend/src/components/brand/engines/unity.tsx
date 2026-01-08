import type { SVGProps } from 'react';

export function UnityLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M22.012 12.99 17.39 4.926l-9.244.001L6.014 8.84l-4.026 4.149 4.026 4.149 2.131 3.912 9.244.002zm-7.927-5.59 4.953-1.327L17.084 9.94zM7.978 9.95l5.4-3.012 5.4 3.011-2.34 4.087h-6.124zm6.107 6.65 3.001-5.137 2.95 4.776zm-3.385-9.21 4.953 1.328-3.025.74-3.057-.74zM6.92 10.93 9.92 16.07l-2.953-.359zm.999 6.348 5.467-1.06 3.075-.74-3.075 5.137z" />
    </svg>
  );
}
