import { NextRequest, NextResponse } from 'next/server';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

const KNOWN_ITEMS: Array<{ alias: string; canonical: string; qty: number; unit: string; category: string; emoji: string }> = [
  { alias: 'bhindi', canonical: 'Bhindi', qty: 500, unit: 'g', category: 'Produce', emoji: '🫛' },
  { alias: 'okra', canonical: 'Okra', qty: 500, unit: 'g', category: 'Produce', emoji: '🫛' },
  { alias: 'pumpkin', canonical: 'Pumpkin', qty: 1, unit: 'kg', category: 'Produce', emoji: '🎃' },
  { alias: 'kaddu', canonical: 'Pumpkin', qty: 1, unit: 'kg', category: 'Produce', emoji: '🎃' },
  { alias: 'gobhi', canonical: 'Gobhi', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'cauliflower', canonical: 'Cauliflower', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'onion', canonical: 'Onion', qty: 500, unit: 'g', category: 'Produce', emoji: '🧅' },
  { alias: 'pyaaz', canonical: 'Onion', qty: 500, unit: 'g', category: 'Produce', emoji: '🧅' },
  { alias: 'tomato', canonical: 'Tomato', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍅' },
  { alias: 'tamatar', canonical: 'Tomato', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍅' },
  { alias: 'potato', canonical: 'Potato', qty: 1, unit: 'kg', category: 'Produce', emoji: '🥔' },
  { alias: 'aloo', canonical: 'Potato', qty: 1, unit: 'kg', category: 'Produce', emoji: '🥔' },
  { alias: 'carrot', canonical: 'Carrot', qty: 500, unit: 'g', category: 'Produce', emoji: '🥕' },
  { alias: 'gajar', canonical: 'Carrot', qty: 500, unit: 'g', category: 'Produce', emoji: '🥕' },
  { alias: 'milk', canonical: 'Milk', qty: 1, unit: 'L', category: 'Dairy', emoji: '🥛' },
  { alias: 'doodh', canonical: 'Milk', qty: 1, unit: 'L', category: 'Dairy', emoji: '🥛' },
  { alias: 'paneer', canonical: 'Paneer', qty: 200, unit: 'g', category: 'Dairy', emoji: '🧀' },
  { alias: 'spinach', canonical: 'Spinach', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'palak', canonical: 'Spinach', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'coriander', canonical: 'Coriander', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'dhania', canonical: 'Coriander', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'eggs', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  { alias: 'egg', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  { alias: 'bread', canonical: 'Bread', qty: 1, unit: 'loaf', category: 'Grains', emoji: '🍞' },
];

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

function directKnownItemsFromText(text: string) {
  const cleaned = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const matches = KNOWN_ITEMS.filter(item => new RegExp(`\\b${item.alias}\\b`, 'i').test(cleaned));
  const deduped = matches.filter((item, index, list) => list.findIndex(v => v.canonical === item.canonical) === index);

  if (deduped.length <= 1) return [];
  return deduped.map(item => ({
    name: item.canonical,
    qty: item.qty,
    unit: item.unit,
    category: item.category,
    emoji: item.emoji,
    shelf: guessShelf(item.category),
    expiry: expiryFromNow(expiryDaysFor(item.category)),
  }));
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let textOnly = '';
    let lang = 'en-IN';
    let transcript = '';
    let audio: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      textOnly = ((formData.get('text') as string | null) || '').trim();
      lang = ((formData.get('lang') as string | null) || 'en-IN').trim();
      audio = (formData.get('audio') as File | null) || null;
    } else {
      const body = await req.json();
      textOnly = (body.text || '').trim();
      lang = body.lang || 'en-IN';
    }

    if (!OPENAI_KEY) {
      // Audio cannot be transcribed without a key — surface a clear error so the user knows why voice failed.
      if (audio && !textOnly) {
        return NextResponse.json({ error: 'OPENAI_API_KEY is not configured on the server. Set it in Vercel project settings to enable voice input.' }, { status: 500 });
      }
      const fallback = textOnly
        .split(/,|;|\band\b|\bthen\b|\bwith\b|\n/gi)
        .map(v => v.trim())
        .filter(Boolean)
        .map(name => ({ name, qty: 1, unit: 'pcs', category: 'Other', emoji: '📦', shelf: 'fridge', expiry: expiryFromNow(7) }));
      return NextResponse.json({ items: fallback, transcript: textOnly });
    }

    transcript = textOnly;

    if (audio && !textOnly) {
      const transcriptionForm = new FormData();
      transcriptionForm.append('file', audio);
      transcriptionForm.append('model', 'whisper-1');
      const whisperLang = lang.split('-')[0];
      if (whisperLang && whisperLang !== 'en') transcriptionForm.append('language', whisperLang);
      transcriptionForm.append('prompt', 'Grocery items list. Mixed English, Hindi, Tamil, Malay, Singlish, Arabic, or Spanish may appear.');

      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: transcriptionForm,
      });

      if (!transcriptionResponse.ok) {
        const errText = await transcriptionResponse.text();
        return NextResponse.json({ error: errText }, { status: 500 });
      }

      const transcriptionData = await transcriptionResponse.json();
      transcript = (transcriptionData.text || '').replace(/\s+/g, ' ').trim();
    }

    if (!transcript) return NextResponse.json({ items: [], transcript: '' });

    const directItems = directKnownItemsFromText(transcript);
    if (directItems.length) {
      return NextResponse.json({ items: directItems, transcript });
    }

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You extract grocery items from speech or text.
Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string }

Rules:
- item_name: keep one clean shopper-friendly name only. Never combine two groceries into one item.
- If the user says "bhindi pumpkin", "onion tomato", "milk eggs bread", or a similar list without commas, split them into separate grocery items.
- quantity: numeric and practical. Infer realistic household defaults when quantity is omitted.
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- Ignore filler words like "bought", "add", "need", "some", "aur", "und", "lah", "can"
- The user may mix languages or local dialects — still extract the groceries correctly.

Infer defaults when quantity is missing:
- bhindi / okra: 500 g
- pumpkin / kaddu: 1 kg
- tomato / tamatar: 4 pcs
- onion / pyaaz: 500 g
- potato / aloo: 1 kg
- spinach / palak / keerai: 1 bunch
- milk / doodh / paal / susu: 1 L
- eggs / muttai / telur / anda: 12 pcs
- bread / loaf: 1 loaf
- gobi / cauliflower: 1 pcs
- paneer: 200 g
- coriander / dhania: 1 bunch
- garlic / lehsun: 100 g
- ginger / adrak: 100 g

Locale hint: ${lang}`,
          },
          {
            role: 'user',
            content: `Extract grocery items from: "${transcript}"`,
          },
        ],
      }),
    });

    if (!completion.ok) {
      const errText = await completion.text();
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    const data = await completion.json();
    const content = JSON.parse(data.choices?.[0]?.message?.content || '{"items":[]}');
    let items = (content.items || []).map(normalizeItem).filter((item: { name: string }) => item.name);
    if (items.length === 1) {
      const retrySplit = directKnownItemsFromText(transcript);
      if (retrySplit.length > 1) items = retrySplit;
    }
    return NextResponse.json({ items, transcript });
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
