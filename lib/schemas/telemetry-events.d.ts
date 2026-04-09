/**
 * Telemetry event constants and runtime type assertions.
 */
export declare const TELEMETRY_EVENT_TYPES: readonly ["request_received", "route_planned", "execution_attempt", "execution_completed", "outcome_reported", "bypass"];
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
export declare function assertTelemetryEvent(event: unknown): asserts event is BaseTelemetryEvent;
//# sourceMappingURL=telemetry-events.d.ts.map