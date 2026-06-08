UPDATE ubi_runtime_settings
SET interval_seconds = 1209600,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_by = 'migration-0006-two-week-cadence'
WHERE id = 1;

UPDATE ubi_eligibility
SET next_payment_date = date('now', '+14 days')
WHERE next_payment_date IS NULL
   OR next_payment_date <= date('now');
