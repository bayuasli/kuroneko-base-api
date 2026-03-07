import { Request, Response } from 'express';
import axios from 'axios';

// Meme subreddits pool
const memeSubreddits = [
  'memes', 'dankmemes', 'me_irl', 'funny',
  'AdviceAnimals', 'terriblefacebookmemes', 'ComedyCemetery'
];

export default async function (req: Request, res: Response) {
  try {
    const { subreddit } = req.query;

    const sub = subreddit
      ? String(subreddit)
      : memeSubreddits[Math.floor(Math.random() * memeSubreddits.length)];

    const response = await axios.get(`https://meme-api.com/gimme/${sub}`, {
      timeout: 8000
    });

    const data = response.data;

    if (!data || data.nsfw) {
      return res.json({
        status: false,
        message: 'Meme tidak tersedia atau mengandung konten NSFW, coba lagi.'
      });
    }

    res.json({
      status: true,
      result: {
        title: data.title,
        url: data.url,
        subreddit: data.subreddit,
        author: data.author,
        upvotes: data.ups,
        postLink: data.postLink,
        preview: data.preview?.[data.preview.length - 1] || data.url
      }
    });
  } catch (err: any) {
    if (err.response?.status === 404) {
      return res.status(404).json({ status: false, message: 'Subreddit tidak ditemukan.' });
    }
    res.status(500).json({ status: false, message: 'Gagal mengambil meme, coba lagi.' });
  }
}
