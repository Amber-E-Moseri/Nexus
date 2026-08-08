-- Backdate early bird payments ($250 rate) to before Aug 5 cutoff
-- Mark these as full payments (not partial) since $250 was their early bird rate

UPDATE public.event_payments
SET 
  payment_date = '2026-08-04',
  amount_expected = 250.00  -- Update expected to match what they paid
WHERE full_name ILIKE ANY(ARRAY[
  '%Jeremy%', 
  '%David%', 
  '%Gerald%', 
  '%Fayzah%', 
  '%Waneta%', 
  '%Morenike%', 
  '%Ariyo%', 
  '%Elbridge%', 
  '%Yifan%'
])
AND amount_paid = 250.00;

-- Verify the updates
SELECT 
  full_name, 
  subgroup, 
  amount_expected, 
  amount_paid, 
  payment_date,
  CASE 
    WHEN amount_paid >= amount_expected THEN 'Paid in full'
    WHEN amount_paid > 0 THEN 'Partial'
    ELSE 'Unpaid'
  END as status
FROM public.event_payments
WHERE full_name ILIKE ANY(ARRAY[
  '%Jeremy%', 
  '%David%', 
  '%Gerald%', 
  '%Fayzah%', 
  '%Waneta%', 
  '%Morenike%', 
  '%Ariyo%', 
  '%Elbridge%', 
  '%Yifan%'
])
ORDER BY full_name;
