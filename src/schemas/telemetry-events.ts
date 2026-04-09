/**
 * Telemetry event constants and runtime type assertions.
 */

export const TELEMETRY_EVENT_TYPES = [
  'request_received',
  'route_planned',
  'execution_attempt',
  'execution_completed',
  'outcome_reported',
  'bypass',
] as const;

export type TelemetryEventType = typeof TELEMETRY_EVENT_TYPES[number];

export interface BaseTelemetryEvent {
  event_id: string;
  event_type: TelemetryEventType;
  timestamp: string;
  request_id: string;
  session_id: string;
  trace_id: string;
  adapter: string;
  router_policy_version: string;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${field}: expected non-empty string`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}: expected number`);
  }
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${field}: expected boolean`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ─── Public assertion ─────────────────────────────────────────────────────────

export function assertTelemetryEvent(event: unknown): asserts event is BaseTelemetryEvent {
  if (!isObject(event)) throw new Error('Invalid telemetry event: expected object');

  assertString(event['event_id'],               'telemetry.event_id');
  assertString(event['event_type'],             'telemetry.event_type');
  assertString(event['timestamp'],              'telemetry.timestamp');
  assertString(event['request_id'],             'telemetry.request_id');
  assertString(event['session_id'],             'telemetry.session_id');
  assertString(event['trace_id'],               'telemetry.trace_id');
  assertString(event['adapter'],                'telemetry.adapter');
  assertString(event['router_policy_version'],  'telemetry.router_policy_version');

  if (!(TELEMETRY_EVENT_TYPES as readonly string[]).includes(event['event_type'] as string)) {
    throw new Error(`Unsupported telemetry.event_type: ${event['event_type']}`);
  }

  if (event['event_type'] === 'route_planned') {
    assertString(event['selected_provider'],  'telemetry.selected_provider');
    assertString(event['selected_model'],     'telemetry.selected_model');
    assertNumber(event['confidence'],         'telemetry.confidence');
    assertString(event['compression_level'],  'telemetry.compression_level');
    assertNumber(event['token_budget_in'],    'telemetry.token_budget_in');
    assertNumber(event['token_budget_out'],   'telemetry.token_budget_out');
  }

  if (event['event_type'] === 'execution_attempt') {
    assertNumber(event['attempt_no'], 'telemetry.attempt_no');
    assertString(event['provider'],   'telemetry.provider');
    assertString(event['model'],      'telemetry.model');
  }

  if (event['event_type'] === 'execution_completed') {
    assertBoolean(event['success'],          'telemetry.success');
    assertNumber(event['total_latency_ms'],  'telemetry.total_latency_ms');
    assertBoolean(event['fallback_used'],    'telemetry.fallback_used');
    assertNumber(event['input_tokens'],      'telemetry.input_tokens');
    assertNumber(event['output_tokens'],     'telemetry.output_tokens');
    assertNumber(event['estimated_cost_usd'],'telemetry.estimated_cost_usd');
  }

  if (event['event_type'] === 'outcome_reported') {
    assertNumber(event['correction_proxy_score'],    'telemetry.correction_proxy_score');
    assertBoolean(event['user_reprompt_within_2m'],  'telemetry.user_reprompt_within_2m');
    assertBoolean(event['manual_override_used'],     'telemetry.manual_override_used');
  }

  if (event['event_type'] === 'bypass') {
    assertString(event['reason'], 'telemetry.reason');
  }
}
