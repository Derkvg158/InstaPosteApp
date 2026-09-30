// Ververst het long-lived Instagram-token en schrijft het nieuwe token naar het bestand
// in NEW_TOKEN_FILE. De workflow zet het daarna met `gh secret set` terug als GitHub-secret.
import { writeFile } from 'node:fs/promises';
import { igRequest, requireEnv } from './lib.mjs';

async function main() {
  const token = requireEnv('IG_ACCESS_TOKEN');
  const outFile = requireEnv('NEW_TOKEN_FILE');

  // refresh_access_token staat niet onder een versienummer.
  const res = await igRequest('GET', 'https://graph.instagram.com/refresh_access_token', {
    params: { grant_type: 'ig_refresh_token', access_token: token },
  });
  if (!res.access_token) throw new Error('Antwoord bevat geen access_token.');

  // Het nieuwe token nooit in de log tonen.
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${res.access_token}`);
  await writeFile(outFile, res.access_token, { encoding: 'utf8', mode: 0o600 });

  const days = Math.round((res.expires_in ?? 0) / 86400);
  console.log(`Token ververst; nieuw token is nog ${days} dagen geldig.`);
}

main().catch((err) => {
  console.log(process.env.GITHUB_ACTIONS ? `::error::${err.message}` : `FOUT: ${err.message}`);
  process.exitCode = 1;
});
