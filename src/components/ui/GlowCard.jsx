import BorderGlow from './BorderGlow';

/**
 * GlowCard — BorderGlow wrapper that uses the project's color palette
 * Variants: 'primary' (purple), 'accent' (amber), 'success' (sage), 'danger' (coral), 'info' (blue)
 */
const GlowCard = ({
  children,
  className = '',
  variant = 'primary',
  edgeSensitivity = 35,
  borderRadius = 14,
  glowRadius = 35,
  glowIntensity = 0.8,
  animated = false,
  ...props
}) => {
  const variants = {
    primary: {
      glowColor: '267 55 65',        // purple-700
      backgroundColor: 'var(--surface-card)',
      colors: ['#4C2A92', '#7C5CE0', '#EDE8F8'],  // navy → lighter purple → tint
    },
    accent: {
      glowColor: '39 85 55',         // amber
      backgroundColor: 'var(--surface-card)',
      colors: ['#E8A020', '#F5D080', '#FDF0D5'], // amber → lighter → tint
    },
    success: {
      glowColor: '149 60 50',        // sage
      backgroundColor: 'var(--surface-card)',
      colors: ['#2D8653', '#5A9F6D', '#EBF7F1'], // sage → lighter → tint
    },
    danger: {
      glowColor: '9 85 60',          // coral
      backgroundColor: 'var(--surface-card)',
      colors: ['#F06449', '#F48F7D', '#FEF0ED'], // coral → lighter → tint
    },
    info: {
      glowColor: '217 83 61',        // blue
      backgroundColor: 'var(--surface-card)',
      colors: ['#2563EB', '#5B8EFF', '#DBEAFE'], // blue → lighter → tint
    },
  };

  const config = variants[variant] || variants.primary;

  return (
    <BorderGlow
      {...config}
      className={className}
      edgeSensitivity={edgeSensitivity}
      borderRadius={borderRadius}
      glowRadius={glowRadius}
      glowIntensity={glowIntensity}
      animated={animated}
      {...props}
    >
      {children}
    </BorderGlow>
  );
};

export default GlowCard;
