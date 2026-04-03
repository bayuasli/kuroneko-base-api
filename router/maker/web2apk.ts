import { Request, Response } from 'express'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'https://webappcreator.amethystlab.org'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': BASE_URL,
  'Referer': BASE_URL + '/'
}

function generatePackageName(appName: string): string {
  const cleaned = appName.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `com.${cleaned}.app`
}

export default async function (req: Request, res: Response) {
  const { url, name, package: pkg, version = '1.0.0', icon } = req.query as Record<string, string>

  if (!url) return res.json({ status: false, message: 'Parameter "url" wajib diisi' })
  if (!name) return res.json({ status: false, message: 'Parameter "name" wajib diisi' })
  if (!icon) return res.json({ status: false, message: 'Parameter "icon" wajib diisi (URL gambar)' })

  const tmpDir = './tmp'
  fs.mkdirSync(tmpDir, { recursive: true })
  const iconPath = path.join(tmpDir, `icon-${Date.now()}.jpg`)

  try {
    
    const iconRes = await axios.get(icon, { responseType: 'arraybuffer' })
    fs.writeFileSync(iconPath, Buffer.from(iconRes.data))

    const packageName = pkg || generatePackageName(name)

    const form = new FormData()
    form.append('websiteUrl', url)
    form.append('appName', name)
    form.append('icon', fs.createReadStream(iconPath))
    form.append('packageName', packageName)
    form.append('versionName', version)
    form.append('versionCode', '1')

    const { data } = await axios.post(`${BASE_URL}/api/build-apk`, form, {
      headers: { ...HEADERS, ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })

    if (!data.success) return res.json({ status: false, message: data.message || 'Gagal build APK' })

    const downloadUrl = `${BASE_URL}${data.downloadUrl}`

    return res.json({
      status: true,
      result: {
        appName: name,
        package: packageName,
        version,
        url,
        download: downloadUrl
      }
    })
  } catch (e: any) {
    return res.json({ status: false, message: e.message })
  } finally {
    if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath)
  }
}