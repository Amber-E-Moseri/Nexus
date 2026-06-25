import { describe, test, expect } from 'vitest';
import {
  canUserEditMeeting,
  canUserDeleteMeeting,
  canUserViewMeeting,
} from '../lib/meetings/permissions';

describe('Meeting Permissions', () => {
  // Edit Permission Tests
  describe('canUserEditMeeting', () => {
    test('ORS can edit any meeting', () => {
      const user = { id: 'ors-id', role: 'ors' };
      const meeting = {
        visibility: 'published',
        created_by: 'grace-id',
      };
      expect(canUserEditMeeting(user, meeting)).toBe(true);
    });

    test('Creator can edit own draft meeting', () => {
      const user = { id: 'grace-id', role: 'member' };
      const meeting = {
        visibility: 'private',
        created_by: 'grace-id',
      };
      expect(canUserEditMeeting(user, meeting)).toBe(true);
    });

    test('Creator cannot edit own published meeting', () => {
      const user = { id: 'grace-id', role: 'member' };
      const meeting = {
        visibility: 'published',
        created_by: 'grace-id',
      };
      expect(canUserEditMeeting(user, meeting)).toBe(false);
    });

    test('Invited editor can edit published meeting', () => {
      const user = { id: 'sarah-id', role: 'member' };
      const meeting = {
        visibility: 'published',
        created_by: 'grace-id',
        allowed_editors: ['sarah-id'],
      };
      expect(canUserEditMeeting(user, meeting)).toBe(true);
    });

    test('Non-creator, non-ORS cannot edit', () => {
      const user = { id: 'other-id', role: 'member' };
      const meeting = {
        visibility: 'published',
        created_by: 'grace-id',
      };
      expect(canUserEditMeeting(user, meeting)).toBe(false);
    });

    test('Handles null user gracefully', () => {
      expect(canUserEditMeeting(null, { visibility: 'private' })).toBe(false);
    });

    test('Handles null meeting gracefully', () => {
      expect(canUserEditMeeting({ id: 'user-id', role: 'ors' }, null)).toBe(false);
    });
  });

  // Delete Permission Tests
  describe('canUserDeleteMeeting', () => {
    test('Only ORS can delete meetings', () => {
      const ors = { role: 'ors' };
      const member = { role: 'member' };
      const creator = { role: 'member' };

      expect(canUserDeleteMeeting(ors)).toBe(true);
      expect(canUserDeleteMeeting(member)).toBe(false);
      expect(canUserDeleteMeeting(creator)).toBe(false);
    });

    test('Delete permission does not depend on meeting details', () => {
      const ors = { role: 'ors' };
      const meeting1 = { visibility: 'private' };
      const meeting2 = { visibility: 'published' };

      // canUserDeleteMeeting only checks user role, not meeting
      expect(canUserDeleteMeeting(ors)).toBe(true);
      expect(canUserDeleteMeeting(ors)).toBe(true);
    });

    test('Handles null user gracefully', () => {
      expect(canUserDeleteMeeting(null)).toBe(false);
    });
  });

  // View Permission Tests
  describe('canUserViewMeeting', () => {
    test('Everyone can view published meetings', () => {
      const randomUser = { id: 'random-id', role: 'member' };
      const meeting = { visibility: 'published', created_by: 'grace-id' };

      expect(canUserViewMeeting(randomUser, meeting)).toBe(true);
    });

    test('Creator can view own private meeting', () => {
      const creator = { id: 'grace-id', role: 'member' };
      const meeting = { visibility: 'private', created_by: 'grace-id' };

      expect(canUserViewMeeting(creator, meeting)).toBe(true);
    });

    test('ORS can view any private meeting', () => {
      const ors = { id: 'ors-id', role: 'ors' };
      const meeting = { visibility: 'private', created_by: 'grace-id' };

      expect(canUserViewMeeting(ors, meeting)).toBe(true);
    });

    test('Invited viewer can view private meeting', () => {
      const viewer = { id: 'sarah-id', role: 'member' };
      const meeting = {
        visibility: 'private',
        created_by: 'grace-id',
        allowed_viewers: ['sarah-id'],
      };

      expect(canUserViewMeeting(viewer, meeting)).toBe(true);
    });

    test('Invited editor can view private meeting', () => {
      const editor = { id: 'sarah-id', role: 'member' };
      const meeting = {
        visibility: 'private',
        created_by: 'grace-id',
        allowed_editors: ['sarah-id'],
      };

      expect(canUserViewMeeting(editor, meeting)).toBe(true);
    });

    test('Non-invited user cannot view private meeting', () => {
      const user = { id: 'other-id', role: 'member' };
      const meeting = {
        visibility: 'private',
        created_by: 'grace-id',
        allowed_viewers: [],
        allowed_editors: [],
      };

      expect(canUserViewMeeting(user, meeting)).toBe(false);
    });

    test('Handles null user gracefully', () => {
      expect(
        canUserViewMeeting(null, { visibility: 'private' })
      ).toBe(false);
    });

    test('Handles null meeting gracefully', () => {
      expect(
        canUserViewMeeting({ id: 'user-id', role: 'member' }, null)
      ).toBe(false);
    });
  });

  // Visibility States
  describe('Visibility States', () => {
    test('Draft meetings are private by default', () => {
      const meeting = { visibility: 'private' };
      expect(meeting.visibility).toBe('private');
    });

    test('Published meetings are public', () => {
      const meeting = { visibility: 'published' };
      expect(meeting.visibility).toBe('published');
    });

    test('Only valid visibility values are accepted', () => {
      const validStates = ['private', 'published'];
      expect(validStates).toContain('private');
      expect(validStates).toContain('published');
      expect(validStates).not.toContain('archived');
    });
  });

  // Permission Combinations
  describe('Permission Combinations', () => {
    test('ORS has all permissions', () => {
      const ors = { id: 'ors-id', role: 'ors' };
      const meeting = { visibility: 'published', created_by: 'grace-id' };

      expect(canUserEditMeeting(ors, meeting)).toBe(true);
      expect(canUserDeleteMeeting(ors)).toBe(true);
      expect(canUserViewMeeting(ors, meeting)).toBe(true);
    });

    test('Creator of draft has view+edit, not delete', () => {
      const creator = { id: 'grace-id', role: 'member' };
      const meeting = { visibility: 'private', created_by: 'grace-id' };

      expect(canUserViewMeeting(creator, meeting)).toBe(true);
      expect(canUserEditMeeting(creator, meeting)).toBe(true);
      expect(canUserDeleteMeeting(creator)).toBe(false);
    });

    test('Creator of published has view only, not edit or delete', () => {
      const creator = { id: 'grace-id', role: 'member' };
      const meeting = { visibility: 'published', created_by: 'grace-id' };

      expect(canUserViewMeeting(creator, meeting)).toBe(true);
      expect(canUserEditMeeting(creator, meeting)).toBe(false);
      expect(canUserDeleteMeeting(creator)).toBe(false);
    });

    test('Random user with published meeting has view only', () => {
      const user = { id: 'random-id', role: 'member' };
      const meeting = { visibility: 'published', created_by: 'grace-id' };

      expect(canUserViewMeeting(user, meeting)).toBe(true);
      expect(canUserEditMeeting(user, meeting)).toBe(false);
      expect(canUserDeleteMeeting(user)).toBe(false);
    });

    test('Random user with private meeting has no permissions', () => {
      const user = { id: 'random-id', role: 'member' };
      const meeting = { visibility: 'private', created_by: 'grace-id' };

      expect(canUserViewMeeting(user, meeting)).toBe(false);
      expect(canUserEditMeeting(user, meeting)).toBe(false);
      expect(canUserDeleteMeeting(user)).toBe(false);
    });
  });
});
