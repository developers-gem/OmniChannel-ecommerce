const fs = require('fs');
let lines = fs.readFileSync('services/api/src/modules/sync/sync.controller.ts', 'utf8').split('\n');

// Part 1: Replace lines 150 to 313 (0-indexed: 149 to 313)
// Check line 150 (index 149)
console.log('Line 150:', lines[149]);
console.log('Line 314:', lines[313]);

const newEbayBlockLines = [
  '              } else if (conn.channelType === ChannelType.EBAY) {',
  '                try {',
  '                  const result = await EbayService.syncAllEbayProducts(conn, req.tenantId);',
  '                  syncedCount += result.syncedCount;',
  '                  logger.info(`Successfully imported ${result.syncedCount} eBay products for ${conn.name}`);',
  '',
  '                  if (result.syncedCount > 0) {',
  '                    await NotificationService.notifyProductImported({',
  '                      organizationId: req.tenantId,',
  '                      channelName: conn.name,',
  '                      channelType: ChannelType.EBAY,',
  '                      count: result.syncedCount,',
  '                    });',
  '                  }',
  '                } catch (ebayErr: any) {',
  '                  logger.error(`Failed to fetch eBay products for ${conn.name}: ${ebayErr.message}`);',
  '                }',
  '              }'
];

lines.splice(149, 313 - 149, ...newEbayBlockLines);
console.log('Replaced CATALOG_IMPORT eBay block');

// Re-join and split to find line for Part 2
let content = lines.join('\n');
lines = content.split('\n');

// Find index of "// Clean up stale channel products not present on eBay"
const staleIndex = lines.findIndex(l => l.includes('// Clean up stale channel products not present on eBay'));
console.log('staleIndex:', staleIndex, 'line:', lines[staleIndex]);

if (staleIndex !== -1) {
  // delete lines from staleIndex up to and including the closing brace of `if (staleProds.length > 0) { ... }`
  // That's 13 lines (lines 598 to 610)
  lines.splice(staleIndex, 13, '            // Stale deletion omitted to preserve persistent mappings');
  console.log('Removed stale deletion in importToCanonical');
}

fs.writeFileSync('services/api/src/modules/sync/sync.controller.ts', lines.join('\n'), 'utf8');
