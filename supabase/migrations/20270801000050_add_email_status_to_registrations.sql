-- Add email_status tracking to registrations
ALTER TABLE registrations ADD COLUMN email_status TEXT DEFAULT 'not_registered' CHECK (email_status IN ('not_registered', 'confirming', 'confirmed'));

CREATE INDEX idx_registrations_email_status ON registrations(email_status);
