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
  const submit = page.getByRole('button', { name: '进入工作台' })
  // SSR renders the form before React hydrates. Clicking too early does a
  // native GET to `/login?` and never calls loginFn (common on cold CI Vite).
  await expect(submit).toBeEnabled()
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await submit.click()
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  } catch (error) {
    const alert = await page
      .getByRole('alert')
      .textContent()
      .catch(() => null)
    throw new Error(
      `Login stayed on ${page.url()}${alert ? ` (${alert.trim()})` : ''}`,
      { cause: error },
    )
  }
}

export async function openBlankDraft(page: Page, ideaName: string) {
  await page.goto('/ideas')
  const newIdea = page.getByRole('link', { name: '新想法' })
  const nameField = page.getByLabel('名称', { exact: true })
  await expect(newIdea.or(nameField)).toBeVisible()
  if (!(await nameField.isVisible())) {
    await newIdea.click()
  }
  await expect(page).toHaveURL(/\/ideas\/new/)
  await expect(nameField).toBeEnabled()
  await nameField.fill(ideaName)
  const create = page.getByRole('button', { name: '开始' })
  await expect(create).toBeEnabled()
  await create.click()
  await expect(page.getByRole('heading', { name: ideaName })).toBeVisible()
  await page.getByRole('tab', { name: '正文' }).click()
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
  // Decoration.replace hides delimiters from innerText; read the CM document.
  const fromHook = await page
    .locator('.cm-shell')
    .evaluate((el) => {
      const get = (el as { __czGetContent?: () => string }).__czGetContent
      return get ? get() : null
    })
    .catch(() => null)
  if (fromHook != null) return fromHook
  return editorContent(page).innerText()
}

export async function waitUntilSaved(page: Page) {
  await expect(page.locator('.badge', { hasText: '已保存' })).toBeVisible({
    timeout: 20_000,
  })
}
