import 'dotenv/config';

export interface Settings {
  apiKey: string;
  model: string;
  baseURL: string;
}

export function loadSettings(): Settings {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPSEEK_API_KEY is not set. Copy .env.example to .env and fill it in, ' +
        'or export it in your shell.',
    );
  }
  return {
    apiKey,
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  };
}
