CREATE SCHEMA corporate_bs;
CREATE TABLE corporate_bs.players (id text PRIMARY KEY, name text NOT NULL DEFAULT '', created_at bigint NOT NULL);
CREATE TABLE corporate_bs.subscribers (email text PRIMARY KEY, consent_at bigint NOT NULL, consent_version text NOT NULL, unsubscribe_token text UNIQUE NOT NULL);
CREATE TABLE corporate_bs.results (id text PRIMARY KEY, player_id text NOT NULL REFERENCES corporate_bs.players(id), phrase text NOT NULL, phrase_hash text NOT NULL, score double precision NOT NULL CHECK(score BETWEEN 0 AND 100), rubric text NOT NULL, model text NOT NULL, created_at bigint NOT NULL, UNIQUE(player_id, phrase_hash, rubric));
CREATE INDEX result_ranking ON corporate_bs.results(rubric, score DESC, created_at, id);
CREATE TABLE corporate_bs.score_cache (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE corporate_bs.limits (key text PRIMARY KEY, count integer NOT NULL, expires bigint NOT NULL);
CREATE INDEX limits_expiry ON corporate_bs.limits(expires);
CREATE TABLE corporate_bs.settings (key text PRIMARY KEY, value text NOT NULL);
