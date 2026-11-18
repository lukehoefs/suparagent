CREATE TABLE remote_computer (
	id BIGINT GENERATED ALWAYS AS IDENTITY,
	name VARCHAR(100) NOT NULL,
	mcp_connection_id VARCHAR(36) NOT NULL,
	agent_id BIGINT,
	human_control BOOLEAN DEFAULT false NOT NULL,
	control_started_at TIMESTAMP WITH TIME ZONE,
	control_person_id BIGINT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(mcp_connection_id) REFERENCES custom_mcp_connection (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_remote_computer_agent ON remote_computer (agent_id);

CREATE UNIQUE INDEX uq_remote_computer_connection ON remote_computer (mcp_connection_id);
