import { writeFile } from 'node:fs/promises';
import { launchBrowser } from '../collect/browser.js';
import { collectDomain } from '../collect/index.js';
import { loadDomains } from '../initialize/input.js';
import { rules } from '../initialize/rules.js';
import { detect } from '../match/detect.js';

const LIMIT = Infinity;
const CONCURRENCY = 10;

const techCounts = new Map();
let sitesOk = 0;
let totalDetections = 0;

const domains = (await loadDomains()).slice(0, LIMIT);
console.log(`${domains.length} domains, ${rules.techs.length} fingerprints`);

const browser = await launchBrowser();
const results = [];

async function check(domain) {
    const site = await collectDomain(domain, { browser,
        browserMode: 'all', jsChains: rules.jsChains });
    const technologies = site.pages.length ? detect(site, rules) : [];

    if (site.pages.length) {
        sitesOk++;
        totalDetections += technologies.length;
        for (const name of new Set(technologies.map((t) => t.name))) {
            techCounts.set(name, (techCounts.get(name) ?? 0) + 1);
        }
    }

    results.push({
        domain,
        status: site.pages.length ? 'ok' : 'failed',
        finalUrl: site.pages[0]?.finalUrl,
        errors: site.errors,
        technologies,
    });
    const names = technologies.map((t) => (t.version ? `${t.name} ${t.version}` : t.name));
    console.log(`[${results.length}/${domains.length}] ${domain}:`, site.pages.length ? names.join(', ') : 'FAILED');
}

try {
    let next = 0;
    const worker = async () => {
        while (next < domains.length) await check(domains[next++]);
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const technologies = [...techCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, sites]) => ({ name, sites }));

    const summary = {
        domainsTotal: domains.length,
        domainsReached: sitesOk,
        distinctTechnologies: technologies.length,
        totalDetections,
        technologies,
    };

    console.log(`\nReached ${sitesOk}/${domains.length} domains`);
    console.log(`${technologies.length} distinct technologies, ${totalDetections} detections`);
    console.table(technologies.slice(0, 20));

    await writeFile(new URL('../../summary.json', import.meta.url),
        JSON.stringify(summary, null, 2));
} finally {
    await browser?.close();
}

results.sort((a, b) => a.domain.localeCompare(b.domain));
const json = JSON.stringify(results, null, 2)
    .replace(/AIza[0-9A-Za-z_-]{35}/g, '[redacted-google-key]');
await writeFile(new URL('../../results.json', import.meta.url), json);
console.log('Saved results.json');