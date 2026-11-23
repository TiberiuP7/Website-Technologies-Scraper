import * as cheerio from 'cheerio';

const SKIP_FILES = /\.(pdf|jpe?g|png|gif|svg|webp|zip|mp3|mp4|docx?|xlsx?)$/i;
const INTERESTING = /(product|collection|shop|store|cart|checkout|contact|about|blog|pricing)/i;

const bareHost = (host) => host.replace(/^www\./, '');

function toUrl(href, base) {
    try {
        return new URL(href, base);
    } catch {
        return null;
    }
}

// http/https, www and a trailing slash still mean the same page.
function pageKey(href) {
    const url = new URL(href);
    return bareHost(url.hostname) + url.pathname.replace(/\/$/, '') + url.search;
}

export function parseHtml(html, pageUrl) {
    const $ = cheerio.load(html);
    const site = bareHost(new URL(pageUrl).hostname);
    const scriptSrc = [];
    const scripts = [];
    const meta = {};
    const links = new Set();

    $('script').each((_, el) => {
        const src = $(el).attr('src');
        const body = $(el).text();
        if (src) {
            const url = toUrl(src, pageUrl);
            if (url) scriptSrc.push(url.href);
        } else if (body.trim()) {
            scripts.push(body);
        }
    });

    $('meta').each((_, el) => {
        const name = ($(el).attr('name') ?? $(el).attr('property') ?? '').toLowerCase();
        const content = $(el).attr('content');
        if (name && content !== undefined) (meta[name] ??= []).push(content);
    });

    $('a[href]').each((_, el) => {
        const url = toUrl($(el).attr('href'), pageUrl);
        if (url && url.protocol.startsWith('http') && bareHost(url.hostname) === site) {
            url.hash = '';
            links.add(url.href);
        }
    });

    return { scriptSrc, scripts, meta, links: [...links] };
}

export function pickInternalPages(links, homepage, max) {
    const seen = new Set([pageKey(homepage)]);
    const pages = [];
    for (const link of links) {
        const key = pageKey(link);
        if (seen.has(key) || SKIP_FILES.test(new URL(link).pathname)) continue;
        seen.add(key);
        pages.push(link);
    }
    const preferred = pages.filter((link) => INTERESTING.test(new URL(link).pathname));
    const rest = pages.filter((link) => !preferred.includes(link));
    return [...preferred, ...rest].slice(0, max);
}
