# Nexus Incident Log

Record every production incident, even when resolved quickly. Do not include secrets, access tokens, personal data, or raw provider payloads.

## Entry Template

```markdown
## YYYY-MM-DD - Short incident title

- Severity: SEV-1 / SEV-2 / SEV-3
- Start / resolved: UTC timestamps
- Incident lead:
- Affected systems and users:
- Customer impact:
- Detection:
- Timeline:
  - HH:MM - event
- Root cause:
- Immediate mitigation:
- Permanent correction:
- Prevention / follow-up owner and due date:
- Related PR, deployment, migration, or provider incident:
```

## Severity Guide

| Severity | Meaning | Response |
| --- | --- | --- |
| SEV-1 | Data exposure/loss or core platform unavailable | Stop changes, assign incident lead, mitigate immediately, notify custodians. |
| SEV-2 | Major feature unavailable or significant incorrect behavior | Triage promptly; use rollback when faster than repair. |
| SEV-3 | Limited feature defect with a workaround | Log, prioritize, and ship through normal review. |

## Incidents

No entries recorded in this operational log yet.
