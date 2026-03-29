# PodSignal — snapshots, report-summary, and migrations

## Two performance snapshot stores

| Table | Role |
|-------|------|
| `podsignal_host_metric_snapshots` | **Legacy pilot store** (migration 0014). Powers the existing Analytics “self-reported metrics” UI. |
| `podsignal_performance_snapshots` | **New generalized model** (migration 0017). Explicit `evidence_class`, optional `campaign_id`, intended for Launch Evidence Graph features. |

New code should prefer `podsignal_performance_snapshots` when adding platform or manual metrics that need graph alignment. Keep writing to `podsignal_host_metric_snapshots` until Analytics is migrated, to avoid breaking the pilot UI.

## Report summary vs full Launch Evidence Graph

| Capability | Migrations | Notes |
|------------|------------|--------|
| `GET /api/podsignal/report-summary` including `evidenceScores` | Pilot **0013–0016** | Rolling-window workspace aggregates. **Does not** prove 0017 tables exist. |
| `GET /api/podsignal/launch-evidence/:episodeId` | **0017** | Per-episode graph; returns **503** with `PODSIGNAL_LAUNCH_EVIDENCE_SCHEMA_MISSING` until 0017 is applied. |
| `podsignal_report_exports` with `evidence_scores_json` / `report_identifiers_json` | **0017** + **0018** | PDF export lineage: base row at 0017; full JSON snapshot at 0018. If only 0017 is applied, the server still inserts a **base** lineage row (no JSON columns). |

## Rollout

1. Deploy backend without requiring 0017 (pilot health unchanged).
2. Run `npm run db:apply-0017` where the full graph is desired.
3. Run `npm run db:apply-0018` for full export lineage JSON on `podsignal_report_exports`.
4. Optionally extend `/health` later to surface “graph ready” vs “pilot only” — not required for v1.

## Verify

- `GET /api/podsignal/report-summary` returns `evidenceScores` after pilot migrations.
- `GET /api/podsignal/launch-evidence/:uuid` → **503** with `PODSIGNAL_LAUNCH_EVIDENCE_SCHEMA_MISSING` before 0017; **200** with `{ graph, launchProof, sponsorProof }` after 0017 (owned episode with campaign). The guard must return boolean `false` after sending 503 so the handler stops (not the Fastify reply object).
- Sponsor PDF: `podsignal_output_usage` includes `reportExportId` in `payload` when a `podsignal_report_exports` row was inserted; if graph schema is missing, lineage is skipped and an info log records `launch_evidence_graph_schema_unavailable`.
- After PDF download with 0017+0018: new row in `podsignal_report_exports` with non-empty `evidence_scores_json` when columns exist.
