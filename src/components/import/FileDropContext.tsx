import { createContext, useContext } from 'react'
import type { ColumnSlug } from '@/types/column'

export const FileDropHighlightContext = createContext<ColumnSlug | null>(null)

export function useFileDropHighlight() {
  return useContext(FileDropHighlightContext)
}
