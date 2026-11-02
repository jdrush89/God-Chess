import type { SVGProps } from "react";

export function BananaPeelIcon({
  className = "",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      className={`banana-peel-icon ${className}`.trim()}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="banana-peel-fruit"
        d="M5 7 C8 17 15 24 24 25 C27 25 29 23 30 19 C25 22 18 20 13 15 C9 11 8 7 8 4 Z"
      />
      <path
        className="banana-peel-highlight"
        d="M9 8 C12 16 18 21 25 21"
      />
      <path className="banana-peel-tip" d="M6 7 L5 3 L9 4 L8 7 Z" />
      <path className="banana-peel-tip" d="M28 20 Q31 18 31 21 Q30 24 27 24 Z" />
    </svg>
  );
}
