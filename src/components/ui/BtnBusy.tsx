import type { ReactNode } from 'react'

import { IconSpinner } from '#/components/ui/icons'

/** Keep the action name; show a spinner beside it while work is in flight. */
export function BtnBusy({
  busy,
  children,
}: {
  busy: boolean
  children: ReactNode
}) {
  return (
    <>
      {busy ? <IconSpinner /> : null}
      {children}
    </>
  )
}
