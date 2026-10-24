/**
 * OpenAlex Data Fetcher
 * Fetches real academic citation network data from OpenAlex REST API,
 * applies network pruning and clustering, and writes to src/data/graph.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneAndCluster, type RawWork } from './prune.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMAIL = 'suyu0999aaz@gmail.com';
const SLEEP_MS = 120;
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/graph.json');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchOpenAlexPage(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': `PaperAtlas/1.0 (mailto:${EMAIL})`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAlex API error ${res.status}: ${res.statusText} for ${url}`);
  }

  return await res.json();
}

async function main() {
  console.log('🚀 Starting OpenAlex citation data fetch for "Deep Learning"...');
  const allWorks: RawWork[] = [];
  const selectFields = 'id,title,publication_year,cited_by_count,referenced_works,authorships,primary_topic,type,primary_location';

  // 1. Fetch 2015-2026 works (target ~5,200 papers: 26 pages of 200)
  const recentPages = 26;
  console.log(`📡 Fetching recent literature (2015-2026), ${recentPages} batches of 200...`);

  for (let page = 1; page <= recentPages; page++) {
    const url = `https://api.openalex.org/works?search=deep+learning&filter=from_publication_date:2015-01-01,type:article,is_paratext:false&per-page=200&page=${page}&select=${selectFields}&mailto=${EMAIL}`;
    try {
      const data = await fetchOpenAlexPage(url);
      const results = (data.results || []) as RawWork[];
      allWorks.push(...results);
      console.log(`  [Recent ${page}/${recentPages}] Got ${results.length} papers (total: ${allWorks.length})`);
      if (results.length === 0) break;
      await sleep(SLEEP_MS);
    } catch (err) {
      console.error(`  Batch ${page} failed:`, err);
      break;
    }
  }

  // 2. Fetch foundational works (1995-2014, high citation count: 4 pages of 200 = 800 papers)
  console.log('📡 Fetching foundational works (1995-2014, sorted by citation count)...');
  const foundationalPages = 4;

  for (let fPage = 1; fPage <= foundationalPages; fPage++) {
    const fUrl = `https://api.openalex.org/works?search=deep+learning&filter=from_publication_date:1995-01-01,to_publication_date:2014-12-31,type:article,is_paratext:false&sort=cited_by_count:desc&per-page=200&page=${fPage}&select=${selectFields}&mailto=${EMAIL}`;
    try {
      const fData = await fetchOpenAlexPage(fUrl);
      const fResults = (fData.results || []) as RawWork[];
      allWorks.push(...fResults);
      console.log(`  [Foundational ${fPage}/${foundationalPages}] Got ${fResults.length} papers (total: ${allWorks.length})`);
      if (fResults.length === 0) break;
      await sleep(SLEEP_MS);
    } catch (err) {
      console.error(`  Foundational batch ${fPage} failed:`, err);
      break;
    }
  }

  console.log(`✨ Total raw works gathered: ${allWorks.length}. Running pruning and clustering algorithms...`);
  const graph = pruneAndCluster(allWorks, 'Deep Learning');

  console.log(`📊 Pruning complete:`);
  console.log(`   - Root: "${graph.root.label}" (${graph.root.citations} citations)`);
  console.log(`   - Subfields: ${graph.subfields.length} clusters`);
  graph.subfields.forEach(s => console.log(`     * ${s.name}: base coverage ${s.baseCoverage}%, growth ${s.growth}x`));
  console.log(`   - Nodes: ${graph.nodes.length} (Papers: ${graph.nodes.filter(n => n.kind === 'paper').length}, Reviews: ${graph.nodes.filter(n => n.kind === 'review').length}, Authors: ${graph.nodes.filter(n => n.kind === 'author').length}, Venues: ${graph.nodes.filter(n => n.kind === 'venue').length})`);
  console.log(`   - Edges: ${graph.edges.length}`);

  // Write graph.json
  const jsonString = JSON.stringify(graph, null, 2);
  const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`💾 Writing graph.json (${sizeMB} MB)...`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, jsonString, 'utf8');
  console.log(`✅ Saved graph dataset to ${OUTPUT_PATH} successfully!`);
}

main().catch(err => {
  console.error('Fatal fetch error:', err);
  process.exit(1);
});
