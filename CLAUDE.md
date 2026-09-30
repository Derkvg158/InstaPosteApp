# Instructies voor Claude

Deze repo plant Instagram-posts voor @je_grote_dag. Zie README.md voor de opzet (planner op Netlify, Supabase-project `kcbjlmgbahpletdieyah`, GitHub Action plaatst).

## Derk levert content aan: posts klaarzetten

1. Verzamel de foto's in een map buiten de repo (niet committen), bijv. `../batch-<datum>/`. HEIC niet ondersteund: vraag om JPG/PNG.
2. Schrijf daar `planning.json`: `[{ "foto", "datum" (JJJJ-MM-DD), "tijd" (UU:MM, Nederlandse tijd), "tekst" }]`.
   - Schrijf je zelf teksten: Nederlands, warm en persoonlijk, bruiloftsbranche, max ~5–10 relevante hashtags aan het eind.
   - Kies tijden rond 19:00–20:00 tenzij anders gevraagd; niet twee posts op hetzelfde moment.
3. `node scripts/inplannen.mjs <map>` (controle) → laat Derk het overzicht zien en vraag akkoord.
4. Na akkoord: `node scripts/inplannen.mjs <map> --echt`. De posts verschijnen in de planner, waar ze nog aangepast kunnen worden.

Vereist `.env` in de repo-root (staat in .gitignore) met `SUPABASE_URL` en `SUPABASE_SECRET_KEY`. Die zet Derk er zelf in; vraag nooit om de sleutel in de chat.
Zonder `.env`: rijen kunnen niet zonder foto-upload worden ingevoegd, dus eerst om `.env` vragen.
