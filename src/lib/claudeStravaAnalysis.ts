import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AIAnalysis } from './aiTypes';

const execFileAsync = promisify(execFile);
const DEFAULT_CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MCP_SERVER_NAME = 'strava-run-blue-probe';

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    intensity: { type: 'string', enum: ['easy', 'moderate', 'hard', 'extreme'] },
    recoveryHours: { type: 'number', minimum: 0, maximum: 168 },
    comparisonToAverage: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    paceZoneAnalysis: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            zone: { type: 'string' },
            description: { type: 'string' },
            appropriateness: { type: 'string', enum: ['appropriate', 'too-fast', 'too-slow'] },
          },
          required: ['zone', 'description', 'appropriateness'],
        },
      ],
    },
    trainingLoadContext: { type: 'string' },
    similarActivitiesInsight: { type: 'string' },
    nextWorkoutSuggestion: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  },
  required: [
    'summary',
    'intensity',
    'recoveryHours',
    'comparisonToAverage',
    'suggestions',
    'paceZoneAnalysis',
    'trainingLoadContext',
    'similarActivitiesInsight',
    'nextWorkoutSuggestion',
    'warnings',
  ],
} as const;

interface ClaudeResultEnvelope {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

function isAnalysisShape(value: unknown): value is Omit<AIAnalysis, 'generatedAt'> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AIAnalysis>;
  return (
    typeof item.summary === 'string' &&
    ['easy', 'moderate', 'hard', 'extreme'].includes(item.intensity || '') &&
    typeof item.recoveryHours === 'number' &&
    typeof item.comparisonToAverage === 'string' &&
    Array.isArray(item.suggestions) &&
    typeof item.trainingLoadContext === 'string' &&
    typeof item.similarActivitiesInsight === 'string' &&
    typeof item.nextWorkoutSuggestion === 'string' &&
    Array.isArray(item.warnings)
  );
}

export function parseClaudeStructuredAnalysis(stdout: string): AIAnalysis {
  const envelope = JSON.parse(stdout) as ClaudeResultEnvelope | Omit<AIAnalysis, 'generatedAt'>;
  if ('is_error' in envelope && envelope.is_error) {
    throw new Error(envelope.result || 'Claude Strava MCP analysis failed');
  }

  let output: unknown = 'structured_output' in envelope ? envelope.structured_output : envelope;
  if (!output && 'result' in envelope && typeof envelope.result === 'string') {
    output = JSON.parse(envelope.result);
  }
  if (!isAnalysisShape(output)) {
    throw new Error('Claude returned an invalid Strava analysis payload');
  }

  return {
    ...output,
    generatedAt: Date.now(),
    isFallback: false,
  };
}

function buildPrompt({
  activityId,
  locale,
  userProfilePBs,
  lthr,
}: {
  activityId: number;
  locale?: string;
  userProfilePBs?: Record<string, number> | null;
  lthr?: number | null;
}): string {
  const language = locale?.startsWith('en') ? 'English' : 'Simplified Chinese';
  const profileContext = JSON.stringify({ personalBestsSeconds: userProfilePBs || {}, lthr: lthr || null });
  return [
    `Use the official Strava MCP server named ${DEFAULT_MCP_SERVER_NAME} to analyze Strava activity ${activityId}.`,
    'Retrieve the activity and only the recent history needed for a useful comparison. Do not use local files, web search, shell commands, or any non-Strava data source.',
    `The runner supplied this optional profile context: ${profileContext}.`,
    `Return the requested structured result in ${language}.`,
    'The summary must be a complete two-sentence conclusion: sentence one states what the workout was and how well it was executed; sentence two states the most important implication or next action.',
    'Do not repeat the summary verbatim in suggestions. Keep every field concise, evidence-based, and specific to this activity.',
    'If evidence is insufficient, say so instead of inventing precise zones, weather effects, fatigue, or workout intent.',
  ].join('\n');
}

export async function analyzeActivityViaClaudeStravaMcp({
  activityId,
  locale,
  userProfilePBs,
  lthr,
}: {
  activityId: number;
  locale?: string;
  userProfilePBs?: Record<string, number> | null;
  lthr?: number | null;
}): Promise<AIAnalysis> {
  const claudePath = process.env.CLAUDE_CODE_PATH || DEFAULT_CLAUDE_PATH;
  const mcpServerName = process.env.STRAVA_MCP_SERVER_NAME || DEFAULT_MCP_SERVER_NAME;
  const allowedTools = `mcp__${mcpServerName}__*`;
  const prompt = buildPrompt({ activityId, locale, userProfilePBs, lthr });

  try {
    const { stdout } = await execFileAsync(claudePath, [
      '--print',
      '--no-session-persistence',
      '--no-chrome',
      '--permission-mode',
      'dontAsk',
      '--tools',
      '',
      '--allowedTools',
      allowedTools,
      '--model',
      process.env.STRAVA_MCP_CLAUDE_MODEL || 'sonnet',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(ANALYSIS_SCHEMA),
      prompt,
    ], {
      cwd: process.cwd(),
      timeout: 240_000,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });

    return parseClaudeStructuredAnalysis(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claude Strava MCP analysis failed';
    throw new Error(`Claude Strava MCP unavailable: ${message}`);
  }
}
