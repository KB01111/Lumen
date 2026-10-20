import type {ReactNode} from 'react';
import {Badge} from '@openai/apps-sdk-ui/components/Badge';

/** Uses Lumen's scoped badge tokens without the SDK's global reset or theme. */
export function AiStatusBadge({children, tone = 'secondary'}: {
  children: ReactNode;
  tone?: 'secondary' | 'success' | 'danger';
}) {
  return <Badge className="lumen-ai-status" color={tone} size="sm" variant="soft">{children}</Badge>;
}
