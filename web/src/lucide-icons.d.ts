// Direct icon modules avoid transforming the complete Lucide export index.
// Their default export has the same public component type as named imports.
declare module 'lucide-react/dist/esm/icons/*.mjs' {
  import type { LucideIcon } from 'lucide-react'
  const icon: LucideIcon
  export default icon
}
