export type InplaceCapability = {
  articleChrome: boolean
  hideDelimiters: boolean
  bulletWidget: boolean
  imageWidget: boolean
  aiInlineDiff: boolean
}

const OFF: InplaceCapability = {
  articleChrome: false,
  hideDelimiters: false,
  bulletWidget: false,
  imageWidget: false,
  aiInlineDiff: false,
}

function isCoarsePointer(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false
  }
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Phase 2: hide short delimiters on fine-pointer (desktop) inplace only.
 * Mobile replace stays off until §14.2 (Phase 3).
 */
export function resolveInplaceCapability(input: {
  mode: 'inplace' | 'source'
}): InplaceCapability {
  if (input.mode !== 'inplace') return OFF
  return {
    articleChrome: true,
    hideDelimiters: !isCoarsePointer(),
    bulletWidget: !isCoarsePointer(),
    imageWidget: !isCoarsePointer(),
    aiInlineDiff: !isCoarsePointer(),
  }
}
