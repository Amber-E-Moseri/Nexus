-- Remove Foundation School integration
-- This integration is no longer needed in the workspace

DELETE FROM public.external_integrations
WHERE name = 'Foundation School';

-- Reorder remaining integrations
UPDATE public.external_integrations
SET sort_order =
  CASE name
    WHEN 'CAN Map' THEN 1
    WHEN 'Canva' THEN 2
    WHEN 'Google Drive' THEN 3
    ELSE sort_order
  END
WHERE name IN ('CAN Map', 'Canva', 'Google Drive');
