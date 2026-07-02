-- schema-v2.sql
-- Run once with:
-- wrangler d1 execute moodboard-db --remote --file=./schema-v2.sql
--
-- Adds boards (folders) and the join table linking images to boards.
-- Safe to run on an existing database -- uses IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS boards (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Many-to-many: one image can belong to multiple boards,
-- one board can contain many images.
CREATE TABLE IF NOT EXISTS image_boards (
  image_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  PRIMARY KEY (image_id, board_id),
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_image_boards_board_id ON image_boards(board_id);
CREATE INDEX IF NOT EXISTS idx_image_boards_image_id ON image_boards(image_id);
