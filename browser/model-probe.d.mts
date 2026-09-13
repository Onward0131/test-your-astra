export type ProbeTask = 'candy' | 'pelican';
export interface Judgment {
  task: ProbeTask;
  status: 'pass' | 'fail' | 'review' | 'artifact' | 'error';
  label: string;
  summary: string;
  checks: Array<{ label: string; state: string }>;
  note?: string;
  standard?: string;
  artifact?: string;
  expected?: number;
  finalAnswer?: number | null;
}
export interface ProbeRecord {
  id: string;
  timestamp: string;
  task: ProbeTask;
  model: string;
  returnedModel: string | null;
  systemFingerprint: string | null;
  requestId: string | null;
  firstByteMs: number;
  firstTokenMs: number | null;
  protocol: 'chat' | 'responses';
  endpoint: string;
  reasoning: string;
  serviceTier: string | null;
  elapsedMs: number;
  usage: Record<string, unknown> | null;
  finishReason: string | null;
  source: string;
  answer: string;
  judgment: Judgment;
  taskSpec: unknown;
  rulesVersion: string;
}
export interface ProbeInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  task: ProbeTask;
  protocol?: 'chat' | 'responses';
  reasoning?: '' | 'low' | 'medium' | 'high';
  maxTokens?: number;
  timeout?: number;
  tokenField?: 'max_tokens' | 'max_completion_tokens';
  taskSpec?: { prompt: string; [key: string]: unknown };
  onProgress?: (progress: { chars: number; firstTokenMs: number }) => void;
  fetchImpl?: typeof fetch;
}
export const VERSION: string;
export const prompts: Record<ProbeTask, string>;
export const standard: string;
export const labels: Record<Judgment['status'], string>;
export function judge(task: ProbeTask, answer: string, spec?: unknown): Judgment;
export function extractArtifact(answer: string): string;
export function extractResponse(payload: unknown): string;
export function endpointOf(baseUrl: string, protocol?: string): string;
export function runProbe(input: ProbeInput, signal?: AbortSignal): Promise<ProbeRecord>;
export function readEventStream(response: Response, onProgress?: (chars: number) => void): Promise<unknown>;
export function readLimited(response: Response, limit?: number): Promise<string>;
export function sceneDocument(source: string): string;
export function playerDocument(source: string, controls?: boolean): string;
