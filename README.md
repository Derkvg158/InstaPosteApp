# Instagram-posttool voor Je Grote Dag

Plaatst geplande posts uit `posts.json` automatisch op **@je_grote_dag** via de Instagram API (Instagram Login, `graph.instagram.com`).

## Bestanden

| Bestand | Wat |
|---|---|
| `posts.json` | Contentkalender |
| `scripts/publish.mjs` | Plaatst posts waarvan de tijd verstreken is |
| `scripts/refresh-token.mjs` | Ververst het long-lived token |
| `.github/workflows/instagram-publish.yml` | Draait elk half uur (en handmatig) |
| `.github/workflows/instagram-refresh-token.yml` | Draait elke maandag |

Geen npm-pakketten nodig; alleen Node 20 of nieuwer.

## GitHub-secrets

| Secret | Inhoud |
|---|---|
| `IG_ACCESS_TOKEN` | Long-lived Instagram-token |
| `IG_USER_ID` | Instagram-gebruikers-ID van @je_grote_dag |
| `GH_SECRETS_PAT` | Fine-grained PAT, alleen voor deze repo, met recht **Secrets: Read and write** |

Optioneel: variabele `IG_API_VERSION` (standaard `v26.0`).

## Een post inplannen

1. Zet de JPEG op Netlify, bijvoorbeeld `ig/2026-10-05-trouwlocatie.jpg`, en controleer dat de URL werkt.
2. Voeg een post toe aan `posts.json` met `status: "gepland"`.
   - `publish_at` in Nederlandse tijd **met offset**: `+02:00` in de zomertijd, `+01:00` in de wintertijd. Het script controleert of de offset bij de datum past.
3. Commit en push. De eerstvolgende run na `publish_at` plaatst de post.

Na plaatsing krijgt de post `status: "geplaatst"`, `instagram_media_id` en `geplaatst_op`. Bij een fout wordt dat `status: "mislukt"` met `fout` en `mislukt_op`, de workflow faalt en GitHub stuurt je een e-mail. Wil je een mislukte post opnieuw proberen, zet de status dan terug op `gepland`.

## Testen

- **Actions → Instagram - posts plaatsen → Run workflow**, met "Alleen controleren" aangevinkt. Dit controleert `posts.json` en of alle afbeeldingen bereikbaar zijn, zonder iets te plaatsen.
- Lokaal: `npm run check`.
- Voor een echte test: zet een post met een tijd in het verleden en start de workflow met het vinkje uit.

## Let op

- De controles zijn strikt: een fout in `posts.json` (bijv. een verkeerde offset of een dubbel id) blokkeert **alle** posts, zodat er niets half geplaatst wordt.
- GitHub zet geplande workflows uit als er 60 dagen geen activiteit in de repo is. Wordt een workflow uitgeschakeld, zet hem dan weer aan onder Actions.
- Een post die te laat is (bijvoorbeeld omdat de workflow uitstond) wordt alsnog geplaatst bij de eerstvolgende run.
