CREATE TABLE wall_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  items_json TEXT NOT NULL CHECK (json_valid(items_json) AND json_type(items_json) = 'array'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The local publisher assembles large JSON snapshots from D1-sized statements.
CREATE TABLE wall_publish_parts (
  revision_id TEXT NOT NULL,
  part_index INTEGER NOT NULL CHECK (part_index >= 0),
  content TEXT NOT NULL,
  PRIMARY KEY (revision_id, part_index)
);

CREATE TABLE wall_revision_media (
  revision_id TEXT NOT NULL REFERENCES wall_revisions (id) ON DELETE CASCADE,
  media_id TEXT NOT NULL CHECK (length(media_id) = 64 AND media_id NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (revision_id, media_id)
);

CREATE TABLE wall_active (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision_id TEXT REFERENCES wall_revisions (id)
);

INSERT INTO wall_active (singleton, revision_id) VALUES (1, NULL);

CREATE TRIGGER wall_index_revision_media
AFTER INSERT ON wall_revisions
BEGIN
  INSERT INTO wall_revision_media (revision_id, media_id)
  SELECT DISTINCT NEW.id, json_extract(value, '$.mediaId')
  FROM json_each(NEW.items_json)
  WHERE json_extract(value, '$.kind') = 'photo';
END;
