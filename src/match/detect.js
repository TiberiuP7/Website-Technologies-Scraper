import * as cheerio from 'cheerio';
import { rules } from '../initialize/rules.js';

const MAX_EVIDENCE = 5;
const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

function resolveVersion(template, match) {
    let v = template;
    match.forEach((group, i) => {
        const ternary = new RegExp(`\\\\${i}\\?([^:]+):(.*)$`).exec(v);
        if (ternary) v = v.replace(ternary[0], group ? (ternary[1] ?? '') : (ternary[2] ?? ''));
        v = v.split(`\\${i}`).join(group ?? '');
    });
    return v.trim();
}

function nameMatches(ruleName, actual) {
    if (!ruleName.includes('*')) return ruleName === actual;
    const re = new RegExp(`^${ruleName.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return re.test(actual);
}

export function detect(art, rules) {
    const found = new Map();
    const domCache = new Map();
    const textCache = new Map();
    const $of = (page) => {
        if (!domCache.has(page)) domCache.set(page, cheerio.load(page.html));
        return domCache.get(page);
    };

    const hit = (tech, pattern, match, ev) => {
        let acc = found.get(tech.name);
        if (!acc) found.set(tech.name, (acc = { tech, confidence: 0, evidence: [], seen: new Set() }));
        // The same rule matching again on another page adds no confidence.
        const key = `${ev.type}|${ev.key ?? ''}|${pattern?.raw ?? ''}`;
        if (acc.seen.has(key)) return;
        acc.seen.add(key);
        acc.confidence = Math.min(100, acc.confidence + (pattern?.confidence ?? 100));
        if (pattern?.version && match && !acc.version) {
            const v = resolveVersion(pattern.version, match);
            if (v) acc.version = v;
        }
        if (acc.evidence.length < MAX_EVIDENCE) {
            acc.evidence.push({ ...ev, value: clip(ev.value), pattern: pattern?.raw || undefined });
        }
    };

    const test = (tech, p, value, ev) => {
        const m = p.regex.exec(value);
        if (!m) return;
        const proof = value.length > 200 ? value.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40) : value;
        hit(tech, p, m, { ...ev, value: proof });
    };

    for (const tech of rules.techs) {
        for (const page of art.pages) {
            const where = { page: page.finalUrl, source: page.source };

            for (const [name, p] of tech.headers) {
                for (const v of page.headers[name] ?? []) test(tech, p, v, { type: 'header', key: name, ...where });
            }
            for (const [name, p] of tech.cookies) {
                for (const [cName, cValue] of Object.entries(page.cookies)) {
                    if (nameMatches(name, cName)) test(tech, p, cValue, { type: 'cookie', key: cName, ...where });
                }
            }
            for (const [name, p] of tech.meta) {
                for (const v of page.meta[name] ?? []) test(tech, p, v, { type: 'meta', key: name, ...where });
            }
            for (const p of tech.scriptSrc) {
                for (const src of page.scriptSrc) test(tech, p, src, { type: 'scriptSrc', ...where });
            }
            for (const p of tech.scripts) {
                for (const body of page.scripts) test(tech, p, body, { type: 'script', ...where });
            }
            for (const p of tech.html) test(tech, p, page.html, { type: 'html', ...where });
            for (const p of tech.url) test(tech, p, page.finalUrl, { type: 'url', ...where });
            for (const p of tech.xhr) {
                for (const u of page.xhr ?? []) test(tech, p, u, { type: 'xhr', ...where });
            }
            for (const [chain, p] of tech.js) {
                const v = page.js?.[chain];
                if (v !== undefined) test(tech, p, v, { type: 'js', key: chain, ...where });
            }
            if (tech.text.length) {
                if (!textCache.has(page)) textCache.set(page, $of(page)('body').text());
                for (const p of tech.text) test(tech, p, textCache.get(page), { type: 'text', ...where });
            }
            for (const rule of tech.dom) {
                try {
                    const nodes = $of(page)(rule.selector);
                    if (!nodes.length) continue;
                    if (rule.exists) hit(tech, undefined, null, { type: 'dom', key: rule.selector, value: 'element exists', ...where });
                    if (rule.text) test(tech, rule.text, nodes.text(), { type: 'dom', key: rule.selector, ...where });
                    for (const [attr, p] of rule.attributes) {
                        nodes.each((_, el) => {
                            const v = $of(page)(el).attr(attr);
                            if (v !== undefined) test(tech, p, v, { type: 'dom', key: `${rule.selector}[${attr}]`, ...where });
                        });
                    }
                } catch {

                }
            }
        }

        for (const [type, p] of tech.dns) {
            for (const v of art.dns[type] ?? []) test(tech, p, v, { type: 'dns', key: type });
        }
        if (art.robots) for (const p of tech.robots) test(tech, p, art.robots, { type: 'robots' });
        if (art.certIssuer) for (const p of tech.certIssuer) test(tech, p, art.certIssuer, { type: 'certIssuer' });
    }

    const byName = new Map(rules.techs.map((t) => [t.name, t]));

    const applyImplies = (map) => {
        const queue = [...map.values()];
        for (let acc = queue.shift(); acc; acc = queue.shift()) {
            for (const imp of acc.tech.implies) {
                const tech = byName.get(imp.name);
                if (!tech || map.has(tech.name)) continue;
                const implied = {
                    tech,
                    confidence: Math.min(acc.confidence, imp.confidence),
                    evidence: [{ type: 'implied', value: `implied by ${acc.tech.name}` }],
                    seen: new Set(),
                };
                map.set(tech.name, implied);
                queue.push(implied);
            }
        }
    };

    const closure = new Map(found);
    applyImplies(closure);
    const closureCats = new Set([...closure.values()].flatMap((a) => a.tech.cats));
    for (const [name, acc] of found) {
        const { requires, requiresCategory } = acc.tech;
        const okTech = !requires.length || requires.some((r) => closure.has(r));
        const okCat = !requiresCategory.length || requiresCategory.some((c) => closureCats.has(c));
        if (!okTech || !okCat) found.delete(name);
    }
    applyImplies(found);
    for (const acc of [...found.values()]) for (const ex of acc.tech.excludes) found.delete(ex);

    return [...found.values()]
        .map((a) => ({
            name: a.tech.name,
            categories: a.tech.cats.map((c) => rules.categories[c] ?? String(c)),
            version: a.version,
            confidence: a.confidence,
            evidence: a.evidence,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
