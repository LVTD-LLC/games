CREATE SCHEMA jess;
CREATE TABLE jess.games (
    id uuid PRIMARY KEY,
    owner text NOT NULL,
    side text NOT NULL CHECK (side IN ('w', 'b')),
    moves jsonb NOT NULL DEFAULT '[]',
    last_response jsonb,
    winner text CHECK (winner IN ('human', 'jev', 'draw')),
    move_count integer CHECK (move_count BETWEEN 1 AND 300),
    name text NOT NULL DEFAULT '',
    created_at bigint NOT NULL,
    finished_at bigint,
    CHECK ((winner IS NULL AND finished_at IS NULL AND move_count IS NULL)
        OR (winner IS NOT NULL AND finished_at IS NOT NULL AND move_count IS NOT NULL))
);
CREATE INDEX jess_wins ON jess.games (move_count, finished_at, id) WHERE winner = 'human';
CREATE TABLE jess.subscribers (
    email text PRIMARY KEY,
    consent_at bigint NOT NULL,
    consent_version text NOT NULL,
    unsubscribe_token text NOT NULL UNIQUE
);
