-- Sanitized HTML belongs to the same private conversation as the plain text.
-- Existing ticket deletion, account erasure and 90-day inactivity expiry remove
-- both representations together. Never replicate or journal message content.
ALTER TABLE support_messages ADD COLUMN body_html TEXT;
