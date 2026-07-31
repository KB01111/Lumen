import type {ReactNode} from 'react';

import {LumenIcon, type LumenIconProps} from './LumenIcon';

type ProductIconProps = Omit<LumenIconProps, 'children'>;

function ProductIcon({children, ...props}: ProductIconProps & {children: ReactNode}) {
  return <LumenIcon {...props}>{children}</LumenIcon>;
}

export function SemanticSearchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5M7.5 10.5h6M10.5 7.5v6" /></ProductIcon>;
}

export function HybridSearchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><circle cx="9" cy="10" r="5.5" /><path d="m13 14 4.5 4.5M17 5v6M14 8h6" /></ProductIcon>;
}

export function RelatedSearchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><circle cx="7" cy="12" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m9.7 10.6 4.6-2.2M9.7 13.4l4.6 2.2" /></ProductIcon>;
}

export function LocalAiIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M5 8.5h14v10H5Z" /><path d="M9 8.5V6a3 3 0 0 1 6 0v2.5M9 13h.01M15 13h.01M9.5 16h5" /></ProductIcon>;
}

export function NpuIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M18.5 9h3M2.5 15h3M18.5 15h3M10 10h4v4h-4z" /></ProductIcon>;
}

export function GatewayIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M5 20V5h14v15M9 20V9h6v11M3 20h18" /><path d="m11 13 2-2 2 2" /></ProductIcon>;
}

export function McpIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M8 7h8M8 17h8M7 8v8M17 8v8" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></ProductIcon>;
}

export function IndexedRootIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M3.5 8h7l2-2h8v13h-17Z" /><path d="M8 12h8M8 15h6" /><circle cx="17.5" cy="17.5" r="3" /></ProductIcon>;
}

export function DeveloperFolderIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M3.5 7.5h6l2-2h9v14h-17Z" /><path d="m9.5 11-2 2 2 2M14.5 11l2 2-2 2" /></ProductIcon>;
}

export function FilenameMatchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M6 3h8l4 4v14H6Z" /><path d="M9 12h6M9 16h4" /><path d="m15 18 1.5 1.5L20 16" /></ProductIcon>;
}

export function ContentMatchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M6 3h8l4 4v14H6Z" /><path d="M9 10h6M9 13h6M9 16h4" /><circle cx="17" cy="17" r="3" /></ProductIcon>;
}

export function OcrMatchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 10h8M8 14h8" /></ProductIcon>;
}

export function ImageMatchIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m5.5 18 5-5 3 3 2.5-2.5 2.5 2.5" /></ProductIcon>;
}

export function RerankingIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M7 5h12M7 12h9M7 19h6" /><path d="m3.5 4.5 1 1 2-2M3.5 11.5l1 1 2-2M3.5 18.5l1 1 2-2" /></ProductIcon>;
}

export function GamingPauseIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><path d="M7 8 4 17h4l2-2h4l2 2h4l-3-9Z" /><circle cx="9" cy="11" r="1" /><path d="M15 10v3M18 10v3" /></ProductIcon>;
}

export function CinemaIcon(props: ProductIconProps) {
  return <ProductIcon {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3ZM3 8h18" /></ProductIcon>;
}

