CREATE TABLE agent_group (
	id BIGINT GENERATED ALWAYS AS IDENTITY,
	owner_id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	pinned BOOLEAN DEFAULT true NOT NULL,
	position INTEGER DEFAULT '0' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id)
);

CREATE INDEX ix_agent_group_owner ON agent_group (owner_id);
