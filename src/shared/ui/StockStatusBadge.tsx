import { Badge } from './Badge';
import { statusLabel, type StockScope, type StockStatus } from '@/features/estoque/utils';

/**
 * Cor por severidade, não por "é problema ou não":
 * ruptura é o pior caso, remessa é apenas informativo (o material existe).
 */
const VARIANTS = {
  RUPTURA: 'critical',
  ABAIXO: 'warning',
  ATENCAO: 'neutral',
  TRANSFERIR: 'info',
  OK: 'success',
} as const;

interface StockStatusBadgeProps {
  status: StockStatus;
  scope?: StockScope;
  /** OK normalmente não merece um selo; passe `showOk` para exibi-lo mesmo assim. */
  showOk?: boolean;
  /** Para TRANSFERIR: em que estoque(s) o material existe ("Tem em Almoxarifado Central"). */
  ondeTem?: string;
}

export function StockStatusBadge({ status, scope = 'empresa', showOk, ondeTem }: StockStatusBadgeProps) {
  if (status === 'OK' && !showOk) return null;
  return (
    <Badge variant={VARIANTS[status]} dot={status === 'RUPTURA'}>
      {statusLabel(status, scope, ondeTem)}
    </Badge>
  );
}
