import { expect, test } from '@playwright/test'

import { login } from './helpers'

test('settings page only offers gpt, grok, and deepseek', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(page.getByText('目前只兼容 GPT、Grok、DeepSeek')).toBeVisible()

  const gpt = page.getByRole('radio', { name: 'GPT' })
  const grok = page.getByRole('radio', { name: 'Grok' })
  const deepseek = page.getByRole('radio', { name: 'DeepSeek' })
  await expect(gpt).toBeVisible()
  await expect(grok).toBeVisible()
  await expect(deepseek).toBeVisible()

  await grok.click()
  await expect(page.getByRole('combobox').first()).toHaveValue('grok-4')

  await deepseek.click()
  await expect(page.getByRole('combobox').first()).toHaveValue('deepseek-chat')

  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('status')).toHaveText('已保存')
})
