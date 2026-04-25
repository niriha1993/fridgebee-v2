import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

// Accept either ANTHROPIC_API_KEY (SDK standard) or Claude_API_Key (user-named).
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.Claude_API_Key || process.env.CLAUDE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

function mapCategory(category?: string) {
  switch ((category || '').toLowerCase()) {
    case 'protein': return 'Meat';
    case 'beverages': return 'Drinks';
    default:
      if (!category) return 'Other';
      return category.replace(/^./, c => c.toUpperCase());
  }
}

function guessShelf(category: string) {
  if (['Dairy', 'Meat', 'Seafood', 'Frozen', 'Drinks'].includes(category)) return 'fridge';
  if (['Grains', 'Snacks', 'Condiments', 'Other'].includes(category)) return 'pantry';
  return 'fridge';
}

function expiryDaysFor(category: string) {
  if (category === 'Meat') return 3;
  if (category === 'Seafood') return 2;
  if (category === 'Grains' || category === 'Condiments') return 180;
  if (category === 'Frozen') return 90;
  return 7;
}

function expiryFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeItem(it: { item_name?: string; quantity?: number; unit?: string; category?: string; emoji?: string; }) {
  const category = mapCategory(it.category);
  return {
    name: (it.item_name || '').trim(),
    qty: it.quantity ?? 1,
    unit: it.unit || 'pcs',
    category,
    emoji: it.emoji || '📦',
    shelf: guessShelf(category),
    expiry: expiryFromNow(expiryDaysFor(category)),
  };
}

function extractJsonObject(raw: string) {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Scanner returned unreadable JSON');
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

function buildPrompt(currencyLabel: string, isReceiptRetry: boolean) {
  if (isReceiptRetry) {
    return `This is likely a grocery receipt or order screenshot.
Read it like OCR and extract every FOOD or GROCERY line item you can find.

Return JSON:
{
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string, "price": number }
  ],
  "image_type": "receipt"
}

Rules:
- Ignore totals, taxes, delivery, discounts, promos, and non-food items
- If the receipt shows shorthand names, normalize them to clear shopper-friendly food names
- If quantity is unclear, default to 1
- Use prices printed on the receipt when visible in ${currencyLabel}
- It is better to return many likely grocery items than to miss obvious receipt lines

Return ONLY the JSON object — no markdown, no commentary.`;
  }
  return `You are a smart grocery scanner for a fridge inventory app. Identify ALL food and grocery items in this image.

This image could be:
- A receipt or order confirmation — extract every line item
- A grocery app screenshot
- A fridge or pantry shelf photo
- Items in plastic bags, cling wrap, or containers

For shelf and fridge photos:
- Identify items even through plastic bags, cling wrap, or packaging
- Use visual cues like shape, colour, size, and visible text on packaging.
- Be generous and practical. It is better to identify likely grocery items than miss them.
- If you see multiple groceries in one bag, list each separately.

Return JSON:
{
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string, "price": number }
  ],
  "image_type": "receipt" | "screenshot" | "fridge_photo" | "other"
}

Rules:
- item_name: clean title-case singular
- quantity: numeric, default 1 if unclear
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen" | "box"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- If this is a receipt or grocery screenshot, use the actual printed item price in ${currencyLabel} when possible.
Skip delivery fees, totals, promotions, and non-food items.

Return ONLY the JSON object — no markdown, no commentary.`;
}

async function runWithAnthropic(base64: string, mime: string, prompt: string) {
  // Anthropic Messages API supports image input. Cast mime to the SDK union.
  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mediaType = supported.includes(mime) ? mime : 'image/jpeg';
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1800,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? '';
  if (!raw) throw new Error('Scanner returned an empty response');
  return extractJsonObject(raw);
}

async function runWithOpenAI(base64: string, mime: string, prompt: string, useJsonMode = true) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1800,
      ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: useJsonMode ? 'high' : 'auto' } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || 'Scan request failed');
  }
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.message?.refusal ?? '';
  if (!raw) throw new Error('Scanner returned an empty response');
  return extractJsonObject(raw);
}

async function runVisionPrompt(base64: string, mime: string, prompt: string, isReceiptRetry: boolean) {
  // Try Anthropic first if available; fall back to OpenAI.
  if (ANTHROPIC_KEY) {
    try {
      return await runWithAnthropic(base64, mime, prompt);
    } catch (e) {
      // If Anthropic fails (quota, parse error, network), fall through to OpenAI.
      if (!OPENAI_KEY) throw e;
    }
  }
  if (OPENAI_KEY) {
    return await runWithOpenAI(base64, mime, prompt, !isReceiptRetry);
  }
  throw new Error('Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured.');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = (formData.get('image') as File | null) || (formData.get('file') as File | null);
    const dietary = JSON.parse((formData.get('dietary') as string) ?? '{}');
    const country = (dietary.country ?? 'IN') as 'IN'|'SG'|'US';
    const currencyLabel = country === 'SG' ? 'SGD' : country === 'US' ? 'USD' : 'INR';
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    if (!ANTHROPIC_KEY && !OPENAI_KEY) {
      return NextResponse.json({ error: 'AI vision is offline — set ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel project settings.' }, { status: 500 });
    }

    const bytes = await image.arrayBuffer();
    if (!bytes.byteLength) return NextResponse.json({ error: 'Uploaded image is empty' }, { status: 400 });
    const base64 = Buffer.from(bytes).toString('base64');
    const mime = image.type || 'image/jpeg';
    if (mime === 'image/heic' || mime === 'image/heif') {
      return NextResponse.json({ error: 'Please upload a JPG or PNG copy of this photo' }, { status: 400 });
    }

    let content: { items?: unknown[]; image_type?: string } = { items: [], image_type: 'other' };
    let items: Array<{ name: string } & Record<string, unknown>> = [];
    const rawItems = (value: unknown) => Array.isArray(value) ? value as Array<{ item_name?: string; quantity?: number; unit?: string; category?: string; emoji?: string; }> : [];
    let primaryError = '';
    let retryError = '';

    try {
      content = await runVisionPrompt(base64, mime, buildPrompt(currencyLabel, false), false);
      items = rawItems(content.items).map(normalizeItem).filter((item: { name: string }) => item.name);
    } catch (error) {
      primaryError = error instanceof Error ? error.message : 'Primary scan failed';
    }

    if (!items.length) {
      try {
        content = await runVisionPrompt(base64, mime, buildPrompt(currencyLabel, true), true);
        items = rawItems(content.items).map(normalizeItem).filter((item: { name: string }) => item.name);
      } catch (error) {
        retryError = error instanceof Error ? error.message : 'Receipt retry failed';
      }
    }

    if (!items.length && (primaryError || retryError)) {
      const details = [primaryError, retryError].filter(Boolean).join(' | ');
      return NextResponse.json({ error: details || 'Could not scan this image' }, { status: 422 });
    }

    return NextResponse.json({ items, image_type: content.image_type || 'other' });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed' }, { status: 500 });
  }
}
