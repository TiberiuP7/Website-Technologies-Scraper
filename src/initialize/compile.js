const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function parsePattern(input) {
    const raw = String(input ?? '');
    const [body = '', ...tags] = raw.split('\\;');
    let version;
    let confidence = 100;
    for (const tag of tags) {
        const i = tag.indexOf(':');
        const key = i === -1 ? tag : tag.slice(0, i);
        const value = i === -1 ? '' : tag.slice(i + 1);
        if (key === 'version') version = value;
        if (key === 'confidence') confidence = Number(value) || 100;
    }
    let regex;
    try {
        regex = new RegExp(body, 'i');
    } catch {
        regex = /(?!)/;
    }
    return { raw, regex, version, confidence };
}

const patterns = (v) => toArray(v).map(parsePattern);

function pairs(v, lower = true) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
    const out = [];
    for (const [key, value] of Object.entries(v)) {
        for (const p of toArray(value)) out.push([lower ? key.toLowerCase() : key, parsePattern(p)]);
    }
    return out;
}

function domRules(v) {
    if (!v) return [];
    if (typeof v === 'string' || Array.isArray(v)) {
        return toArray(v).map((s) => ({ selector: String(s), exists: true, attributes: [] }));
    }
    const out = [];
    for (const [selector, spec] of Object.entries(v)) {
        const s = spec ?? {};
        const checks = ['exists', 'text', 'attributes', 'properties'].filter((k) => k in s);
        if (checks.length === 1 && checks[0] === 'properties') continue;
        out.push({
            selector,
            exists: 'exists' in s || checks.length === 0,
            text: 'text' in s ? parsePattern(s.text) : undefined,
            attributes: pairs(s.attributes),
        });
    }
    return out;
}

function compileTech(name, r) {
    return {
        name,
        cats: toArray(r.cats).map(Number),
        headers: pairs(r.headers),
        cookies: pairs(r.cookies),
        meta: pairs(r.meta),
        js: pairs(r.js, false),
        dns: pairs(r.dns, false).map(([k, p]) => [k.toUpperCase(), p]),
        scriptSrc: patterns(r.scriptSrc),
        scripts: patterns(r.scripts),
        html: patterns(r.html),
        url: patterns(r.url),
        robots: patterns(r.robots),
        xhr: patterns(r.xhr),
        text: patterns(r.text),
        certIssuer: patterns(r.certIssuer),
        dom: domRules(r.dom),
        implies: toArray(r.implies).map((i) => {
            const p = parsePattern(i);
            return { name: p.raw.split('\\;')[0] ?? '', confidence: p.confidence };
        }),
        requires: toArray(r.requires).map(String),
        requiresCategory: toArray(r.requiresCategory).map(Number),
        excludes: toArray(r.excludes).map(String),
    };
}

export function compileRules(technologies, categories = {}) {
    const techs = Object.entries(technologies).map(([name, raw]) => compileTech(name, raw));
    const cats = {};
    for (const [id, c] of Object.entries(categories)) cats[Number(id)] = c.name;
    const jsChains = [...new Set(techs.flatMap((t) => t.js.map(([chain]) => chain)))];
    return { techs, categories: cats, jsChains };
}