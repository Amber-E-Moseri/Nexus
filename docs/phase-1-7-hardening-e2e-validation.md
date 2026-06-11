# Phase 1.7 — Hardening & E2E Validation

## Scope

Phase 1.7 is a live-project validation pass for the People, invitation, activation, email delivery, RLS, and activity log flows delivered in Phase 1.5 and Phase 1.6.

This phase validates:

- Invitation lifecycle
- Activation flow
- Role boundaries
- Email delivery
- Activity logging
- Basic regression checks

This phase is not feature work. New features should not be added unless required to fix a defect found during validation.

## Required Test Accounts

Use real test accounts in the live Supabase project.

| Role | Email | Department | Expected Access Level | Test Purpose |
|---|---|---|---|---|
| `super_admin` | `________________` | Org-wide | Full People access across all departments | Validate global visibility, invitation creation, resend, cancel, and unrestricted People management |
| `dept_lead` | `________________` | `________________` | Department-scoped People access | Validate department-only visibility, member invitation rules, and restricted management boundaries |
| `pastor` | `________________` | `________________` | Assigned-member visibility only, read-only People access | Validate pastoral visibility, read-only behavior, and no invitation privileges |
| `member` | `________________` | `________________` | No People module access | Validate People access denial and route protection |
| Invited user | `________________` | `________________` | No active access until activation completes | Validate invitation email, activation link, password creation, and status transition |
| Inactive user | `________________` | `________________` | Login and People behavior according to inactive lifecycle rules | Validate lifecycle handling and dashboard/report treatment |
| Archived user | `________________` | `________________` | Historical-only retained record | Validate reporting retention and no active participation behavior |

## Invitation Lifecycle Test Cases

Fill one row per execution.

| Test Case | Preconditions | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Super admin creates invitation | Logged in as `super_admin` | Open People → Invitations, create invitation for any allowed role and department | Invitation record is created successfully |  |  |
| Dept lead creates invitation in own department | Logged in as `dept_lead` with known department | Create member invitation in own department | Invitation record is created successfully |  |  |
| Dept lead cannot invite outside own department | Logged in as `dept_lead` | Attempt invite outside own department by UI or direct request | Request is blocked |  |  |
| Pastor cannot create invitation | Logged in as `pastor` | Attempt create from UI and direct request | Request is blocked |  |  |
| Member cannot create invitation | Logged in as `member` | Attempt create from UI and direct request | Request is blocked |  |  |
| Invitation email sends | Valid pending invitation exists | Trigger send from Invitations page | Email is delivered, `delivery_status` becomes `sent` |  |  |
| Resend rotates token | Pending invitation exists with original token captured | Click Resend and compare old vs new token | Token changes, expiry extends, email sends again |  |  |
| Cancel prevents activation | Pending invitation exists | Cancel invitation, then open activation link | Activation is blocked |  |  |
| Expired token cannot activate | Invitation expiry has passed | Open activation link after expiry | Activation is blocked and invitation is treated as expired |  |  |
| Reused token cannot activate | Invitation already accepted once | Re-open same activation link | Activation is blocked |  |  |
| Successful activation creates active user | Pending valid invitation exists | Open activation link, create password, complete flow | User record exists and status is `active` |  |  |
| Activation records `activated_at` | Successful activation just completed | Inspect activated user record | `activated_at` is populated |  |  |
| Activation writes status history | Successful activation just completed | Inspect `user_status_history` | Transition from invited lifecycle state to active is recorded |  |  |

## Role and RLS Validation

| Test Case | Preconditions | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Super admin sees all People pages and all users | Logged in as `super_admin` | Visit all People routes and review user lists | Full visibility across all departments |  |  |
| Dept lead sees only own department users | Logged in as `dept_lead` | Visit People → Users and compare against cross-department data | Only own department users are visible |  |  |
| Dept lead cannot manage another department | Logged in as `dept_lead` | Attempt direct or indirect management action on another department | Action is blocked |  |  |
| Pastor sees only assigned members | Logged in as `pastor` with known assignments | Visit People views and compare against actual assignments | Only assigned members are visible |  |  |
| Pastor People UI is read-only | Logged in as `pastor` | Attempt create, resend, cancel, edit, transfer, assign actions | No write action succeeds |  |  |
| Member cannot access People module | Logged in as `member` | Attempt route navigation to People paths | Access is denied |  |  |
| Direct API/RPC calls respect same boundaries as UI | Use real session tokens for each role | Invoke relevant RPCs or function calls directly | Backend enforcement matches UI boundaries |  |  |

