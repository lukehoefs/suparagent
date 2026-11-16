"""SOUL.md: the managed tools block is rewritten, the person's text around it is kept."""

from app.services import agent_soul


def test_a_new_soul_gets_a_header_and_an_empty_managed_block():
    text = agent_soul.replace_tools_block("", agent_soul.render_tools([]), "Atlas")
    assert text.startswith("# Soul of Atlas")
    assert agent_soul.TOOLS_START in text and agent_soul.TOOLS_END in text
    assert "No connected tools are granted to you yet" in text


def test_granted_tools_are_listed_by_source_with_descriptions():
    body = agent_soul.render_tools([
        ("Web search", [("searxng_web_search", "Search the web."), ("web_url_read", "Read a page.")]),
    ])
    assert "### Web search" in body
    assert "- `searxng_web_search`: Search the web." in body
    assert "- `web_url_read`: Read a page." in body
    assert "ask the person for approval" in body or "asks the person for approval" in body


def test_rewriting_the_block_keeps_the_persons_own_text():
    mine = "# Soul of Atlas\n\nI am Luke's chief of staff. Never email clients without approval.\n\n"
    first = agent_soul.replace_tools_block(mine, agent_soul.render_tools([("A", [("one", "x")])]))
    second = agent_soul.replace_tools_block(first, agent_soul.render_tools([("B", [("two", "y")])]))
    assert "Never email clients without approval." in second
    assert "`two`" in second and "`one`" not in second
    assert second.count(agent_soul.TOOLS_START) == 1 and second.count(agent_soul.TOOLS_END) == 1


def test_a_soul_without_markers_gets_the_block_appended():
    text = agent_soul.replace_tools_block("# Custom soul\nRules here.\n", agent_soul.render_tools([]))
    assert text.startswith("# Custom soul\nRules here.")
    assert text.rstrip().endswith(agent_soul.TOOLS_END)


def test_long_tool_descriptions_are_clipped_to_one_line():
    long = "word " * 200 + "\nsecond line"
    body = agent_soul.render_tools([("S", [("t", long)])])
    line = next(l for l in body.splitlines() if l.startswith("- `t`"))
    assert len(line) < agent_soul.MAX_DESCRIPTION_CHARS + 20
    assert "\n" not in line and line.endswith("…")


def test_the_prompt_block_is_none_without_a_file_and_present_with_one(tmp_path, monkeypatch):
    monkeypatch.setattr(agent_soul, "soul_path", lambda agent_id: tmp_path / f"{agent_id}" / "SOUL.md")
    monkeypatch.setattr(agent_soul, "read_soul", lambda agent_id: (
        (tmp_path / f"{agent_id}" / "SOUL.md").read_text(encoding="utf-8")
        if (tmp_path / f"{agent_id}" / "SOUL.md").exists() else ""
    ))
    assert agent_soul.soul_prompt(7) is None
    (tmp_path / "7").mkdir()
    (tmp_path / "7" / "SOUL.md").write_text(
        agent_soul.replace_tools_block("", agent_soul.render_tools([("Web search", [("searxng_web_search", "Search.")])]), "Atlas"),
        encoding="utf-8",
    )
    prompt = agent_soul.soul_prompt(7)
    assert prompt and "BEGIN SOUL (SOUL.md)" in prompt and "searxng_web_search" in prompt
