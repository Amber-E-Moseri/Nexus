-- Assign 26 ICPLC participants to BLW Central East Subgroup A (names matched
-- case/punctuation-insensitively; unmatched names are simply not updated).
UPDATE public.icplc_participants p
SET subgroup = 'BLW Central East Subgroup A',
    updated_at = now()
WHERE regexp_replace(lower(trim(p.full_name)), '[^a-z0-9]', '', 'g') IN (
  SELECT regexp_replace(lower(trim(n)), '[^a-z0-9]', '', 'g')
  FROM unnest(ARRAY[
    'Adesua Sharon Adeleke', 'Alexander Dangiwa', 'Ariyo Ajibulu', 'Boluwaji Yinka-Okunusi',
    'Chiara Nwobodo', 'Chijioke Agbanelo', 'Chimeremeze Obialo', 'David Akalue', 'David Bedjra',
    'Ebubechukwu Abioye', 'Ella Ukpabia', 'Emmanuel Akra', 'Emmanuel Valentine Unegbu',
    'Erika Mhozya', 'Esther Ileogben', 'Faith Ogedengbe', 'Favor Olatinpo', 'Gideon Adedeji',
    'Jehovani Yamusengwa', 'John Nwansi', 'Nelson Eziokwu', 'Nnah Laura Ajigo',
    'Sharon Mutambwi', 'Toby Yinka-Okunusi', 'Vera Arua', 'Waneta Ikheloa-Agbonselobho'
  ]) AS n
);

-- BLW West Subgroup B
UPDATE public.icplc_participants p
SET subgroup = 'BLW West Subgroup B',
    updated_at = now()
WHERE regexp_replace(lower(trim(p.full_name)), '[^a-z0-9]', '', 'g') IN (
  SELECT regexp_replace(lower(trim(n)), '[^a-z0-9]', '', 'g')
  FROM unnest(ARRAY[
    'Chiamaka Okeke', 'Olamide Ayoola', 'Yifan Wang', 'Ziggy Nwokeji'
  ]) AS n
);

