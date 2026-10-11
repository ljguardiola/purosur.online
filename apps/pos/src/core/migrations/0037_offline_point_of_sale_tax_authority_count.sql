ALTER TABLE register_offline_point_of_sale
  ADD COLUMN tax_authority_last_authorized_number INTEGER
  CHECK (tax_authority_last_authorized_number IS NULL OR tax_authority_last_authorized_number >= 0);
