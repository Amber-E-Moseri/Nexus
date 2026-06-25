import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { userHasPermission } from '../lib/permissions/api';

/**
 * Hook to check if current user has a permission
 */
export function useHasPermission(permissionKey) {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setHasPermission(false);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      const result = await userHasPermission(user.id, permissionKey);
      setHasPermission(result);
      setLoading(false);
    };

    checkPermission();
  }, [user?.id, permissionKey]);

  return hasPermission;
}

/**
 * Hook to require a permission (with loading state)
 */
export function useRequirePermission(permissionKey) {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setHasPermission(false);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      const result = await userHasPermission(user.id, permissionKey);
      setHasPermission(result);
      setLoading(false);
    };

    checkPermission();
  }, [user?.id, permissionKey]);

  return { hasPermission, loading };
}
