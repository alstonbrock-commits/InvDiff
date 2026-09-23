-- 0010: remove transcript-confidence machinery. Together's Parakeet endpoint
-- returns no confidence data, so the score/flag/threshold features never
-- functioned — product call: if it doesn't work, don't have it.

alter table transcripts drop column if exists quality_score;
alter table transcripts drop column if exists flagged_segment_count;
alter table transcripts drop column if exists segments;

alter table app_settings drop column if exists auto_approve_threshold;
