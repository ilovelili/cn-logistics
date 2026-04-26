/*
  # Company user zipcode

  Separates postal code from company address for registered company users.
*/

ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS zipcode text;
