/**
 * The handful of line icons the Listen side and the share page use.
 *
 * Inline SVG so they take the text colour and size of wherever they sit, and
 * so a listener's page never waits on an icon font. 1.75 stroke on a 24 grid,
 * round caps: quiet enough to sit next to Bricolage without shouting.
 */
type IconProps = { size?: number; className?: string; title?: string }

function Svg({ size = 18, className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.8v14.4a1 1 0 0 0 1.52.85l11.3-7.2a1 1 0 0 0 0-1.7L8.52 3.95A1 1 0 0 0 7 4.8Z" fill="currentColor" stroke="none" />
  </Svg>
)

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
)

export const PrevIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 6.5v11L3.5 12 11 6.5Z" fill="currentColor" stroke="none" />
    <path d="M20 6.5v11L12.5 12 20 6.5Z" fill="currentColor" stroke="none" />
  </Svg>
)

export const NextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 6.5v11l7.5-5.5L13 6.5Z" fill="currentColor" stroke="none" />
    <path d="M4 6.5v11l7.5-5.5L4 6.5Z" fill="currentColor" stroke="none" />
  </Svg>
)

export const ShuffleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 4h4v4" />
    <path d="M4 18h3.5c2 0 3.1-.9 4.2-2.6l2.6-4.8C15.4 8.9 16.5 8 18.5 8H20" />
    <path d="M4 6h3.5c1.4 0 2.4.5 3.2 1.4" />
    <path d="M16 20h4v-4" />
    <path d="M14.3 16.6c.8.9 1.8 1.4 3.2 1.4H20" />
  </Svg>
)

export const RepeatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="m7 10.5 5 5 5-5" />
    <path d="M5 20h14" />
  </Svg>
)

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
)

export const CommentIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17H10l-4.2 3.2V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" />
    <path d="M8 10h8M8 13h5" />
  </Svg>
)

export const StackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16 8.5 4.5 8.5-4.5" />
  </Svg>
)

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4L11.5 6" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.2" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

/** Three bars for "this is the one playing". Animated in CSS. */
export const EqIcon = ({ className }: { className?: string }) => (
  <span className={`eq-icon${className ? ` ${className}` : ''}`} aria-hidden>
    <i />
    <i />
    <i />
  </span>
)
