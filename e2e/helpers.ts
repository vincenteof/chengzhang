import { expect, type Page } from '@playwright/test'

export function e2eCredentials() {
  const email = process.env.E2E_EMAIL || process.env.AUTH_ALLOWED_EMAIL
  const password = process.env.E2E_PASSWORD || process.env.AUTH_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Set AUTH_ALLOWED_EMAIL + AUTH_PASSWORD (or E2E_EMAIL + E2E_PASSWORD) for e2e login',
    )
  }
  return { email, password }
}

export async function login(page: Page) {
  const { email, password } = e2eCredentials()
  await page.goto('/login')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '进入工作台' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

export async function openBlankDraft(page: Page, ideaName: string) {
  await page.goto('/ideas')
  await page.getByPlaceholder('名称（必填）').fill(ideaName)
  await page.getByRole('button', { name: '创建' }).click()
  await expect(page.getByRole('status')).toContainText(`已创建 ${ideaName}`)
  await page.getByRole('link', { name: ideaName, exact: true }).click()
  await expect(page.getByRole('heading', { name: ideaName })).toBeVisible()
  await page.getByRole('button', { name: '空白草稿' }).click()
  await page.waitForURL(/\/drafts\//)
  await expect(page.locator('.cm-content')).toBeVisible()
}

export function editorContent(page: Page) {
  return page.locator('.cm-content')
}

export async function typeInEditor(page: Page, text: string, delay = 8) {
  const cm = editorContent(page)
  await cm.click()
  await page.keyboard.type(text, { delay })
}

export async function readEditorText(page: Page) {
  return editorContent(page).innerText()
}

export async function waitUntilSaved(page: Page) {
  await expect(page.locator('.badge', { hasText: '已保存' })).toBeVisible({
    timeout: 20_000,
  })
}
