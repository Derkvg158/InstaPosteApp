// Plaatst alle posts uit posts.json waarvan publish_at verstreken is en status "gepland" is.
//
//   node scripts/publish.mjs            -> echt publiceren
//   node scripts/publish.mjs --dry-run  -> alleen controleren (posts.json + bereikbaarheid afbeeldingen)
import { API_VERSION, STATUS, igRequest, readPosts, requireEnv, sleep, validatePosts, writePosts } from './lib.mjs';

const POSTS_FILE = process.env.POSTS_FILE || 'posts.json';
const DRY_RUN = process.argv.includes('--dry-run');
const STATUS_POLL_ATTEMPTS = 20;
const STATUS_POLL_INTERVAL_MS = 3000;

const log = (msg) => console.log(msg);
const logError = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::error::${msg}` : `FOUT: ${msg}`);

async function checkImage(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!res.ok) throw new Error(`afbeelding niet bereikbaar (HTTP ${res.status}): ${url}`);
  const type = res.headers.get('content-type') || '';
  if (!/image\/jpe?g/i.test(type)) throw new Error(`afbeelding is geen JPEG (content-type "${type}"): ${url}`);
}

async function waitUntilFinished(containerId, token) {
  for (let i = 1; i <= STATUS_POLL_ATTEMPTS; i++) {
    const { status_code, status } = await igRequest('GET', `/${containerId}`, {
      token,
      params: { fields: 'status_code,status' },
    });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new Error(`container ${containerId} heeft status ${status_code}${status ? ` (${status})` : ''}`);
    }
    log(`  container nog niet klaar (${status_code ?? 'onbekend'}), poging ${i}/${STATUS_POLL_ATTEMPTS}`);
    await sleep(STATUS_POLL_INTERVAL_MS);
  }
  throw new Error(`container ${containerId} was na ${STATUS_POLL_ATTEMPTS} pogingen nog niet klaar`);
}

async function publishPost(post, { token, userId }) {
  await checkImage(post.image_url);

  const container = await igRequest('POST', `/${userId}/media`, {
    token,
    params: { image_url: post.image_url, caption: post.caption },
  });
  log(`  container aangemaakt: ${container.id}`);

  await waitUntilFinished(container.id, token);

  const published = await igRequest('POST', `/${userId}/media_publish`, {
    token,
    params: { creation_id: container.id },
  });
  return published.id;
}

async function main() {
  const posts = await readPosts(POSTS_FILE);
  const errors = validatePosts(posts);
  if (errors.length) {
    errors.forEach(logError);
    throw new Error(`${POSTS_FILE} bevat ${errors.length} fout(en); er is niets geplaatst.`);
  }

  const now = Date.now();
  const due = posts.filter((p) => p.status === STATUS.GEPLAND && Date.parse(p.publish_at) <= now);
  const upcoming = posts.filter((p) => p.status === STATUS.GEPLAND && Date.parse(p.publish_at) > now);
  log(`API-versie ${API_VERSION}. ${due.length} post(s) klaar om te plaatsen, ${upcoming.length} nog gepland.`);

  if (DRY_RUN) {
    let bad = 0;
    for (const p of posts.filter((x) => x.status === STATUS.GEPLAND)) {
      try {
        await checkImage(p.image_url);
        log(`OK  ${p.id} (${p.publish_at})`);
      } catch (err) {
        bad++;
        logError(`${p.id}: ${err.message}`);
      }
    }
    log('Dry run: niets geplaatst.');
    if (bad) process.exitCode = 1;
    return;
  }

  if (!due.length) return;

  const token = requireEnv('IG_ACCESS_TOKEN');
  const userId = requireEnv('IG_USER_ID');
  let failures = 0;

  for (const post of due) {
    log(`Plaatsen: ${post.id} (gepland voor ${post.publish_at})`);
    try {
      const mediaId = await publishPost(post, { token, userId });
      post.status = STATUS.GEPLAATST;
      post.instagram_media_id = mediaId;
      post.geplaatst_op = new Date().toISOString();
      delete post.fout;
      log(`  geplaatst, media-ID ${mediaId}`);
    } catch (err) {
      failures++;
      post.status = STATUS.MISLUKT;
      post.fout = err.message;
      post.mislukt_op = new Date().toISOString();
      logError(`${post.id}: ${err.message}`);
    }
    // Na elke post opslaan, zodat een crash halverwege geen dubbele posts oplevert.
    await writePosts(POSTS_FILE, posts);
  }

  if (failures) {
    // Laat de workflow falen, dan stuurt GitHub een e-mail.
    throw new Error(`${failures} van ${due.length} post(s) mislukt; zie de log hierboven.`);
  }
}

main().catch((err) => {
  logError(err.message);
  process.exitCode = 1;
});
