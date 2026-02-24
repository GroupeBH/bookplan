-- Enforce one rating per rater/rated pair across the whole app.
-- Keep the most recent row when duplicates already exist.

WITH ranked_ratings AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY rater_id, rated_id
      ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, id DESC
    ) AS row_num
  FROM ratings
)
DELETE FROM ratings r
USING ranked_ratings rr
WHERE r.id = rr.id
  AND rr.row_num > 1;

ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_rater_id_rated_id_booking_id_key;

ALTER TABLE ratings
  ADD CONSTRAINT ratings_rater_id_rated_id_key UNIQUE (rater_id, rated_id);
