/**
 * Path: packages/vision/src/index.ts
 * Purpose: Vision service STUB (Phase 6, PRD 2.16). The API surface is
 *          frozen now so Manager/QA wiring stays stable: analyze({ images,
 *          prompt, task, options, budget }) with provider-format adapters
 *          (OpenAI image_url / Anthropic base64 / Google inline_data),
 *          caching, and cost budgets. Implementation lands in Phase 6.
 * Dependencies: @tagent-office/shared
 */
import { err, type Result } from '@tagent-office/shared';

/** Supported analysis tasks (PRD 2.16). */
export type VisionTask =
  | 'ui-review'
  | 'bug-detect'
  | 'mockup-extract'
  | 'diagram-parse'
  | 'checkTypography'
  | 'checkContrast'
  | 'checkResponsive'
  | 'checkA11y'
  | 'checkDesign';

/** One image input (raw base64 or a workspace-relative path). */
export interface VisionImage {
  /** Base64 payload without the data-url prefix. */
  base64?: string;
  /** Workspace-relative path to an image file. */
  path?: string;
  mimeType?: string;
}

/** Request shape. */
export interface VisionRequest {
  images: VisionImage[];
  prompt: string;
  task: VisionTask;
  options?: Record<string, unknown>;
  budget?: { maxCalls: number; maxTokens: number };
}

/** Response shape. */
export interface VisionResponse {
  analysis: string;
  confidence: number;
  model: string;
  tokensUsed: number;
  cost: number;
  fallbackUsed: boolean;
}

/** Error thrown by unimplemented Phase 6 features. */
export class VisionNotImplementedError extends Error {
  constructor(operation: string) {
    super(`Vision service is a Phase 6 deliverable; "${operation}" is not implemented yet.`);
    this.name = 'VisionNotImplementedError';
  }
}

/** Vision service contract (stable across phases). */
export interface VisionService {
  analyze(request: VisionRequest): Promise<Result<VisionResponse, Error>>;
  capabilities(): { multiImage: boolean; maxImages: number; formats: string[] };
}

/** Phase 1 stub: freezes the API, refuses to run. */
export function createVisionService(): VisionService {
  return {
    async analyze() {
      return err(new VisionNotImplementedError('analyze'));
    },
    capabilities(): { multiImage: boolean; maxImages: number; formats: string[] } {
      return { multiImage: false, maxImages: 0, formats: [] };
    },
  };
}