## Email Delivery Validation

| Check | Preconditions | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Email received in Gmail | Gmail test address available | Send invitation | Email arrives |  |  |
| Email received in Outlook | Outlook test address available | Send invitation | Email arrives |  |  |
| Email received in Yahoo if available | Yahoo test address available | Send invitation | Email arrives |  |  |
| From name is correct | Delivery succeeded | Inspect delivered message header and display name | Branding is correct |  |  |
| From email/domain is correct | Delivery succeeded | Inspect sender address | Verified sender is correct |  |  |
| Activation button works | Delivery succeeded | Click CTA button in email | Opens activation page correctly |  |  |
| Link points to correct frontend URL | Delivery succeeded | Inspect button/link target | URL uses correct `INVITATION_FRONTEND_URL` base |  |  |
| Message is readable on mobile | Delivered message available | Open email on mobile device or emulator | Layout remains readable and usable |  |  |
| Failed send records `delivery_error` | Force or simulate a delivery failure | Attempt send | `delivery_status` becomes `failed` and `delivery_error` is populated |  |  |
| Failed send can be retried | Failed invitation exists | Retry send from UI | New attempt occurs and state updates accordingly |  |  |

## Activity Log Audit

Verify the following events are present and correctly formed.

| Event | Expected Actor | Expected `entity_type` | Expected `entity_id` | Expected Timestamp Behavior | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| `invitation_created` | Inviting user | `user_invitation` | Invitation id | Recorded at creation time |  |  |
| `invitation_sent` | Sending user | `user_invitation` | Invitation id | Recorded at successful send time |  |  |
| `invitation_resent` | Sending user | `user_invitation` | Invitation id | Recorded at resend time |  |  |
| `invitation_cancelled` | Cancelling user | `user_invitation` | Invitation id | Recorded at cancel time |  |  |
| `invitation_failed` | Sending user | `user_invitation` | Invitation id | Recorded when email delivery fails |  |  |
| `user_activated` | Activated user or system-defined actor | `user` | User id | Recorded at successful activation |  |  |
| `user_status_changed` | Acting admin or user depending on flow | `user` | User id | Recorded whenever lifecycle status changes |  |  |
| `department_membership_changed` | Acting admin | `user` or department-membership entity used by project | Target user id or relevant record id | Recorded at reassignment time |  |  |
| `pastor_assignment_changed` | Acting admin | `pastor_member` or project assignment entity | Assignment-related id | Recorded at assign/remove/transfer time |  |  |

## Dashboard Regression Checks

| Check | Preconditions | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Active Members count is correct | Known user baseline exists | Compare dashboard count with live scoped records | Count matches expected live data |  |  |
| Pending Invitations count is correct | Known pending invitation baseline exists | Compare dashboard count with invitation table | Count matches expected pending records |  |  |
| Recently Activated Users updates | Activate a fresh invited user | Refresh dashboard | Widget reflects recent activation |  |  |
| Users Needing Attention updates | Have inactive, pending, or archived users in scope | Refresh dashboard | Widget reflects correct scoped total |  |  |
| Counts respect role permissions | Test as `super_admin`, `dept_lead`, and `pastor` | Compare each dashboard scope | Each role sees only allowed counts |  |  |

## Sign-off Matrix

| Area | Tester | Date | Result | Defects Linked | Approved By |
|---|---|---|---|---|---|
| Invitation lifecycle |  |  |  |  |  |
| Activation |  |  |  |  |  |
| RLS/permissions |  |  |  |  |  |
| Email delivery |  |  |  |  |  |
| Activity log |  |  |  |  |  |
| Dashboard widgets |  |  |  |  |  |
| Regression smoke test |  |  |  |  |  |

## Defect Policy

- Only defects found during validation should be fixed in Phase 1.7.
- Feature requests should be deferred to later phases.
- Any RLS or auth defect blocks Phase 2.
- Any email delivery defect blocks production invitation rollout, but does not block local Phase 2 development.

## Exit Criteria

Phase 1.7 is complete when:

- All critical invitation flows pass.
- All role-boundary tests pass.
- Email delivery is verified or documented with known provider limitation.
- Activity log audit passes.
- Dashboard counts are validated.
- No critical RLS or auth defects remain.
- Sign-off matrix is completed.
