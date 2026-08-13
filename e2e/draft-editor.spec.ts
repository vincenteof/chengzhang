import { expect, test } from '@playwright/test'

import {
  login,
  openBlankDraft,
  readEditorText,
  typeInEditor,
  waitUntilSaved,
} from './helpers'

test.describe('draft editor Phase 0–1 gates', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('autosave does not drop text typed during a save', async ({ page }) => {
    const stamp = Date.now()
    await openBlankDraft(page, `e2e-save-${stamp}`)

    const first = `SAVE_A_${stamp}`
    const second = `SAVE_B_${stamp}`
    await typeInEditor(page, first, 5)
    await expect(page.locator('.badge', { hasText: '未保存' })).toBeVisible()
    // Keep typing while debounce/save is in flight
    await typeInEditor(page, `\n${second}`, 4)
    await waitUntilSaved(page)

    await page.reload()
    await expect(page.locator('.cm-content')).toBeVisible()
    const text = await readEditorText(page)
    expect(text).toContain(first)
    expect(text).toContain(second)
  })

  test('layout/source mode switch keeps markdown bytes', async ({ page }) => {
    const stamp = Date.now()
    await openBlankDraft(page, `e2e-mode-${stamp}`)

    const markdown = `# 标题 ${stamp}\n\n一段 **加粗** 与列表：\n\n- 甲\n- 乙\n`
    await typeInEditor(page, markdown, 6)
    await waitUntilSaved(page)
    const before = normalizeEditorText(await readEditorText(page))

    const layout = page.getByRole('button', { name: '排版' })
    const source = page.getByRole('button', { name: '源码' })
    for (let i = 0; i < 6; i++) {
      await source.click()
      await expect(source).toHaveAttribute('aria-pressed', 'true')
      await layout.click()
      await expect(layout).toHaveAttribute('aria-pressed', 'true')
    }

    const after = normalizeEditorText(await readEditorText(page))
    expect(after).toBe(before)
    expect(after).toContain(`# 标题 ${stamp}`)
    expect(after).toContain('**加粗**')
  })

  test('selection AI accept can be undone once', async ({ page }) => {
    const stamp = Date.now()
    await openBlankDraft(page, `e2e-ai-${stamp}`)

    const original = `非常非常好 ${stamp}`
    await typeInEditor(page, original, 8)
    await waitUntilSaved(page)

    const cm = page.locator('.cm-content')
    await cm.click()
    await page.keyboard.press('ControlOrMeta+A')

    const polish = page.getByRole('button', { name: '润色' })
    await expect(polish).toBeVisible({ timeout: 8_000 })
    await polish.click()

    const accept = page.getByRole('button', { name: '接受并替换' })
    await expect(accept).toBeVisible({ timeout: 20_000 })
    await accept.click()
    await expect(page.getByText('已应用选区 AI')).toBeVisible()

    const afterAccept = await readEditorText(page)
    expect(afterAccept).toContain(`很好 ${stamp}`)
    expect(afterAccept).not.toContain('非常非常')

    await page.getByRole('button', { name: '撤销 AI' }).click()
    const afterUndo = await readEditorText(page)
    expect(afterUndo).toContain(original)
  })
})

function normalizeEditorText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '\n')
}
