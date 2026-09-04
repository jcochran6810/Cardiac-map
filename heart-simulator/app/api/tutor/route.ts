import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * AI tutor backend.
 *
 * GET  → { available: boolean }  (whether a Claude API key is configured)
 * POST → { answer: string }       (a level-adapted explanation grounded in the
 *                                  app's own knowledge base)
 *
 * Without ANTHROPIC_API_KEY the route answers 501 and the browser falls back
 * to the built-in knowledge-base tutor, so the app works fully offline.
 */

export const runtime = 'nodejs';

const MODEL = process.env.TUTOR_MODEL || 'claude-opus-5';

const LEVEL_GUIDANCE: Record<number, string> = {
  1: 'The learner is an EMT-Basic. Use plain language, avoid jargon (define it when unavoidable), focus on recognition, scene safety, oxygen/aspirin-level interventions and rapid transport decisions. Keep answers short.',
  2: 'The learner is a paramedic. Use ACLS-level detail: rhythm recognition, 12-lead interpretation, drug doses and routes, cardioversion/pacing, and transport destination decisions.',
  3: 'The learner works in the ED or ICU. Include diagnostic workup, risk stratification, haemodynamic reasoning, infusion titration, and disposition. Mention key trial evidence briefly when it changes practice.',
  4: 'The learner is a cardiologist or cardiology trainee. Use full clinical depth: guideline classes of recommendation, imaging criteria, device and revascularisation decision-making, long-term management.',
  5: 'The learner is an interventional or EP cardiologist. Emphasise procedural technique, equipment selection, intra-procedural physiology, complication bailout and lab-specific nuance.',
};

const SYSTEM_PROMPT = `You are the tutor inside CardioSim, an educational cardiac simulation app with an interactive 3D heart, a synthesised 12-lead ECG, a hemodynamics panel, and knowledge bases for anatomy, conditions, procedures, medications and clinical cases.

Ground your answers in the reference material supplied with each question when it is relevant; you may add well-established knowledge beyond it. Adapt depth and vocabulary to the learner's level. Prefer short paragraphs and bullet points. Use **bold** for key terms. Point the learner to things they can do in the app (select a condition to see its ECG, click a lead to see its axis on the heart, open the Meds tab, run the case simulator) when helpful.

This is education, not clinical advice: doses are reference values and local protocols apply. Never fabricate trial names or numbers; if unsure, say so.`;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export async function GET() {
  return NextResponse.json({ available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

interface TutorRequest {
  question: string;
  context?: string;
  reference?: string;
  level?: number;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(request: Request) {
  const client = getClient();
  if (!client) {
    return NextResponse.json({ available: false, error: 'ANTHROPIC_API_KEY is not configured' }, { status: 501 });
  }

  let body: TutorRequest;
  try {
    body = (await request.json()) as TutorRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const question = (body.question || '').trim();
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });
  const level = Math.min(5, Math.max(1, Number(body.level) || 1));

  const history: Anthropic.MessageParam[] = (body.history || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const userContent = [
    `Current app context:\n${body.context || 'none'}`,
    body.reference ? `Reference material from the app knowledge base:\n${body.reference.slice(0, 12000)}` : '',
    `Learner question: ${question}`,
  ].filter(Boolean).join('\n\n');

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: LEVEL_GUIDANCE[level] },
      ],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages: [...history, { role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ answer: 'I can\'t help with that particular request. Try asking about cardiac anatomy, physiology, ECG interpretation, conditions, procedures or medications.' });
    }

    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return NextResponse.json({ answer: answer || 'I did not manage to produce an answer — please try rephrasing.' });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ available: false, error: 'Invalid Anthropic API key' }, { status: 501 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Rate limited — please try again in a moment' }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${error.status})` }, { status: 502 });
    }
    return NextResponse.json({ error: 'Tutor backend failed' }, { status: 500 });
  }
}
