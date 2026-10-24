export type NodeKind = 'paper' | 'review' | 'author' | 'venue';
export type EdgeKind = 'cites' | 'authored' | 'published_in';

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string; // 真实论文标题 / 作者名 / 期刊名
  year: number;
  weight: number; // cited_by_count
  subfieldId: string;
  orbitAngle: number;
  orbitRadius: number;
  size: number;
  x?: number; // Precomputed world coordinates
  y?: number;
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
  stats: SubfieldStat[]; // 论文 / 作者 / 核心综述 / 发表阵地
  aiAnalysis: string; // 由真实数据拼装
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

export interface Graph {
  field: string; // 用户传入的领域关键词
  root: RootNode;
  yearRange: [number, number]; // [1995, 2026]
  subfields: Subfield[];
  nodes: GNode[];
  edges: GEdge[];
}
