export type NodeKind = 'paper' | 'review' | 'author' | 'venue';
export type EdgeKind = 'cites' | 'authored' | 'published_in';
export type AnalysisSource = 'gemini' | 'template';

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string; // Real paper title / author display_name / venue display_name
  year: number;  // Publication year for works; latest corpus paper year for author/venue
  weight: number; // cited_by_count for works; sum of linked corpus paper citations for author/venue
  citationSum?: number; // Explicit citation sum across linked corpus papers
  paperCount?: number;  // 1 for paper/review; deduplicated corpus paper count for author/venue
  subfieldId: string;
  orbitAngle: number;
  orbitRadius: number;
  size: number;
  inDegree?: number;
  outDegree?: number;
}

export interface GEdge {
  source: string;
  target: string;
  kind: EdgeKind;
}

export interface SubfieldStat {
  label: string;
  value: number;
}

export interface Subfield {
  id: string;
  name: string; // primary_topic.display_name
  baseCoverage: number;
  growth: number;
  stats: SubfieldStat[]; // Real deduplicated counts from graph.nodes: Papers / Authors / Surveys / Venues
  aiAnalysis: string;    // Statistical template summary (or offline Gemini synthesis if enriched)
  analysisSource?: AnalysisSource;
  color?: string;
  angle?: number;
  radius?: number;
}

export interface RootNode {
  id: string;
  label: string;
  sublabel: string;
  year: number;
  citations: number;
}

export interface GraphMeta {
  generatedAt: string;
  source: string;
  recentQuery: string;
  foundationalQuery: string;
  rawWorksFetched: number;
  scoringFormula: string;
}

export interface Graph {
  meta?: GraphMeta;
  field: string;
  root: RootNode;
  yearRange: [number, number];
  subfields: Subfield[];
  nodes: GNode[];
  edges: GEdge[];
}
