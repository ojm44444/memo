import { describe, expect, it } from 'vitest'
import { detectDevice, importPlaceFor } from './devicePlatform'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
}

describe('detectDevice', () => {
  it('tells the browsers apart', () => {
    expect(detectDevice(UA.iphoneSafari, 5)).toBe('iphone-safari')
    expect(detectDevice(UA.iphoneChrome, 5)).toBe('iphone-chrome')
    expect(detectDevice(UA.android, 5)).toBe('android')
    expect(detectDevice(UA.macChrome, 0)).toBe('mac-chrome')
    expect(detectDevice(UA.macSafari, 0)).toBe('mac-safari')
    expect(detectDevice(UA.windowsEdge, 0)).toBe('pc')
  })

  it('treats an iPad asking for the desktop site as an iPhone-style device', () => {
    expect(detectDevice(UA.macSafari, 5)).toBe('iphone-safari')
  })

  it('maps devices to import routes', () => {
    expect(importPlaceFor('iphone-chrome')).toBe('iphone')
    expect(importPlaceFor('android')).toBe('android')
    expect(importPlaceFor('mac-safari')).toBe('computer')
  })
})
