import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://webappcreator.amethystlab.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': BASE_URL,
  'Referer': BASE_URL + '/'
};

function generatePackageName(appName: string): string {
  const cleaned = appName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `com.${cleaned}.app`;
}

async function buildApk(
  websiteUrl: string,
  appName: string,
  iconBuffer: Buffer,
  packageName: string,
  versionName: string = '1.0.0',
  versionCode: number = 1
) {
  const tmpDir = './tmp';
  fs.mkdirSync(tmpDir, { recursive: true });
  const iconPath = path.join(tmpDir, `icon-${Date.now()}.jpg`);
  fs.writeFileSync(iconPath, iconBuffer);

  try {
    const form = new FormData();
    form.append('websiteUrl', websiteUrl);
    form.append('appName', appName);
    form.append('icon', fs.createReadStream(iconPath));
    form.append('packageName', packageName || generatePackageName(appName));
    form.append('versionName', versionName);
    form.append('versionCode', String(versionCode));

    const { data } = await axios.post(`${BASE_URL}/api/build-apk`, form, {
      headers: { ...HEADERS, ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (data.success) data.fullDownloadUrl = `${BASE_URL}${data.downloadUrl}`;
    return data;
  } finally {
    fs.unlinkSync(iconPath);
  }
}

export default async function (req: Request, res: Response) {
  try {
    const { url, appName, packageName, versionName = '1.0.0', iconUrl } = req.query;

    if (!url || !appName) {
      return res.status(400).json({
        status: false,
        message: 'Parameter "url" dan "appName" wajib diisi.',
        example: '/api/maker/web2apk?url=https://youtube.com&appName=YouTube Pro&packageName=com.yt.pro&versionName=1.0.0&iconUrl=https://example.com/icon.jpg'
      });
    }

    if (!iconUrl) {
      return res.status(400).json({
        status: false,
        message: 'Parameter "iconUrl" wajib diisi. Berikan URL gambar icon (JPG/PNG).'
      });
    }

    // Download icon dari URL
    const iconRes = await axios.get(String(iconUrl), {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': HEADERS['User-Agent'] }
    });

    const iconBuffer = Buffer.from(iconRes.data);
    const resolvedPackage = String(packageName || generatePackageName(String(appName)));

    const result = await buildApk(
      String(url),
      String(appName),
      iconBuffer,
      resolvedPackage,
      String(versionName)
    );

    if (!result.success) {
      return res.status(400).json({
        status: false,
        message: result.message || 'Gagal build APK.'
      });
    }

    res.json({
      status: true,
      result: {
        appName: String(appName),
        packageName: resolvedPackage,
        versionName: String(versionName),
        websiteUrl: String(url),
        download: result.fullDownloadUrl
      }
    });

  } catch (err: any) {
    res.status(500).json({
      status: false,
      message: 'Gagal memproses request: ' + (err.message || 'Unknown error')
    });
  }
}
