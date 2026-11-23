import { parseHtml } from './html.js';
import { UA } from './http.js';

export async function launchBrowser() {
    try {
        const { chromium } = await import('playwright');
        return await chromium.launch();
    } catch (err) {
        console.warn(`Browser tier disabled: ${err.message.split('\n')[0]}`);
        console.warn('Install it with: npm i playwright && npx playwright install chromium');
        return undefined;
    }
}

function readGlobals(chains) {
    const found = {};
    for (const chain of chains) {
        let value = window;
        for (const part of chain.split('.')) {
            if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
                value = undefined;
                break;
            }
            try {
                value = value[part];
            } catch {
                value = undefined;
            }
        }
        if (value === undefined || value === null) continue;
        found[chain] = ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '';
    }
    return found;
}

export async function renderPage(browser, url, jsChains, timeoutMs) {
    const context = await browser.newContext({ userAgent: UA, locale: 'en-US', ignoreHTTPSErrors: true });
    try {
        const page = await context.newPage();
        const scriptRequests = [];
        const xhr = [];
        page.on('request', (req) => {
            const type = req.resourceType();
            if (type === 'script') scriptRequests.push(req.url());
            if (type === 'xhr' || type === 'fetch') xhr.push(req.url());
        });

        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

        const js = await page.evaluate(readGlobals, jsChains);
        const html = await page.content();
        const finalUrl = page.url();
        const parsed = parseHtml(html, finalUrl);

        const headers = {};
        for (const [name, value] of Object.entries(response ? await response.allHeaders() : {})) {
            headers[name] = name === 'set-cookie' ? value.split('\n') : [value];
        }
        const cookies = {};
        for (const c of await context.cookies()) cookies[c.name.toLowerCase()] = c.value;

        return {
            source: 'browser',
            url,
            finalUrl,
            status: response?.status() ?? 0,
            headers,
            cookies,
            html,
            scriptSrc: [...new Set([...parsed.scriptSrc, ...scriptRequests])],
            scripts: parsed.scripts,
            meta: parsed.meta,
            js,
            xhr,
        };
    } finally {
        await context.close();
    }
}
