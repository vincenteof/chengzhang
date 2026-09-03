import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'

import { contentDisposition } from './bundle.service'
import {
  collectLocalMediaIds,
  localMediaExportPath,
  rewriteLocalMediaUrls,
} from './local-media'
import { zipExportFolder } from './zip'

const ID = 'img_01234567-89ab-7cde-8f01-23456789abcd'

describe('collectLocalMediaIds', () => {
  it('collects relative and absolute in-app image urls once', () => {
    const md = [
      `![a](/api/media/${ID})`,
      `![b](http://localhost:3000/api/media/${ID})`,
      `![c](https://chengzhang.example/api/media/${ID})`,
      '![d](https://cdn.example/pic.png)',
    ].join('\n')

    expect(collectLocalMediaIds(md)).toEqual([ID])
  })

  it('ignores uploading placeholders and unrelated paths', () => {
    expect(
      collectLocalMediaIds('![上传中](uploading:up_1)\n![x](/api/other/x)'),
    ).toEqual([])
  })
})

describe('rewriteLocalMediaUrls', () => {
  it('rewrites local urls to relative media paths', () => {
    const md = `![封面](/api/media/${ID})\n\n![再](https://host/api/media/${ID})`
    const out = rewriteLocalMediaUrls(md, (id) =>
      localMediaExportPath(id, 'png'),
    )
    expect(out).toBe(`![封面](./media/${ID}.png)\n\n![再](./media/${ID}.png)`)
    expect(out).not.toContain('/api/media/')
  })
})

describe('contentDisposition', () => {
  it('emits an ascii fallback and a utf-8 filename', () => {
    const header = contentDisposition('标题.zip')
    expect(header).toContain('filename="export.zip"')
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('标题.zip')}`,
    )
  })
})

describe('zipExportFolder', () => {
  it('nests markdown and images in one folder', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const zipped = zipExportFolder({
      stem: 'hello',
      markdown: `![图](./media/${ID}.png)\n`,
      media: [{ filename: `${ID}.png`, bytes: png }],
    })
    const files = unzipSync(zipped)
    expect(strFromU8(files['hello/hello.md']!)).toContain(`./media/${ID}.png`)
    expect(files[`hello/media/${ID}.png`]).toEqual(png)
  })
})
