-- Téléphones : accepter les numéros d'urgence courts (15, 18, 112, 185…) et une parenthèse
-- en tête, ex. « (01) 23 45 67 ». Remplace les contraintes de 007_health.sql.

ALTER TABLE health_profiles DROP CONSTRAINT IF EXISTS health_profiles_doctor_phone_check;
ALTER TABLE health_profiles ADD CONSTRAINT health_profiles_doctor_phone_check
  CHECK (doctor_phone ~ '^\+?\(?[0-9][0-9 .()-]{1,22}$');

ALTER TABLE emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_phone_check;
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_phone_check
  CHECK (phone ~ '^\+?\(?[0-9][0-9 .()-]{1,22}$');
