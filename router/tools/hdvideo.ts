import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function makeHeaders(extra: object = {}) {
  const SERIAL = crypto.createHash('md5').update(UA + Date.now()).digest('hex');
  return Object.assign({
    'accept': '*/*',
    'product-serial': SERIAL,
    'user-agent': UA,
    'Referer': 'https://unblurimage.ai/'
  }, extra);
}

export default async function (req: Request, res: Response) {
  try {
    const { url, resolution = '2k' } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: 'Parameter "url" wajib diisi.',
        example: '/api/tools/hdvideo?url=https://example.com/video.mp4&resolution=2k'
      });
    }

    const validRes = ['1080p', '2k', '4k'];
    if (!validRes.includes(String(resolution))) {
      return res.status(400).json({
        status: false,
        message: `Parameter "resolution" tidak valid. Pilihan: ${validRes.join(', ')}`
      });
    }

    // Download video dari URL
    const videoRes = await axios.get(String(url), {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': UA }
    });

    const contentType = videoRes.headers['content-type'] || '';
    if (!contentType.includes('video')) {
      return res.status(400).json({ status: false, message: 'URL bukan video yang valid.' });
    }

    const videoBuffer = Buffer.from(videoRes.data);
    const fileName = crypto.randomBytes(3).toString('hex') + '_video.mp4';

    // Step 1: Register upload
    const formReg = new FormData();
    formReg.append('video_file_name', fileName);

    const reg = await axios.post(
      'https://api.unblurimage.ai/api/upscaler/v1/ai-video-enhancer/upload-video',
      formReg,
      { headers: { ...makeHeaders(), ...formReg.getHeaders() } }
    );

    const { url: ossUrl, object_name: objectName } = reg.data.result;

    // Step 2: Upload video ke OSS
    await axios.put(ossUrl, videoBuffer, {
      headers: { 'Content-Type': 'video/mp4', 'User-Agent': UA }
    });

    // Step 3: Create job
    const formJob = new FormData();
    formJob.append('original_video_file', `https://cdn.unblurimage.ai/${objectName}`);
    formJob.append('resolution', String(resolution));
    formJob.append('is_preview', 'false');

    const create = await axios.post(
      'https://api.unblurimage.ai/api/upscaler/v2/ai-video-enhancer/create-job',
      formJob,
      { headers: { ...makeHeaders(), ...formJob.getHeaders() } }
    );

    const jobId = create.data.result?.job_id;
    if (!jobId) throw new Error('Gagal membuat job pemrosesan.');

    // Step 4: Polling hasil
    let outputUrl: string | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const check = await axios.get(
        `https://api.unblurimage.ai/api/upscaler/v2/ai-video-enhancer/get-job/${jobId}`,
        { headers: makeHeaders() }
      );
      if (check.data.result?.output_url) {
        outputUrl = check.data.result.output_url;
        break;
      }
    }

    if (!outputUrl) throw new Error('Proses timeout, coba lagi nanti.');

    res.json({
      status: true,
      result: {
        download: outputUrl,
        resolution: String(resolution),
        originalUrl: String(url)
      }
    });

  } catch (err: any) {
    res.status(500).json({
      status: false,
      message: 'Gagal proses video: ' + (err.message || 'Unknown error')
    });
  }
}
