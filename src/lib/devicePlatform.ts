/**
 * Which device and browser someone is on, for install and import help.
 *
 * Only a best guess from the user agent. Every guide that uses it also has a
 * "Show other devices" option, so a wrong guess costs one tap.
 */
export type Device =
  | 'iphone-safari'
  | 'iphone-chrome'
  | 'android'
  | 'mac-chrome'
  | 'mac-safari'
  | 'pc'

export const DEVICES: Device[] = [
  'iphone-safari',
  'iphone-chrome',
  'android',
  'mac-chrome',
  'mac-safari',
  'pc',
]

export function detectDevice(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): Device {
  // iPadOS asks for the desktop site and says "Macintosh"; touch gives it away.
  const iPad = /Macintosh/.test(ua) && touchPoints > 1
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || iPad) return /crios/i.test(ua) ? 'iphone-chrome' : 'iphone-safari'
  if (/Macintosh|Mac OS X/.test(ua)) {
    if (/chrome|chromium|edg\//i.test(ua)) return 'mac-chrome'
    if (/safari/i.test(ua)) return 'mac-safari'
    return 'mac-chrome'
  }
  return 'pc'
}

export type ImportPlace = 'iphone' | 'mac' | 'windows' | 'android'

export function importPlaceFor(device: Device): ImportPlace {
  if (device === 'android') return 'android'
  if (device === 'iphone-safari' || device === 'iphone-chrome') return 'iphone'
  if (device === 'pc') return 'windows'
  return 'mac'
}
