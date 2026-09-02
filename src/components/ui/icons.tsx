type IconProps = {
  size?: number
}

export function IconUndo({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.5 6.5H10a3 3 0 1 1 0 6H8.5M4.5 6.5 7 4M4.5 6.5 7 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconRedo({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 6.5H6a3 3 0 1 0 0 6h1.5M11.5 6.5 9 4M11.5 6.5 9 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconPreview({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 8s2.2-3.5 5.5-3.5S13.5 8 13.5 8 11.3 11.5 8 11.5 2.5 8 2.5 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m3.5 8.2 3 3.1 6-6.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconFocus({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 6V3.5H6M10 3.5h2.5V6M12.5 10v2.5H10M6 12.5H3.5V10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Inward corners — you're already inside the frame. */
export function IconFocusOn({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3.5v2.5H3.5M10 3.5v2.5h2.5M10 12.5V10h2.5M6 12.5V10H3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconClose({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m4 4 8 8M12 4 4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconMore({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function IconPanelLeft({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.25"
        y="2.75"
        width="11.5"
        height="10.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M6.25 3.2v9.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function IconNote({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="2.75"
        width="9"
        height="10.5"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M6 6.2h4M6 8.6h4M6 11h2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconBook({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 4.35c1.05-.7 2.2-1.05 3.55-1.05H13.4v9.15h-1.7c-1.3 0-2.5.3-3.7 1.05-1.2-.75-2.4-1.05-3.7-1.05H2.6V3.3h1.85c1.35 0 2.5.35 3.55 1.05Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 4.35v9.15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconSettings({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 5.5h10M3 10.5h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle
        cx="6.4"
        cy="5.5"
        r="1.45"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle
        cx="9.6"
        cy="10.5"
        r="1.45"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  )
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.25v9.5M3.25 8h9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconSend({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 12.75v-9.5M4.5 6.75 8 3.25l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconStop({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="4.4"
        y="4.4"
        width="7.2"
        height="7.2"
        rx="1.35"
        fill="currentColor"
      />
    </svg>
  )
}

/** Breathing spark — AI busy mark (same as selection rewrite). */
export function IconAiProcessing({ size = 12 }: IconProps) {
  return (
    <svg
      className="selection-ai-spark"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden
    >
      <path
        className="selection-ai-spark-core"
        d="M7.2 1.2c.2-.6 1.4-.6 1.6 0l.85 2.7a1 1 0 0 0 .65.65l2.7.85c.6.2.6 1.4 0 1.6l-2.7.85a1 1 0 0 0-.65.65l-.85 2.7c-.2.6-1.4.6-1.6 0l-.85-2.7a1 1 0 0 0-.65-.65l-2.7-.85c-.6-.2-.6-1.4 0-1.6l2.7-.85a1 1 0 0 0 .65-.65z"
      />
      <path
        className="selection-ai-spark-dot"
        d="M13.15 2.05c.12-.35.78-.35.9 0l.32 1.02c.06.2.22.36.42.42l1.02.32c.35.12.35.78 0 .9l-1.02.32a.6.6 0 0 0-.42.42l-.32 1.02c-.12.35-.78.35-.9 0l-.32-1.02a.6.6 0 0 0-.42-.42l-1.02-.32c-.35-.12-.35-.78 0-.9l1.02-.32a.6.6 0 0 0 .42-.42z"
      />
    </svg>
  )
}

/** Thin arc spinner — currentColor, for ordinary (non-AI) busy states. */
export function IconSpinner({ size = 14 }: IconProps) {
  return (
    <svg
      className="cz-spinner"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="5.5"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1.5"
      />
      <circle
        className="cz-spinner-arc"
        cx="8"
        cy="8"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="10 24.5"
      />
    </svg>
  )
}

export function IconBold({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.5 3.25h5.1a2.6 2.6 0 0 1 0 5.2H4.5V3.25Zm0 5.2h5.55a2.75 2.75 0 1 1 0 5.5H4.5V8.45Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconItalic({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M7 3.25h5.25M4 12.75h5.25M9.4 3.25 6.6 12.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconStrike({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.25 8h7.5M10.4 4.4c-.7-.7-1.7-1.15-3.15-1.15-2.2 0-3.5 1.2-3.5 2.85 0 1.05.55 1.8 1.85 2.3M5.4 11.7c.75.7 1.8 1.1 3.2 1.1 2.25 0 3.65-1.25 3.65-2.95"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconInlineCode({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.1 4.5 2.75 8 6.1 11.5M9.9 4.5 13.25 8 9.9 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconLink({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.7 8.9a2.7 2.7 0 0 0 3.85 0l1.55-1.55a2.7 2.7 0 0 0-3.82-3.82L7.4 4.4M9.3 7.1a2.7 2.7 0 0 0-3.85 0L3.9 8.65a2.7 2.7 0 1 0 3.82 3.82L8.6 11.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
