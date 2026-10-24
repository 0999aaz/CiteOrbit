/**
 * Optional offline Gemini synthesis enrichment for Subfield summaries.
 * Runs exclusively in Node CLI (`scripts/`), never bundled into client code.
 * Gracefully falls back to deterministic statistical template summaries when
 * GEMINI_API_KEY is absent, placeholder, or unreachable.
 */
import { GoogleGenAI } from '@google/genai';
import type { Graph } from '../src/data/schema.ts';

export async function maybeEnrichWithGemini(graph: Graph): Promise<Graph> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.log('ℹ️  No valid GEMINI_API_KEY set; keeping deterministic statistical summaries (analysisSource="template").');
    return graph;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  console.log('✨ Enriching subfield summaries offline via Gemini (gemini-3.8-flash)...');

  for (const sf of graph.subfields) {
    const clusterPapers = graph.nodes
      .filter(n => n.subfieldId === sf.id && (n.kind === 'paper' || n.kind === 'review'))
      .sort((a, b) => b.weight - a.weight);

    const top3 = clusterPapers
      .slice(0, 3)
      .map(p => `"${p.label}" (${p.year}, ${p.weight} cites)`)
      .join('; ');

    const prompt =
      `Write a concise 2-sentence factual bibliometric summary (under 48 words, plain text, no hype) ` +
      `for the "${sf.name}" cluster in ${graph.field}. ` +
      `Facts: ${clusterPapers.length} papers, 3-year growth ratio ${sf.growth}x, top works: ${top3}.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      const text = response.text?.trim();
      if (text && text.length >= 24) {
        sf.aiAnalysis = text;
        sf.analysisSource = 'gemini';
      }
    } catch {
      console.log(`  ⚠️ Gemini enrichment skipped for "${sf.name}"; retaining deterministic statistical template.`);
      break;
    }
  }

  return graph;
}
