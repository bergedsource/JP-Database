-- Stores the full historical chapter roster (~1390 entries) for the trivia game.
-- big_brother_roll is a self-FK; deferrable so the bulk insert can populate
-- rows in any order before referential integrity is checked.

CREATE TABLE chapter_roster (
  roll              INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  initiation_class  TEXT,
  initiation_date   DATE,
  big_brother_roll  INTEGER REFERENCES chapter_roster(roll)
                      ON DELETE SET NULL
                      DEFERRABLE INITIALLY DEFERRED,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chapter_roster_big_brother ON chapter_roster(big_brother_roll);
CREATE INDEX idx_chapter_roster_name_lower ON chapter_roster(LOWER(name));
