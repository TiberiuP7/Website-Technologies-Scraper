import fingerprints from '@openwapp/fingerprints';
import { compileRules } from './compile.js';

export { fingerprints };
export const rules = compileRules(fingerprints.technologies, fingerprints.categories);
// import fingerprints from '@openwapp/fingerprints';
//
// export { fingerprints };

