import { Decoration, WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'

import { selectImageInView } from './image-select'

export class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly from: number,
    readonly to: number,
    readonly selected: boolean,
  ) {
    super()
  }

  eq(other: ImageWidget) {
    return (
      this.url === other.url &&
      this.alt === other.alt &&
      this.from === other.from &&
      this.to === other.to &&
      this.selected === other.selected
    )
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = this.selected ? 'cz-md-image is-selected' : 'cz-md-image'
    wrap.setAttribute('contenteditable', 'false')

    if (this.url.startsWith('uploading:')) {
      wrap.classList.add('is-uploading')
      wrap.textContent = '上传中'
      return wrap
    }

    const img = document.createElement('img')
    img.src = this.url
    img.alt = this.alt
    img.draggable = false
    wrap.appendChild(img)
    this.bindSelect(wrap, view)
    return wrap
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    if (this.url.startsWith('uploading:')) return false
    const img = dom.querySelector('img')
    if (!img || img.getAttribute('src') !== this.url) return false
    img.alt = this.alt
    dom.className = this.selected ? 'cz-md-image is-selected' : 'cz-md-image'
    this.bindSelect(dom, view)
    return true
  }

  private bindSelect(wrap: HTMLElement, view: EditorView) {
    const select = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      selectImageInView(view, { from: this.from, to: this.to })
    }
    wrap.onpointerdown = select
    wrap.onmousedown = select
    wrap.ondblclick = (event) => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({
        selection: { anchor: this.from + 2 },
        scrollIntoView: true,
      })
      view.focus()
    }
  }

  ignoreEvent() {
    return true
  }
}

export function imageReplace(range: {
  url: string
  alt: string
  from: number
  to: number
  selected?: boolean
}) {
  return Decoration.replace({
    widget: new ImageWidget(
      range.url,
      range.alt,
      range.from,
      range.to,
      Boolean(range.selected),
    ),
    block: false,
  })
}
