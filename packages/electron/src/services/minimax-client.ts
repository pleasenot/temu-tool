import { dbGet } from './database';

const MINIMAX_API_BASE = 'https://api.minimaxi.chat/v1';

interface ImageGenerationResult {
  imageUrl: string;
  taskId: string;
}

/**
 * MiniMax API client for image generation
 */
export class MiniMaxClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.apiKey = apiKey;
    } else {
      const row = dbGet("SELECT value FROM settings WHERE key = 'minimax_api_key'");
      this.apiKey = row?.value || '';
    }
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
