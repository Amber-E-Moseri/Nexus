-- Seed default invitation templates
-- Note: Replace org_id_placeholder with actual org_id from organizations table
-- To find your org_id, run: SELECT id FROM organizations LIMIT 1;

-- Get first org_id (adjust this query if needed for your setup)
INSERT INTO invitation_templates (
  org_id,
  name,
  description,
  occasion,
  theme_config,
  animation_config,
  content_slots,
  token_fields,
  email_subject,
  email_preview,
  status,
  version
) 
SELECT 
  id,
  'Graduation Ceremony',
  'Elegant graduation invitation with gold accents',
  'graduation',
  '{"palette":{"envelope_body":"#1a3a2a","envelope_flap":"#1f4a30","seal":"#c9a227","card_bg":"#fefdf8","accent":"#c9a227","text_primary":"#1a3a2a","text_secondary":"#666"},"fonts":{"display":"Playfair Display","body":"Inter","accent":"Dancing Script"},"layout_variant":"classic"}',
  '{"envelope_style":"classic","flap_animation":"rotate3d","card_reveal":"slide_up","particles":"confetti","particle_colors":["#c9a227","#1a3a2a","#fefdf8"],"seal_icon":"🎓","ambient":"stars"}',
  '{"event_name":"Graduation Ceremony","event_date":"June 15, 2025","event_time":"2:00 PM","venue":"University Auditorium","message":"We cordially invite you to celebrate"}',
  '[{"key":"recipient_name","label":"Full Name","required":true},{"key":"degree","label":"Degree","required":false},{"key":"seat_number","label":"Seat Number","required":false}]',
  'You''re Invited to {{event_name}}',
  'Dear {{recipient_name}}, we''re delighted to invite you...',
  'active',
  1
FROM organizations
WHERE id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (
  SELECT 1 FROM invitation_templates 
  WHERE name = 'Graduation Ceremony' 
  AND org_id = organizations.id
);

-- Wedding template
INSERT INTO invitation_templates (
  org_id,
  name,
  description,
  occasion,
  theme_config,
  animation_config,
  content_slots,
  token_fields,
  email_subject,
  email_preview,
  status,
  version
)
SELECT 
  id,
  'Wedding Reception',
  'Romantic wedding invitation with elegant design',
  'wedding',
  '{"palette":{"envelope_body":"#2d1b3d","envelope_flap":"#3d2650","seal":"#d4af37","card_bg":"#fffbf5","accent":"#d4af37","text_primary":"#2d1b3d","text_secondary":"#666"},"fonts":{"display":"Great Vibes","body":"Lora","accent":"Playfair Display"},"layout_variant":"classic"}',
  '{"envelope_style":"classic","flap_animation":"rotate3d","card_reveal":"slide_up","particles":"none","particle_colors":["#d4af37"],"seal_icon":"💍","ambient":"none"}',
  '{"event_name":"Wedding Reception","event_date":"July 20, 2025","event_time":"6:00 PM","venue":"The Garden Estates","message":"Together with our hearts overflow with joy"}',
  '[{"key":"recipient_name","label":"Guest Name","required":true},{"key":"plus_one","label":"Plus One Name","required":false},{"key":"table_number","label":"Table Number","required":false}]',
  'Together With {{sender_name}}',
  'Our hearts overflow with joy as we invite you...',
  'active',
  1
FROM organizations
WHERE id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (
  SELECT 1 FROM invitation_templates 
  WHERE name = 'Wedding Reception' 
  AND org_id = organizations.id
);

-- Corporate template
INSERT INTO invitation_templates (
  org_id,
  name,
  description,
  occasion,
  theme_config,
  animation_config,
  content_slots,
  token_fields,
  email_subject,
  email_preview,
  status,
  version
)
SELECT 
  id,
  'Corporate Event',
  'Professional invitation for corporate gatherings',
  'corporate',
  '{"palette":{"envelope_body":"#003366","envelope_flap":"#004488","seal":"#0066cc","card_bg":"#ffffff","accent":"#0066cc","text_primary":"#003366","text_secondary":"#666666"},"fonts":{"display":"Helvetica","body":"Arial","accent":"Helvetica Neue"},"layout_variant":"classic"}',
  '{"envelope_style":"classic","flap_animation":"rotate3d","card_reveal":"slide_up","particles":"none","particle_colors":["#0066cc"],"seal_icon":"🎯","ambient":"none"}',
  '{"event_name":"Annual Corporate Summit","event_date":"September 15, 2025","event_time":"9:00 AM","venue":"Convention Center, Downtown","message":"Please join us for an inspiring day of insights and networking"}',
  '[{"key":"recipient_name","label":"Full Name","required":true},{"key":"company","label":"Company","required":false},{"key":"title","label":"Title","required":false}]',
  'You''re Invited to {{event_name}}',
  'We cordially invite you to attend our corporate event...',
  'active',
  1
FROM organizations
WHERE id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
AND NOT EXISTS (
  SELECT 1 FROM invitation_templates 
  WHERE name = 'Corporate Event' 
  AND org_id = organizations.id
);
