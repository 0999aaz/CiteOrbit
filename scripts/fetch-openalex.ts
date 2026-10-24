/**
 * OpenAlex Data Fetcher
 * Fetches real academic citation network data from OpenAlex REST API,
 * applies network pruning and clustering, optionally enriches summaries offline,
 * and writes to src/data/graph.json with provenance metadata.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneAndCluster, type RawWork } from './prune.ts';
import { maybeEnrichWithGemini } from './enrich-gemini.ts';
import type { GraphMeta } from '../src/data/schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMAIL = 'suyu0999aaz@gmail.com';
const SLEEP_MS = 120;
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/graph.json');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface OpenAlexResponse {
  results?: RawWork[];
}

async function fetchOpenAlexPage(url: string): Promise<OpenAlexResponse> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': `PaperAtlas/1.0 (mailto:${EMAIL})`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAlex API error ${res.status}: ${res.statusText} for ${url}`);
  }

  return (await res.json()) as OpenAlexResponse;
}

async function main() {
  console.log('Starting OpenAlex citation data fetch for "Deep Learning"...');
  const allWorks: RawWork[] = [];
  const selectFields =
    'id,title,publication_year,cited_by_count,referenced_works,authorships,primary_topic,type,primary_location';

  const recentQuery =
    'search=deep+learning&filter=from_publication_date:2015-01-01,type:article,is_paratext:false&per-page=200&pages=1..26';
  const foundationalQuery =
    'search=deep+learning&filter=from_publication_date:1995-01-01,to_publication_date:2014-12-31,type:article,is_paratext:false&sort=cited_by_count:desc&per-page=200&pages=1..4';

  // 1. Fetch 2015-2026 works (26 pages of 200)
  const recentPages = 26;
  console.log(`Fetching recent literature (2015-2026), ${recentPages} batches of 200...`);

  for (let page = 1; page <= recentPages; page++) {
    const url = `https://api.openalex.org/works?search=deep+learning&filter=from_publication_date:2015-01-01,type:article,is_paratext:false&per-page=200&page=${page}&select=${selectFields}&mailto=${EMAIL}`;
    try {
      const data = await fetchOpenAlexPage(url);
      const results = data.results ?? [];
      allWorks.push(...results);
      console.log(`  [Recent ${page}/${recentPages}] Got ${results.length} papers (total: ${allWorks.length})`);
      if (results.length === 0) break;
      await sleep(SLEEP_MS);
    } catch (err) {
      console.error(`  Batch ${page} failed:`, err);
      break;
    }
  }

  // 2. Fetch foundational works (1995-2014, sorted by citation count: 4 pages of 200)
  console.log('Fetching foundational works (1995-2014, sorted by citation count)...');
  const foundationalPages = 4;

  for (let fPage = 1; fPage <= foundationalPages; fPage++) {
    const fUrl = `https://api.openalex.org/works?search=deep+learning&filter=from_publication_date:1995-01-01,to_publication_date:2014-12-31,type:article,is_paratext:false&sort=cited_by_count:desc&per-page=200&page=${fPage}&select=${selectFields}&mailto=${EMAIL}`;
    try {
      const fData = await fetchOpenAlexPage(fUrl);
      const fResults = fData.results ?? [];
      allWorks.push(...fResults);
      console.log(`  [Foundational ${fPage}/${foundationalPages}] Got ${fResults.length} papers (total: ${allWorks.length})`);
      if (fResults.length === 0) break;
      await sleep(SLEEP_MS);
    } catch (err) {
      console.error(`  Foundational batch ${fPage} failed:`, err);
      break;
    }
  }

  if (allWorks.length === 0) {
    throw new Error('Zero works fetched from OpenAlex; aborting so existing src/data/graph.json is not overwritten.');
  }

  const meta: GraphMeta = {
    generatedAt: new Date().toISOString(),
    source: 'https://api.openalex.org/works',
    recentQuery,
    foundationalQuery,
    rawWorksFetched: allWorks.length,
    scoringFormula: 'inDegree * 3 + Math.log1p(cited_by_count)',
  };

  console.log(`Total raw works gathered: ${allWorks.length}. Running pruning and clustering...`);
  const prunedGraph = pruneAndCluster(allWorks, 'Deep Learning', meta);
  const finalGraph = await maybeEnrichWithGemini(prunedGraph);

  console.log('Pruning complete:');
  console.log(`  - Root: "${finalGraph.root.label}" (${finalGraph.root.citations} citations)`);
  console.log(`  - Subfields: ${finalGraph.subfields.length} clusters`);
  finalGraph.subfields.forEach(s => {
    const statSummary = s.stats.map(st => `${st.label}=${st.value}`).join(', ');
    console.log(`    * ${s.name}: baseCoverage=${s.baseCoverage}, growth=${s.growth}x (${statSummary})`);
  });
  console.log(
    `  - Nodes: ${finalGraph.nodes.length} (Papers: ${finalGraph.nodes.filter(n => n.kind === 'paper').length}, ` +
    `Reviews: ${finalGraph.nodes.filter(n => n.kind === 'review').length}, ` +
    `Authors: ${finalGraph.nodes.filter(n => n.kind === 'author').length}, ` +
    `Venues: ${finalGraph.nodes.filter(n => n.kind === 'venue').length})`
  );
  console.log(`  - Edges: ${finalGraph.edges.length}`);

  const jsonString = JSON.stringify(finalGraph, null, 2);
  const sizeMB = (Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024)).toFixed(2);
  console.log(`Writing graph.json (${sizeMB} MB)...`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, jsonString, 'utf8');
  console.log(`Saved graph dataset to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal fetch error:', err);
  process.exit(1);
});
