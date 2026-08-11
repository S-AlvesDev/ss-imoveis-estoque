interface StripesProps {
  className?: string;
  color?: string;
  dense?: boolean;
}

/** Signature diagonal hazard-stripe accent — the app's recurring visual motif. */
export function Stripes({ className = '', color, dense }: StripesProps) {
  return (
    <div
      className={`${dense ? 'stripes-dense' : 'stripes'} ${className}`}
      style={color ? ({ '--stripe-color': color } as React.CSSProperties) : undefined}
    />
  );
}
