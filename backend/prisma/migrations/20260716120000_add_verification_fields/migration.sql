-- Ajout : pays, vérification téléphone (SMS), et champs profil optionnels
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifyCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifyExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'Maroc';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "height" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stylePrefs" TEXT;
