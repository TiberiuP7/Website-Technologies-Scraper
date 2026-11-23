import {readFile} from 'node:fs/promises';
import {parquetReadObjects} from 'hyparquet';

export async function loadDomains()
{
    const bytes = await readFile(new URL('./domains.parquet', import.meta.url));

    const file = Uint8Array.from(bytes).buffer;
    const rows = await parquetReadObjects({file});

    const uniqueDomains = new Set();
    for (const row of rows) {
        const domain = row.root_domain.trim().toLowerCase();
        if (domain) uniqueDomains.add(domain);
    }

    return Array.from(uniqueDomains);
}