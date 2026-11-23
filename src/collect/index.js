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

// browserMode: 'all' always renders, 'auto' only when needsBrowser(), 'off' never.
export async function collectDomain(domain, { maxPages = 3, timeoutMs = 15000, browserMode = 'auto', browser, jsChains = [] } = {}) {
    const fetchedAt = new Date().toISOString();
    const [home, dns] = await Promise.all([fetchHomepage(domain, timeoutMs), lookupDns(domain)]);
    const result = { domain, fetchedAt, pages: [], dns, errors: [...home.errors] };
    if (!home.page) return result;

    const { links, ...homepage } = home.page;
    result.pages.push(homepage);
    const { origin, hostname } = new URL(homepage.finalUrl);
    const innerUrls = pickInternalPages(links, homepage.finalUrl, Math.max(0, maxPages - 1));

    const [robots, certIssuer, ...innerPages] = await Promise.all([
        fetchRobots(origin, timeoutMs),
        lookupCertIssuer(hostname),
        ...innerUrls.map((url) =>
            fetchPage(url, timeoutMs)
                .then(({ links: _links, ...page }) => page)
                .catch((err) => {
                    result.errors.push(`${url}: ${err.message}`);
                    return undefined;
                }),
        ),
    ]);
    result.robots = robots;
    result.certIssuer = certIssuer;
    result.pages.push(...innerPages.filter(Boolean));

    const wantsBrowser = browserMode === 'all' || (browserMode === 'auto' && needsBrowser(homepage));
    if (browser && wantsBrowser) {
        try {
            result.pages.push(await renderPage(browser, homepage.finalUrl, jsChains, timeoutMs * 2));
        } catch (err) {
            result.errors.push(`browser: ${err.message.split('\n')[0]}`);
        }
    }
    return result;
}
