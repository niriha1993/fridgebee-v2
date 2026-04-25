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

function normalizeItem(it: { item_name?: string; quantity?: number; unit?: string; category?: string; emoji?: string; price?: number; }) {
  const category = mapCategory(it.category);
  return {
    name: (it.item_name || '').trim(),
    qty: it.quantity ?? 1,
    unit: it.unit || 'pcs',
    category,
    emoji: it.emoji || '📦',
    shelf: guessShelf(category),
    expiry: expiryFromNow(expiryDaysFor(category)),
    // CRITICAL: keep the printed price the model OCR'd from the receipt.
    // Without this the client always fell through to estimatePrice ≈ $2.
    price: typeof it.price === 'number' && it.price > 0 ? it.price : undefined,
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
  // Prompt structure ported from the previous-generation fridgebee.app (mise) where
  // it was battle-tested. Two paths: full classifier prompt (default) and a
  // receipt-only retry prompt (used when the first call returns 0 items).
  if (isReceiptRetry) {
    return `This is a grocery receipt or order screenshot.
Read it like OCR and extract every FOOD or GROCERY line item with its EXACT printed price.

PRICE EXTRACTION — read each printed price digit-by-digit. Use the exact decimal as printed (e.g. 4.50, 14.50, 9.20). The line-item price is usually at the right edge of the same line as the item. On receipts that show "1 PCS@ 14.500    14.50" the SECOND number is the line total — use that. If a price is unclear, set price to 0 — DO NOT guess. Currency is ${currencyLabel}.

Return JSON:
{
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string, "price": number }
  ],
  "image_type": "receipt"
}

Rules:
- Ignore totals, GST, taxes, delivery, discounts, promos, and non-food items
- Normalize shorthand: "GRB GHEE 1LT" → "Ghee", "MEIJI FRESH MILK 2LT" → "Milk", "L/POOL PARMESAN" → "Parmesan", "NANAK PANEER CUBED 400G" → "Paneer", "IND/GAT CLAS BASMATI 2KG" → "Basmati Rice"
- If quantity is unclear, default to 1
- Better to return many likely grocery items than to miss obvious receipt lines

Return ONLY the JSON object — no markdown, no commentary.`;
  }
  return `You are a smart grocery scanner for a fridge inventory app. Identify ALL food and grocery items in this image.

This image could be:
- A receipt or order confirmation — extract every line item
- A grocery app screenshot (FoodPanda, GrabMart, Swiggy, Blinkit, Amazon Fresh, NTUC, etc.)
- A FRIDGE or pantry shelf photo — identify everything visible
- Items in PLASTIC BAGS, cling wrap, or containers — look through packaging

FRIDGE / SHELF PHOTO RULES (critical):
- Identify items even through plastic bags, cling wrap, or packaging
- Use visual cues: shape, colour, size, any visible text or logos on packaging
- Green leafy bundle in bag = vegetables (spinach/coriander/lettuce/herbs/methi)
- Red/orange round item = tomatoes or capsicum
- Yellow curved item = banana
- White liquid in clear bottle = milk
- Orange root vegetable = carrot
- Purple/white bulb = onion or garlic
- Brown wrapped parcel = meat or paneer
- Eggs in tray or bowl = eggs
- Clear bag with green = cucumber or zucchini
- Be GENEROUS — better to identify imprecisely than miss an item entirely
- If you see multiple items in one bag, list each separately

PRICE EXTRACTION:
- If RECEIPT or SCREENSHOT, use the ACTUAL printed price in ${currencyLabel}. Read digit-by-digit. The line-item price is at the right edge of the same line. On lines like "1 PCS@ 14.500    14.50" the SECOND number is the line total — use that. If unclear, set price to 0.
- If FRIDGE PHOTO, estimate realistic ${currencyLabel} retail price for that quantity at supermarket level (FairPrice/RedMart for SG, BigBasket/Blinkit for IN, US chains for US). If unsure, set price to 0 rather than guess wildly.

Return JSON:
{
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string, "price": number }
  ],
  "store": string | null,
  "image_type": "receipt" | "screenshot" | "fridge_photo" | "other"
}

Rules:
- item_name: clean title-case singular (e.g. "Fresh Spinach", "Whole Milk", "Chicken Breast")
- quantity: numeric, default 1 if unclear
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen" | "box"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- Skip non-food items, delivery fees, totals, GST, taxes, and promotions

If nothing identifiable: { "items": [], "store": null, "image_type": "other" }
Return ONLY the JSON object — no markdown, no commentary.`;
}

async function runWithAnthropic(base64: string, mime: string, prompt: string) {
  // Sonnet 4.6 over Haiku 4.5 for scan: Haiku misses small receipt prices,
  // Sonnet OCRs them digit-accurately. Cost difference is ~$0.004 per scan
  // (negligible) for vastly better receipt-price fidelity.
  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mediaType = supported.includes(mime) ? mime : 'image/jpeg';
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
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
      return NextResponse.json({ error: details || 'Could not scan this image', primaryError, retryError }, { status: 422 });
    }

    // Diagnostic — exposes which provider ran, what image type was classified,
    // and how many items had real prices. Helpful when the user reports "scan
    // gave me $2 for everything" — we can see whether the model returned 0s
    // (and we fell back to estimate) or if it returned real numbers.
    const itemsWithRealPrice = items.filter(i => typeof (i as { cost?: number; price?: number }).price === 'number' && ((i as { price?: number }).price ?? 0) > 0).length;
    return NextResponse.json({
      items,
      image_type: content.image_type || 'other',
      _debug: {
        provider: ANTHROPIC_KEY ? 'claude-sonnet-4-6' : (OPENAI_KEY ? 'gpt-4o' : 'none'),
        detectedKeys: { anthropic: !!ANTHROPIC_KEY, openai: !!OPENAI_KEY },
        items_with_real_price: itemsWithRealPrice,
        items_total: items.length,
      },
    });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed' }, { status: 500 });
  }
}
