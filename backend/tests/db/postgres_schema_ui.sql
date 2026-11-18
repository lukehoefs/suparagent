CREATE TABLE ui_revision (
	id BIGINT GENERATED ALWAYS AS IDENTITY,
	owner_id VARCHAR NOT NULL,
	config JSON NOT NULL,
	summary VARCHAR NOT NULL,
	source VARCHAR NOT NULL,
	actor VARCHAR NOT NULL,
	agent_id INTEGER,
	restored_from INTEGER,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id)
);

CREATE INDEX ix_ui_revision_owner ON ui_revision (owner_id, id);
