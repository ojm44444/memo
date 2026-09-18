export interface UiState {
  onAppRoute: boolean
  /** A text field or editor has focus. */
  editing: boolean
  /** Audio or video is playing. */
  playing: boolean
  hidden: boolean
  /** Time since the app was opened or brought back to the foreground. */
  sinceLoadMs: number
}

/** An update found this soon after opening is the "launched a stale build" case. */
export const JUST_OPENED_MS = 20_000

/**
 * When is it safe to reload into a new build?
 *
 * Off /app there is nothing to lose. On /app: never while someone is typing
 * or listening. Otherwise straight away if the app has only just opened (the
 * stale-launch case, before anything is under way) or is in the background;
 * mid-session it waits for the app to go to the background, with a banner.
 */
export function shouldReloadNow(state: UiState): boolean {
  if (!state.onAppRoute) return true
  if (state.playing || state.editing) return false
  return state.hidden || state.sinceLoadMs < JUST_OPENED_MS
}
