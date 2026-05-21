ALTER TABLE users ADD COLUMN swish_number TEXT;
ALTER TABLE users
    ADD CONSTRAINT users_swish_number_e164_se
    CHECK (swish_number IS NULL OR swish_number ~ '^\+467[02369]\d{7}$');
