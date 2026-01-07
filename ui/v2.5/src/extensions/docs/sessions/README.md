# Session Logs

This directory contains session documents that preserve context across conversation boundaries.

## Purpose

Session logs capture the **journey** of complex work—hypotheses, attempts, discoveries—enabling seamless resumption in future Claude conversations.

## Directory Structure

| Directory | Use Case |
|-----------|----------|
| `debug/` | Bug investigation, performance issues, error tracing |
| `design/` | Feature design, architecture decisions, UX planning |
| `feature/` | Feature implementation spanning multiple sessions |
| `refactor/` | Code restructuring, migration work |

## Naming Convention

Each session gets a dated folder: `YYYY-MM-DD-brief-description/`

```
debug/
└── 2026-01-06-filter-search-performance/
    └── SESSION.md
```

## Usage

**Start a session:**
```
/session-log start debug filter-search-performance
```

**Resume a session:**
```
/session-log resume docs/sessions/debug/2026-01-06-filter-search-performance
```

Or simply point Claude to the SESSION.md file to restore context.

## Related

- **compound-docs**: For documenting *solved* problems (searchable knowledge base)
- **DEBUG_SESSION.md**: Legacy scratchpad approach (see CLAUDE.md)
