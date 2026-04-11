const MINIMAX_API_BASE = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1';
const MINIMAX_TEXT_MODEL = process.env.MINIMAX_TEXT_MODEL || 'M2.7-highspeed';

interface ImageGenerationResult {
  imageUrl: string;
  taskId: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * MiniMax API client for image generation and text completion.
 * The API key comes from MINIMAX_API_KEY in packages/electron/.env
 * (loaded by `import 'dotenv/config'` in main.ts).
 */
export class MiniMaxClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY 未配置，请在 packages/electron/.env 中设置');
    }
  }

  /**
   * Text completion via MiniMax chat API.
   * Used for title rewriting with trending keywords.
   */
  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${MINIMAX_API_BASE}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MINIMAX_TEXT_MODEL,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new Error(`MiniMax 鉴权失败 (${response.status}): API key 无效或已过期`);
      }
      if (response.status === 429) {
        throw new Error('MiniMax 限流 (429)，请稍后重试');
      }
      throw new Error(`MiniMax API 错误 ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`MiniMax 返回为空: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return content.trim();
  }

  /**
   * Generate an image from text prompt
   */
  async textToImage(prompt: string, options?: {
    aspectRatio?: string;
    width?: number;
    height?: number;
  }): Promise<ImageGenerationResult> {
    const response = await fetch(`${MINIMAX_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'image-01',
        prompt,
        aspect_ratio: options?.aspectRatio || '1:1',
        width: options?.width,
        height: options?.height,
        n: 1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return {
      imageUrl: data.data?.[0]?.url || data.data?.[0]?.b64_json,
      taskId: data.id || '',
    };
  }

  /**
   * Generate image with subject reference (image-to-image)
   */
  async imageToImage(
    prompt: string,
    referenceImageUrl: string,
    options?: {
      aspectRatio?: string;
    }
  ): Promise<ImageGenerationResult> {
    const response = await fetch(`${MINIMAX_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'image-01',
        prompt,
        aspect_ratio: options?.aspectRatio || '1:1',
        subject_reference: [
          {
            type: 'character',
            image_url: referenceImageUrl,
          },
        ],
        n: 1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return {
      imageUrl: data.data?.[0]?.url || data.data?.[0]?.b64_json,
      taskId: data.id || '',
    };
  }
}
