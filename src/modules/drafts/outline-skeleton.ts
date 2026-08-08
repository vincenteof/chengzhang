import type { Outline } from '#/server/db/schema'

/** Markdown skeleton from outline so Draft is never a blank page after structure accept. */
export function outlineToMarkdownSkeleton(input: {
  outline: Outline
  confirmedClaim?: string | null
}): string {
  const { outline } = input
  const claim = input.confirmedClaim?.trim()
  const lines: string[] = []

  lines.push(`# ${outline.title || '未命名草稿'}`, '')

  if (outline.approach?.trim()) {
    lines.push(`> 结构思路：${outline.approach.trim()}`, '')
  }

  if (claim) {
    lines.push('## 中心主张', '', claim, '')
  }

  if (outline.sections.length === 0) {
    lines.push(
      '## 正文',
      '',
      '（当前结构还没有章节。可在左侧编辑结构，或直接在此写作。）',
      '',
    )
    return lines.join('\n')
  }

  for (const section of outline.sections) {
    lines.push(`## ${section.title || '未命名章节'}`, '')
    if (section.purpose?.trim()) {
      lines.push(`*本章目的：${section.purpose.trim()}*`, '')
    }
    if (section.fragmentIds.length > 0) {
      lines.push(
        `建议使用素材：${section.fragmentIds.map((id) => `\`${id}\``).join('、')}`,
        '',
      )
    }
    if (section.missingMaterial.length > 0) {
      lines.push(
        ...section.missingMaterial.map((m) => `【待补：${m}】`),
        '',
      )
    } else {
      lines.push('（在此展开本章内容）', '')
    }
  }

  lines.push(
    '---',
    '',
    '_可直接改写以上骨架；也可用「AI 生成初稿」在保留结构的前提下写出第一版正文。_',
    '',
  )

  return lines.join('\n')
}
