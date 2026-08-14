import { Annotation } from '@codemirror/state'

import type { TransactionSource } from '../editor-types'

export const sourceAnnotation = Annotation.define<TransactionSource>()
