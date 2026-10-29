const fs = require('fs');
let c = fs.readFileSync('services/api/src/services/ebay.service.ts', 'utf8');

const target = `  static resolveAspects(title: string, brand?: string, customAspects?: Record<string, string[]>): Record<string, string[]> {
    const aspects: Record<string, string[]> = { ...(customAspects || {}) };
    if (!aspects['Brand']) {
      aspects['Brand'] = [brand || 'Generic'];
    }
    if (!aspects['Type']) {
      aspects['Type'] = ['Original'];
    }
    const t = title.toLowerCase();
    if (t.includes('ink') || t.includes('cartridge')) {
      if (!aspects['Compatible Brand']) aspects['Compatible Brand'] = ['For HP'];
      if (!aspects['Colour']) aspects['Colour'] = ['Black'];
      if (!aspects['Print Technology']) aspects['Print Technology'] = ['Inkjet'];
    }
    if (t.includes('headphone') || t.includes('earphone')) {
      if (!aspects['Connectivity']) aspects['Connectivity'] = ['Bluetooth'];
      if (!aspects['Model']) aspects['Model'] = ['Universal'];
    }
    return aspects;
  }`;

const replacement = `  static resolveAspects(title: string, brand?: string, customAspects?: Record<string, string[]>): Record<string, string[]> {
    const aspects: Record<string, string[]> = { ...(customAspects || {}) };
    const effectiveBrand = brand && brand !== 'Generic' ? brand : 'Brother';
    if (!aspects['Brand']) {
      aspects['Brand'] = [brand || 'Brother'];
    }
    if (!aspects['Type']) {
      aspects['Type'] = ['Original'];
    }
    const t = (title + ' ' + (brand || '')).toLowerCase();
    const isHeadphones = t.includes('headphone') || t.includes('earphone') || t.includes('audio');
    const isWatch = t.includes('watch') || t.includes('fitness');
    const isStationery = t.includes('pen') || t.includes('stationery') || t.includes('notebook');

    if (!isHeadphones && !isWatch && !isStationery) {
      // Default to Ink & Toner category requirements
      if (!aspects['Compatible Brand']) {
        const comp = effectiveBrand.replace(/^For\\s+/i, '');
        aspects['Compatible Brand'] = [\`For \${comp}\`];
      }
      if (!aspects['Colour']) {
        if (t.includes('yellow') || t.includes('xly') || /\\by\\b/.test(t)) aspects['Colour'] = ['Yellow'];
        else if (t.includes('magenta') || t.includes('xlm') || /\\bm\\b/.test(t)) aspects['Colour'] = ['Magenta'];
        else if (t.includes('cyan') || t.includes('xlc') || /\\bc\\b/.test(t)) aspects['Colour'] = ['Cyan'];
        else aspects['Colour'] = ['Black'];
      }
      if (!aspects['Print Technology']) aspects['Print Technology'] = ['Inkjet'];
    }

    if (isHeadphones) {
      if (!aspects['Connectivity']) aspects['Connectivity'] = ['Bluetooth'];
      if (!aspects['Model']) aspects['Model'] = ['Universal'];
    }
    return aspects;
  }`;

if (c.includes(target)) {
  c = c.replace(target, replacement);
  fs.writeFileSync('services/api/src/services/ebay.service.ts', c, 'utf8');
  console.log('Updated resolveAspects successfully');
} else {
  console.error('Target not found in ebay.service.ts');
}
