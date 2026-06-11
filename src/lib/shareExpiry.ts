export type ShareExpiryStatus = 'none' | 'ok' | 'soon' | 'expired'

export function getShareExpiryStatus(expiresAt: string | null): ShareExpiryStatus {
  if (!expiresAt) return 'none'
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'expired'
  if (days <= 7) return 'soon'
  return 'ok'
}

export function formatShareExpiry(expiresAt: string | null) {
  if (!expiresAt) return null
  const status = getShareExpiryStatus(expiresAt)
  if (status === 'expired') return 'Expired'
  const diff = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(diff / 86_400_000)
  if (days === 1) return 'Expires tomorrow'
  if (days < 14) return `Expires in ${days}d`
  return `Expires ${new Date(expiresAt).toLocaleDateString()}`
}

export function countExpiringShares<T extends { expires_at: string | null }>(shares: T[]) {
  return shares.filter((share) => getShareExpiryStatus(share.expires_at) === 'soon').length
}
