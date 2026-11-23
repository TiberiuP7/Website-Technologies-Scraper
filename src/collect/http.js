import { Resolver } from 'node:dns/promises';
import tls from 'node:tls';
import { parseHtml } from './html.js';

export const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_HTML = 3_000_000; // characters of HTML kept per page

export async function fetchPage(url, timeoutMs) {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {'user-agent': UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'en'},
    });

    const headers = {};
    res.headers.forEach((value, name) => {
        if (name !== 'set-cookie') headers[name] = [value];
    });
    const setCookies = res.headers.getSetCookie();
    if (setCookies.length) headers['set-cookie'] = setCookies;

    const cookies = {};
    for (const line of setCookies) {
        const [pair] = line.split(';');
        const i = pair.indexOf('=');
        if (i > 0) cookies[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
    }

    let html = '';
    if (/html|xml|^$/.test(res.headers.get('content-type') ?? '')) {
        html = (await res.text()).slice(0, MAX_HTML);
    } else {
        await res.body?.cancel();
    }

    const finalUrl = res.url || url;
    return { source: 'http', url, finalUrl, status: res.status, headers, cookies, html, ...parseHtml(html, finalUrl), js: {}, xhr: [] };
}

export async function fetchHomepage(domain, timeoutMs) {
    const errors = [];
    for (const url of [`https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`]) {
        try {
            return { page: await fetchPage(url, timeoutMs), errors };
        } catch (err) {
            errors.push(`${url}: ${err.cause?.code ?? err.name}`);
        }
    }
    return { page: null, errors };
}

export async function fetchRobots(origin, timeoutMs) {
    try {
        const res = await fetch(new URL('/robots.txt', origin), {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'user-agent': UA },
        });
        // Some sites answer every missing file with an HTML page; that isn't a robots.txt.
        if (!res.ok || /html/.test(res.headers.get('content-type') ?? '')) return '';
        return (await res.text()).slice(0, 100_000);
    } catch {
        return '';
    }
}

export async function lookupDns(domain) {
    const resolver = new Resolver({ timeout: 3000, tries: 2 });
    const safe = (promise) => promise.catch(() => []);
    const [mx, txt, ns, cname] = await Promise.all([
        safe(resolver.resolveMx(domain)),
        safe(resolver.resolveTxt(domain)),
        safe(resolver.resolveNs(domain)),
        safe(resolver.resolveCname(`www.${domain}`)),
    ]);
    return {
        MX: mx.map((record) => record.exchange),
        TXT: txt.map((chunks) => chunks.join('')),
        NS: ns,
        CNAME: cname,
    };
}

export function lookupCertIssuer(host, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const socket = tls.connect(
            { host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs },
            () => {
                const issuer = socket.getPeerCertificate()?.issuer;
                socket.end();
                resolve(issuer?.O ?? issuer?.CN ?? '');
            },
        );
        socket.on('error', () => resolve(''));
        socket.on('timeout', () => {
            socket.destroy();
            resolve('');
        });
    });
}