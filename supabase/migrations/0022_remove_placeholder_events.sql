-- 0022: remove the placeholder events left over from development.
--
-- The app is going to the client for testing, and the admin app shows every
-- event across the organisation — including throwaway rows titled "A", "G",
-- "Sa", "Hgrt", "Catadtrophe" and home/shop tests. Deleted here rather than in
-- the app because only an event's owner can delete it (the admin surface is
-- read-only by design) and these span three accounts.
--
-- Removed (13):
--   Near miss / Home            Crash / Shop              Gdog / G
--   Sa / Sa                     G / G                     G / S
--   G / S                       A / F                     A / H
--   Dug a hole / Home           S / A                     Catadtrophe / Couch
--   Hgrt / Hhfg
--
-- Kept (9): the eight seeded review events plus "Pallet fell off a truck",
-- which is a genuine end-to-end run with a real report.
--
-- Everything hanging off an event cascades: questions, interviewees, answers,
-- transcripts, insights, recommendations, evidence, reports, jobs, exports and
-- photos. The audio objects for these events were deleted through the Storage
-- API beforehand (Postgres cannot write storage.objects).

delete from events
where id not in (
  '84308f0c-0011-4c9f-b8fb-78c87f47858d',  -- Forklift and pedestrian near-miss at the pick face
  '20413bed-e446-4301-942c-d09a19c66e31',  -- Pallet fell off a truck
  '0568ad50-caba-4177-a40b-69f6e58989b6',  -- Chemical splash while decanting degreaser
  'abcc33c9-1ded-419c-9922-9f1463314d52',  -- Plank fell from scaffold onto walkway
  '2a93da9d-cda8-4623-9f83-435ff490e310',  -- Truck reversed into loading bay barrier
  'caf1a4eb-aff3-4775-bdf9-513b775626c8',  -- Guard removed to clear conveyor jam
  'f0172e9a-172e-4ee5-8460-a01f0b6683ba',  -- Wrong pallet dispatched on night shift
  '0bfdfbd3-123b-4614-912e-4e466453ab1f',  -- Crane lift stopped after load swing
  'deca8ebd-1971-4591-bb6b-9c70ff89646e'   -- Slip on wet floor near wash bay
);
