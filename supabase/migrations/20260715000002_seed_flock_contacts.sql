-- Seed Flock CRM contacts for pastor bfe9b3c0-fd5f-45fc-8780-539694ca1195.
-- Skips any row where the same pastor_id + full_name already exists.

INSERT INTO public.flock_contacts (pastor_id, full_name, role, fellowship, cadence_days)
VALUES
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Pastor Nigel Dara',               'Zonal Pastor',               NULL,                                    7),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Pastor Natasha Dara',             'Sub Group Pastor',           NULL,                                    7),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Pastor Toby Yinka Okunusi',       'Sub Group Pastor',           NULL,                                    7),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Pastor Naomi Ighodaro',           'Sub Group Pastor',           NULL,                                    7),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Pastor Tosin Ajibulu',            'Group Pastor',               NULL,                                    7),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Pastor Olamide Ayoola',           'Sub Group Pastor',           NULL,                                    7),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Jason Ikeokwu',               'Category C Coordinators',    'York University',                       14),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Emmanuel Akra',               'Category C Coordinators',    'University of Manitoba',                14),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Anita Ejemen Ibhakhomu',      'Category B Coordinators',    'Brock University',                      28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Boluwaji Yinka-Okunusi',      'Category B Coordinators',    'University of Winnipeg',                28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Amber Moseri',                'Category B Coordinators',    'York University',                       28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Oluwatobiloba Ibiyeye',       'Category B Coordinators',    'Toronto Metropolitan University',        28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Jeremy Anyalewechi',          'Category B Coordinators',    'University of Guelph',                  28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Jason Chan',                  'Category A Coordinators',    'University of Toronto Scarborough',     28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Praise Tiemo Ejiogu',         'Category A Coordinators',    'Thompson Rivers U',                     28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Joshua T. Kehinde',           'Category A Coordinators',    'George Brown College',                  28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Ella Ukpabia',                'Category A Coordinators',    'University of Saskatchewan',            28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Phoebe Kudowor',              'Category B Coordinators',    'University of Toronto Mississauga',     28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Jasmine Osasere Obazogbon',   'Category A Coordinators',    'Humber North College',                  28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Toluwa Olugbade',             'Category A Coordinators',    'University of Alberta',                 28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Emmanuella Prempeh',          'Category A Coordinators',    'Quebec',                                28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Bro Gerald Ikem',                 'Category A Coordinators',    'YorkVille',                             28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Adesua Sharon Adeleke',       'Category A Coordinators',    'University of Regina',                  28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Price Enoh',                  'Category A Coordinators',    'Sheridan OakVille',                     28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Ifedayomi Odusanya',          'Category A Coordinators',    'MacEwan University',                    28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Fayzah Lawal',                'Category A Coordinators',    'UOttawa',                               28),
  ('bfe9b3c0-fd5f-45fc-8780-539694ca1195', 'Sis Dorcas Mukhendi',             'Category A Coordinators',    'University of Alberta',                 28)
ON CONFLICT DO NOTHING;
