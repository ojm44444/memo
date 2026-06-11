export function smartTitleFromFileName(fileName: string): string {
  let title = fileName.replace(/\.[^.]+$/, '')

  title = title
    .replace(/^recording[\s_-]*/i, '')
    .replace(/^voice\s*memo[\s_-]*/i, '')
    .replace(/^audio\s*recording[\s_-]*/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}[\s_T-]*/i, '')
    .replace(/^\d{8}[\s_-]*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) return 'Untitled memo'
  return title.charAt(0).toUpperCase() + title.slice(1)
}
