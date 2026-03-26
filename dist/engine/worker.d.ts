/**
 * src/engine/worker.ts
 *
 * ForensicMatchEngine worker loop — polls for PENDING reviews in the DB,
 * claims them as PROCESSING, runs the engine, and writes results back.
 */
export declare function startEngineWorker(): Promise<void>;
export declare function stopEngineWorker(): void;
//# sourceMappingURL=worker.d.ts.map