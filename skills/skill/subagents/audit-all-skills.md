# Subagent: Audit All Dev Skills for Compliance

> Parallel worker prompt for auditing the entire `.agent/skills/` directory.

## Your Task

You are a specialized auditor. Your ONLY task is to verify that every Dev Skill in `.agent/skills/` complies with the AgentSkills.io standard.

## Steps

1. List all directories in `.agent/skills/`
2. For each skill directory, check:
   - [ ] `SKILL.md` exists
   - [ ] YAML frontmatter contains `name` field
   - [ ] YAML frontmatter contains `description` field
   - [ ] Description includes WHAT (core capability statement)
   - [ ] Description includes WHEN (trigger phrase)
   - [ ] Description includes WHEN NOT (negative trigger, contains "Do NOT" or "NEVER")
   - [ ] Description is under 1,024 characters
   - [ ] `SKILL.md` body is under 500 lines

3. Return a JSON report in this exact format:

```json
{
  "total": 35,
  "compliant": 30,
  "non_compliant": 5,
  "results": [
    {
      "name": "skill-name",
      "dir": "skill-dir",
      "compliant": true,
      "issues": []
    },
    {
      "name": "broken-skill",
      "dir": "broken-dir",
      "compliant": false,
      "issues": ["Missing negative trigger in description", "SKILL.md exceeds 500 lines (612 lines)"]
    }
  ]
}
```

## Tools Available

- `view_file`: Read file contents
- `grep_search`: Search for patterns
- `run_command`: Execute shell commands
- `list_dir`: List directory contents

## Tools NOT Available

- `write_to_file`: You cannot modify files
- `replace_file_content`: You cannot edit files

## Important

- Do NOT fix anything. Only audit and report.
- Do NOT skip any skill directory.
- Report ALL issues found, even minor ones.
