import { renderPage } from './browser.js';
import { pickInternalPages } from './html.js';
import { fetchHomepage, fetchPage, fetchRobots, lookupCertIssuer, lookupDns } from './http.js';

function needsBrowser(page) {
    if ([403, 429, 503].includes(page.status)) return true;
    const text = page.html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ')
        .replace(/\s+/g, ' ');
    return text.length < 500;
}

export async function collectDomain(
    input,
    { maxPages = 3,
        timeoutMs = 10000, browserMode = 'auto',
        browser = null, jsChains = [] } = {},
) {
    const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
    const fetchedAt = new Date().toISOString();

    const [home, dns] = await Promise.all([fetchHomepage(domain, timeoutMs), lookupDns(domain)]);
    const result = { domain, fetchedAt, pages: [], dns, robots: '', certIssuer: '', errors: [...home.errors] };
    if (!home.page) return result;
    result.pages.push(home.page);

    const { origin, hostname } = new URL(home.page.finalUrl);
    const innerUrls = pickInternalPages(home.page.links, home.page.finalUrl, Math.max(0, maxPages - 1));

    const [robots, certIssuer, ...innerPages] = await Promise.all([
        fetchRobots(origin, timeoutMs),
        lookupCertIssuer(hostname),
        ...innerUrls.map((url) =>
            fetchPage(url, timeoutMs).catch((err) => {
                result.errors.push(`${url}: ${err.cause?.code ?? err.name}`);
                return null;
            }),
        ),
    ]);
    result.robots = robots;
    result.certIssuer = certIssuer;
    result.pages.push(...innerPages.filter(Boolean));

    const wantsBrowser = browserMode === 'all' || (browserMode === 'auto' && needsBrowser(home.page));
    if (browser && wantsBrowser) {
        try {
            result.pages.push(await renderPage(browser, home.page.finalUrl, jsChains, timeoutMs * 2));
        } catch (err) {
            result.errors.push(`browser: ${err.message.split('\n')[0]}`);
        }
    }

    return result;
}