# Instagram-posttool voor Je Grote Dag

Plan posts voor **@je_grote_dag** via een eenvoudige pagina (telefoon en laptop). Een GitHub Action plaatst ze op het geplande moment via de Instagram API.

```
Planner-pagina  ──►  Supabase (posts + foto's)  ◄──  GitHub Action (elk half uur)  ──►  Instagram
```

## Onderdelen

| Onderdeel | Waar |
|---|---|
| Planner-pagina | `planner/index.html`, gehost op Netlify |
| Database + foto's + inloggen | Supabase-project `jegrotedag-instagram` (tabel `ig_posts`, fotomap `ig-images`) |
| Plaatsen | `scripts/publish.mjs` + `.github/workflows/instagram-publish.yml` |
| Token verversen | `scripts/refresh-token.mjs` + `.github/workflows/instagram-refresh-token.yml` (elke maandag) |

## GitHub-secrets

| Secret | Inhoud |
|---|---|
| `IG_ACCESS_TOKEN` | Long-lived Instagram-token |
| `IG_USER_ID` | Instagram-gebruikers-ID van @je_grote_dag |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`) |
| `GH_SECRETS_PAT` | Fine-grained PAT, alleen voor deze repo, met **Secrets: Read and write** |

## Iemand toegang geven tot de planner

1. Supabase → **Authentication → Users → Add user → Create new user**: e-mail + wachtwoord, vink *Auto Confirm User* aan.
2. Supabase → **Table Editor → ig_editors → Insert row**: hetzelfde e-mailadres, in kleine letters.

Alleen adressen in `ig_editors` kunnen posts zien of inplannen. Zet ook **Authentication → Sign In / Providers → Allow new users to sign up** uit.

## Statussen

`gepland` → `bezig` → `geplaatst`, of `mislukt` (met reden). Een mislukte post kan in de planner opnieuw worden ingepland. Bij een mislukte post faalt de workflow en stuurt GitHub een e-mail.

Blijft een post op `bezig` staan, dan is de workflow halverwege gestopt. Controleer dan op Instagram of hij toch geplaatst is, voordat je hem opnieuw inplant.

## Testen

**Actions → Instagram - posts plaatsen → Run workflow** met "Alleen controleren" aangevinkt: controleert de verbinding met Supabase en of de foto's bereikbaar zijn, zonder iets te plaatsen.

## Een batch posts in één keer klaarzetten (bijv. door Claude)

```bash
npm install
node scripts/inplannen.mjs ../mijn-batch          # controleren
node scripts/inplannen.mjs ../mijn-batch --echt   # inplannen
```

De map bevat de foto's en `planning.json`:

```json
[{ "foto": "locatie.jpg", "datum": "2026-10-05", "tijd": "19:00", "tekst": "Caption #trouwen" }]
```

Foto's worden automatisch omgezet naar JPEG in Instagram-formaat. Vereist een `.env` met `SUPABASE_URL=https://kcbjlmgbahpletdieyah.supabase.co` en `SUPABASE_SECRET_KEY=sb_secret_…`.
