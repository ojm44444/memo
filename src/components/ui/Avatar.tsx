import { avatarHue, initialsFor } from '@/lib/avatar'

interface AvatarProps {
  label: string
  url?: string | null
  size?: number
  className?: string
}

/**
 * A face, or the next best thing. Never a broken image: if the URL fails
 * (a Google picture whose token expired, an offline board), the initials
 * underneath are already painted and simply stay visible.
 */
export function Avatar({ label, url, size = 22, className }: AvatarProps) {
  const hue = avatarHue(label)
  return (
    <span
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        background: `linear-gradient(150deg, hsl(${hue} 42% 46%), hsl(${hue + 24} 40% 34%))`,
      }}
      title={label}
    >
      <span aria-hidden="true">{initialsFor(label)}</span>
      {url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
    </span>
  )
}
