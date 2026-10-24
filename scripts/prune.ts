/**
 * Pruning and clustering logic for OpenAlex raw works data.
 * Pure logic module to transform raw fetched papers into Graph data conforming to schema.ts.
 */
import type {
  Graph,
  GNode,
  GEdge,
  Subfield,
  NodeKind,
  EdgeKind,
  RootNode,
  GraphMeta,
} from '../src/data/schema.ts';
import { calculateGrowth, computeSubfieldStats } from '../src/data/derive.ts';

export interface RawWork {
  id: string;
  title: string | null;
  publication_year: number | null;
  cited_by_count: number;
  referenced_works?: string[];
  authorships?: Array<{
    author?: {
      id?: string;
      display_name?: string;
    };
  }>;
  primary_topic?: {
    id?: string;
    display_name?: string;
    subfield?: { id?: string; display_name?: string };
    field?: { id?: string; display_name?: string };
    domain?: { id?: string; display_name?: string };
  } | null;
  type?: string | null;
  primary_location?: {
    source?: {
      id?: string;
      display_name?: string;
      type?: string;
    };
  } | null;
}

export function cleanId(urlOrId: string | undefined): string {
  if (!urlOrId) return '';
  return urlOrId.replace(/^https?:\/\/openalex\.org\//, '').trim();
}

export function pruneAndCluster(
  rawWorks: RawWork[],
  fieldKeyword: string = 'Deep Learning',
  meta?: GraphMeta
): Graph {
  // Step 1: Deduplicate and store in map
  const rawMap = new Map<string, RawWork>();
  for (const work of rawWorks) {
    if (!work || !work.id || !work.title) continue;
    const shortId = cleanId(work.id);
    if (!rawMap.has(shortId)) {
      rawMap.set(shortId, {
        ...work,
        id: shortId,
        referenced_works: (work.referenced_works || []).map(cleanId),
      });
    }
  }

  // Step 2: Compute in-degree within the candidate set
  const inDegreeMap = new Map<string, number>();
  for (const id of rawMap.keys()) {
    inDegreeMap.set(id, 0);
  }

  for (const work of rawMap.values()) {
    for (const refId of work.referenced_works || []) {
      if (inDegreeMap.has(refId)) {
        inDegreeMap.set(refId, (inDegreeMap.get(refId) || 0) + 1);
      }
    }
  }

  // Step 3: Score candidates: score = inDegree * 3 + Math.log1p(cited_by_count)
  const scoredWorks: Array<{ work: RawWork; score: number; inDegree: number }> = [];
  for (const work of rawMap.values()) {
    const inDeg = inDegreeMap.get(work.id) || 0;
    const score = inDeg * 3 + Math.log1p(work.cited_by_count || 0);
    scoredWorks.push({ work, score, inDegree: inDeg });
  }

  scoredWorks.sort((a, b) => b.score - a.score);

  // Take top ~715 candidate papers so with 40 authors and 25 venues, total is ~779 nodes
  const targetPaperCount = 715;
  const topCandidates = scoredWorks.slice(0, Math.min(targetPaperCount, scoredWorks.length));
  const activePaperIds = new Set(topCandidates.map(c => c.work.id));

  // Step 4: Find citation edges among active papers and drop isolated low-citation nodes
  const internalEdges: Array<{ source: string; target: string; kind: EdgeKind }> = [];
  const degreeCount = new Map<string, number>();
  for (const id of activePaperIds) degreeCount.set(id, 0);

  for (const item of topCandidates) {
    const srcId = item.work.id;
    const seenRefs = new Set<string>();
    for (const refId of item.work.referenced_works || []) {
      if (refId !== srcId && activePaperIds.has(refId) && !seenRefs.has(refId)) {
        seenRefs.add(refId);
        internalEdges.push({ source: srcId, target: refId, kind: 'cites' });
        degreeCount.set(srcId, (degreeCount.get(srcId) || 0) + 1);
        degreeCount.set(refId, (degreeCount.get(refId) || 0) + 1);
      }
    }
  }

  const connectedPapers = topCandidates
    .filter(item => {
      const deg = degreeCount.get(item.work.id) || 0;
      return deg > 0 || item.work.cited_by_count > 500;
    })
    .map(c => c.work);

  const connectedPaperMap = new Map<string, RawWork>();
  for (const p of connectedPapers) {
    connectedPaperMap.set(p.id, p);
  }
  const validCitationEdges = internalEdges.filter(
    e => connectedPaperMap.has(e.source) && connectedPaperMap.has(e.target)
  );

  // Step 5: Identify Root Node
  let candidateReviews = connectedPapers.filter(p => {
    const t = (p.title || '').toLowerCase();
    const isRevType = p.type === 'review';
    const hasKeyword =
      t.includes('review') ||
      t.includes('survey') ||
      t.includes('overview') ||
      t.includes('deep learning');
    return isRevType || hasKeyword;
  });

  if (candidateReviews.length === 0) {
    candidateReviews = connectedPapers;
  }

  candidateReviews.sort((a, b) => {
    const inA = inDegreeMap.get(a.id) || 0;
    const inB = inDegreeMap.get(b.id) || 0;
    if (inB !== inA) return inB - inA;
    return (b.cited_by_count || 0) - (a.cited_by_count || 0);
  });

  const rootPaper = candidateReviews[0] || connectedPapers[0];
  const rootNode: RootNode = {
    id: rootPaper.id,
    label: rootPaper.title || 'Foundational Review in Deep Learning',
    sublabel: `${rootPaper.publication_year || 2015} · ${(rootPaper.cited_by_count || 0).toLocaleString()} citations`,
    year: rootPaper.publication_year || 2015,
    citations: rootPaper.cited_by_count || 0,
  };

  // Step 6: Clustering by primary_topic into 8 balanced clusters
  const rawClusters = new Map<string, { name: string; works: RawWork[] }>();
  for (const paper of connectedPapers) {
    if (paper.id === rootNode.id) continue;
    const topic = paper.primary_topic;
    const topicKey = topic?.id ? cleanId(topic.id) : (topic?.display_name || 'General');
    const topicName = topic?.display_name || topic?.subfield?.display_name || 'Foundations & Architecture';

    if (!rawClusters.has(topicKey)) {
      rawClusters.set(topicKey, { name: topicName, works: [] });
    }
    rawClusters.get(topicKey)!.works.push(paper);
  }

  const sortedClusters = Array.from(rawClusters.values()).sort((a, b) => b.works.length - a.works.length);
  const targetClusterCount = 8;
  const finalClusters: Array<{ id: string; name: string; works: RawWork[] }> = [];

  for (let i = 0; i < Math.min(targetClusterCount, sortedClusters.length); i++) {
    finalClusters.push({
      id: `subfield-${i + 1}`,
      name: sortedClusters[i].name,
      works: [...sortedClusters[i].works],
    });
  }

  for (let i = targetClusterCount; i < sortedClusters.length; i++) {
    const leftover = sortedClusters[i];
    finalClusters.sort((a, b) => a.works.length - b.works.length);
    finalClusters[0].works.push(...leftover.works);
  }

  // Step 7: Derive deduplicated Author & Venue entities with exact paper sets
  const authorWorkSets = new Map<string, { authorId: string; name: string; paperIds: Set<string> }>();
  const venueWorkSets = new Map<string, { venueId: string; name: string; paperIds: Set<string> }>();

  for (const paper of connectedPapers) {
    for (const authorship of paper.authorships || []) {
      if (authorship.author?.display_name) {
        const aId = cleanId(authorship.author.id) || authorship.author.display_name;
        if (!authorWorkSets.has(aId)) {
          authorWorkSets.set(aId, {
            authorId: aId,
            name: authorship.author.display_name,
            paperIds: new Set<string>(),
          });
        }
        authorWorkSets.get(aId)!.paperIds.add(paper.id);
      }
    }

    const source = paper.primary_location?.source;
    if (source?.display_name) {
      const vId = cleanId(source.id) || source.display_name;
      if (!venueWorkSets.has(vId)) {
        venueWorkSets.set(vId, {
          venueId: vId,
          name: source.display_name,
          paperIds: new Set<string>(),
        });
      }
      venueWorkSets.get(vId)!.paperIds.add(paper.id);
    }
  }

  const topAuthors = Array.from(authorWorkSets.values())
    .filter(a => a.paperIds.size >= 2)
    .sort((a, b) => b.paperIds.size - a.paperIds.size)
    .slice(0, 40);

  const topVenues = Array.from(venueWorkSets.values())
    .filter(v => v.paperIds.size >= 2)
    .sort((a, b) => b.paperIds.size - a.paperIds.size)
    .slice(0, 25);

  // Step 8: Build GNode and GEdge objects
  const finalNodes: GNode[] = [];
  const finalEdges: GEdge[] = [...validCitationEdges];
  const paperToSubfield = new Map<string, string>();

  finalNodes.push({
    id: rootNode.id,
    kind: 'review',
    label: rootNode.label,
    year: rootNode.year,
    weight: rootNode.citations,
    citationSum: rootNode.citations,
    paperCount: 1,
    subfieldId: 'root',
    orbitAngle: 0,
    orbitRadius: 0,
    size: 13,
    inDegree: inDegreeMap.get(rootNode.id) || 0,
  });

  const totalClusters = finalClusters.length || 1;
  const maxClusterSize = Math.max(1, ...finalClusters.map(c => c.works.length));

  // Populate paper/review nodes per cluster first
  finalClusters.forEach((cluster, cIdx) => {
    const clusterAngle = (cIdx / totalClusters) * Math.PI * 2 - Math.PI / 2;
    cluster.works.sort((a, b) => (b.cited_by_count || 0) - (a.cited_by_count || 0));
    cluster.works.forEach(w => paperToSubfield.set(w.id, cluster.id));

    cluster.works.forEach((work, idx) => {
      const lowerTitle = (work.title || '').toLowerCase();
      const isReview =
        work.type === 'review' || lowerTitle.includes('review') || lowerTitle.includes('survey');
      const kind: NodeKind = isReview ? 'review' : 'paper';

      const localAngle = idx * 2.39996 + clusterAngle;
      const localDist = 18 + Math.sqrt(idx) * 9.5;
      const cites = work.cited_by_count || 0;
      const size = Math.max(3.2, Math.min(8.5, 3.2 + Math.log10(Math.max(1, cites)) * 1.4));

      finalNodes.push({
        id: work.id,
        kind,
        label: work.title || 'Research Paper',
        year: work.publication_year || 2020,
        weight: cites,
        citationSum: cites,
        paperCount: 1,
        subfieldId: cluster.id,
        orbitAngle: localAngle,
        orbitRadius: localDist,
        size,
        inDegree: 0,
        outDegree: 0,
      });
    });
  });

  // Assign Top Authors to clusters with real latest paper year, paperCount, and citationSum
  topAuthors.forEach((author, aIdx) => {
    const papers = Array.from(author.paperIds);
    const clusterVote = new Map<string, number>();
    let citationSum = 0;
    let latestPaperYear = 1995;

    for (const pId of papers) {
      const sf = paperToSubfield.get(pId);
      if (sf) clusterVote.set(sf, (clusterVote.get(sf) || 0) + 1);
      const rawWork = connectedPaperMap.get(pId);
      if (rawWork) {
        citationSum += rawWork.cited_by_count || 0;
        if ((rawWork.publication_year || 0) > latestPaperYear) {
          latestPaperYear = rawWork.publication_year!;
        }
      }
    }

    let bestSf = finalClusters[0]?.id || 'subfield-1';
    let maxV = 0;
    for (const [sf, cnt] of clusterVote.entries()) {
      if (cnt > maxV) {
        maxV = cnt;
        bestSf = sf;
      }
    }

    const aNodeId = `author-${author.authorId}`;
    const authorAngle = aIdx * 1.618;
    const authorRadius = 75 + (aIdx % 4) * 12;

    finalNodes.push({
      id: aNodeId,
      kind: 'author',
      label: author.name,
      year: latestPaperYear,
      weight: citationSum,
      citationSum,
      paperCount: papers.length,
      subfieldId: bestSf,
      orbitAngle: authorAngle,
      orbitRadius: authorRadius,
      size: 4.8,
    });

    papers.slice(0, 3).forEach(pId => {
      finalEdges.push({
        source: aNodeId,
        target: pId,
        kind: 'authored',
      });
    });
  });

  // Assign Top Venues to clusters with real latest paper year, paperCount, and citationSum
  topVenues.forEach((venue, vIdx) => {
    const papers = Array.from(venue.paperIds);
    const clusterVote = new Map<string, number>();
    let citationSum = 0;
    let latestPaperYear = 1995;

    for (const pId of papers) {
      const sf = paperToSubfield.get(pId);
      if (sf) clusterVote.set(sf, (clusterVote.get(sf) || 0) + 1);
      const rawWork = connectedPaperMap.get(pId);
      if (rawWork) {
        citationSum += rawWork.cited_by_count || 0;
        if ((rawWork.publication_year || 0) > latestPaperYear) {
          latestPaperYear = rawWork.publication_year!;
        }
      }
    }

    let bestSf = finalClusters[0]?.id || 'subfield-1';
    let maxV = 0;
    for (const [sf, cnt] of clusterVote.entries()) {
      if (cnt > maxV) {
        maxV = cnt;
        bestSf = sf;
      }
    }

    const vNodeId = `venue-${venue.venueId}`;
    const venueAngle = vIdx * 2.1;
    const venueRadius = 88 + (vIdx % 3) * 14;

    finalNodes.push({
      id: vNodeId,
      kind: 'venue',
      label: venue.name,
      year: latestPaperYear,
      weight: citationSum,
      citationSum,
      paperCount: papers.length,
      subfieldId: bestSf,
      orbitAngle: venueAngle,
      orbitRadius: venueRadius,
      size: 5.2,
    });

    papers.slice(0, 3).forEach(pId => {
      finalEdges.push({
        source: pId,
        target: vNodeId,
        kind: 'published_in',
      });
    });
  });

  // Filter edges to ensure both source and target exist in finalNodes
  const nodeById = new Map<string, GNode>();
  for (const n of finalNodes) nodeById.set(n.id, n);
  const validEdges = finalEdges.filter(e => nodeById.has(e.source) && nodeById.has(e.target));

  // Connect root node to highest-cited paper in each cluster for backbone topology
  finalClusters.forEach(cluster => {
    const clusterPapers = finalNodes
      .filter(n => n.subfieldId === cluster.id && (n.kind === 'paper' || n.kind === 'review'))
      .sort((a, b) => b.weight - a.weight);
    if (clusterPapers[0]) {
      const exists = validEdges.some(
        e => e.source === rootNode.id && e.target === clusterPapers[0].id && e.kind === 'cites'
      );
      if (!exists) {
        validEdges.push({
          source: rootNode.id,
          target: clusterPapers[0].id,
          kind: 'cites',
        });
      }
    }
  });

  // Compute exact in-graph citation inDegree / outDegree on finalNodes
  for (const edge of validEdges) {
    if (edge.kind !== 'cites') continue;
    const srcNode = nodeById.get(edge.source);
    const tgtNode = nodeById.get(edge.target);
    if (srcNode) srcNode.outDegree = (srcNode.outDegree || 0) + 1;
    if (tgtNode) tgtNode.inDegree = (tgtNode.inDegree || 0) + 1;
  }

  // Determine overall year range across corpus works
  const paperYears = finalNodes
    .filter(n => n.kind === 'paper' || n.kind === 'review')
    .map(n => n.year)
    .filter(y => y >= 1995 && y <= 2026);
  const minYear = paperYears.length > 0 ? Math.min(...paperYears) : 1995;
  const maxYear = paperYears.length > 0 ? Math.max(...paperYears) : 2026;
  const maxYearRangeEnd = Math.max(maxYear, 2026);

  // Build Subfield records using unified calculateGrowth() and exact computeSubfieldStats()
  const subfieldList: Subfield[] = finalClusters.map((cluster, cIdx) => {
    const clusterAngle = (cIdx / totalClusters) * Math.PI * 2 - Math.PI / 2;
    const clusterRadius = 240;

    const growth = calculateGrowth(cluster.id, maxYearRangeEnd, finalNodes);
    const baseCoverage = Math.round(55 + 40 * (cluster.works.length / maxClusterSize));
    const stats = computeSubfieldStats(cluster.id, finalNodes);

    const topPaper = cluster.works[0];
    const latestWork = [...cluster.works].sort(
      (a, b) => (b.publication_year || 0) - (a.publication_year || 0)
    )[0];
    const topPaperTitle = topPaper?.title || 'Foundational Study';
    const topPaperYear = topPaper?.publication_year || 2018;
    const topPaperCite = topPaper?.cited_by_count || 0;
    const latestYear = latestWork?.publication_year || maxYear;
    const recent3yCount = cluster.works.filter(
      w => (w.publication_year || 0) >= latestYear - 2 && (w.publication_year || 0) <= latestYear
    ).length;

    const aiAnalysis =
      `${cluster.name} comprises ${cluster.works.length} indexed works (${recent3yCount} in ${latestYear - 2}–${latestYear}) ` +
      `with ${growth}x 3-year citation growth ratio. Highest-cited milestone: ` +
      `"${topPaperTitle.length > 52 ? topPaperTitle.slice(0, 50) + '...' : topPaperTitle}" ` +
      `(${topPaperYear}, ${topPaperCite.toLocaleString()} citations).`;

    return {
      id: cluster.id,
      name: cluster.name,
      baseCoverage,
      growth,
      stats,
      aiAnalysis,
      analysisSource: 'template',
      angle: clusterAngle,
      radius: clusterRadius,
    };
  });

  return {
    ...(meta ? { meta } : {}),
    field: fieldKeyword,
    root: rootNode,
    yearRange: [Math.min(minYear, 1995), maxYearRangeEnd],
    subfields: subfieldList,
    nodes: finalNodes,
    edges: validEdges,
  };
}
