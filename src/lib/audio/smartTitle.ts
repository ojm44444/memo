/**
 * A song's title, taken from its filename.
 *
 * USED TO STRIP THE WORD OFF THE FRONT. "Recording 11.m4a" became "11",
 * "Voice Memo 3.m4a" became "3": the one thing in the name that still meant
 * something, gone, leaving a bare number that looked unnamed even though the
 * recorder had already told you what it was. That is backwards for a tool
 * whose whole job is turning a pile of memos into songs you can find again.
 *
 * Now it keeps what the phone called it, exactly, and only tidies the
 * mechanical bits: the extension, and underscores or dashes standing in for
 * spaces because a filesystem does not allow spaces. Nothing about what a
 * person actually named it is touched. `looksUnnamed` in unnamedTitles.ts is
 * what decides whether this still needs a name, on the untouched result.
 */
export function smartTitleFromFileName(fileName: string): string {
  const title = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) return 'Untitled memo'
  return title.charAt(0).toUpperCase() + title.slice(1)
}
