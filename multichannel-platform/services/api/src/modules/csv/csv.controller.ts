import { Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  CsvImportJob,
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  ProductCostHistory,
  InventoryMovement,
  ChannelProduct,
  ProductMapping,
} from '../../database/models';
import { CsvJobStatus, InventoryChangeType, MappingConfidence, MappingStatus } from '@multichannel/shared';
import { logger } from '../../utils/logger';

// Prevent spreadsheet formula injection (=, +, -, @)
function sanitizeForCsv(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

const FIELD_CANDIDATES: Record<string, string[]> = {
  sku: ['sku', 'master_sku', 'mastersku', 'variant_sku', 'item_code', 'itemcode', 'product_code', 'code', 'handle', 'id'],
  title: ['title', 'product_title', 'producttitle', 'name', 'product_name', 'productname', 'item_name', 'itemname'],
  brand: ['brand', 'vendor', 'manufacturer', 'maker'],
  category: ['category', 'product_category', 'productcategory', 'type', 'product_type', 'producttype', 'department', 'collection'],
  description: ['description', 'desc', 'body', 'body_html', 'bodyhtml', 'details', 'summary'],
  costPrice: ['cost_price', 'costprice', 'cost', 'unit_cost', 'purchase_price', 'buying_price'],
  retailPrice: ['retail_price', 'retailprice', 'price', 'unit_price', 'selling_price', 'variant_price', 'msrp', 'sale_price'],
  stock: ['stock', 'quantity', 'qty', 'inventory', 'inventory_quantity', 'inventory_qty', 'tracked_stock', 'count', 'total_stock'],
  barcode: ['barcode', 'upc', 'ean', 'isbn'],
  tags: ['tags', 'tag', 'keywords', 'labels'],
  images: ['images', 'image', 'image_url', 'imageurl', 'image_link', 'imagelink', 'img', 'photo', 'picture', 'image_src', 'photo_url'],
};

function autoDetectFieldMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
    for (const cand of candidates) {
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = headers.find(
        (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanCand
      );
      if (match) {
        mapping[field] = match;
        break;
      }
    }
  }
  return mapping;
}

function getRowValue(
  row: Record<string, any>,
  field: string,
  mappingConfig?: Record<string, string>
): string {
  // 1. Explicit user mapping
  if (mappingConfig && mappingConfig[field] && row[mappingConfig[field]] !== undefined && row[mappingConfig[field]] !== null) {
    return String(row[mappingConfig[field]]).trim();
  }

  // 2. Direct key match
  if (row[field] !== undefined && row[field] !== null) {
    return String(row[field]).trim();
  }

  // 3. Fuzzy search in candidate headers
  const candidates = FIELD_CANDIDATES[field] || [];
  const rowKeys = Object.keys(row);
  for (const cand of candidates) {
    const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key of rowKeys) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey === cleanCand) {
        return row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';
      }
    }
  }
  return '';
}

export interface ProductDiffItem {
  id: string;
  rowIndex: number;
  sku: string;
  title: string;
  existingTitle?: string;
  changeType: 'NEW_PRODUCT' | 'PRICE_CHANGED' | 'STOCK_CHANGED' | 'BOTH_CHANGED' | 'UNCHANGED';
  oldPrice: number | null;
  newPrice: number;
  priceDiff: number;
  oldStock: number | null;
  newStock: number;
  stockDiff: number;
  brand?: string;
  category?: string;
  isNew: boolean;
}

export interface DiffSummary {
  totalRows: number;
  newCount: number;
  priceChangedCount: number;
  stockChangedCount: number;
  bothChangedCount: number;
  unchangedCount: number;
  totalChangedCount: number;
}

// Pure Native TypeScript Differential Comparison Engine:
// Compares CSV rows with current Master Catalog by SKU without any external libraries
async function computeDifferentialComparison(
  items: any[],
  organizationId: any
): Promise<{ summary: DiffSummary; diffs: ProductDiffItem[] }> {
  const skus = Array.from(
    new Set(
      items
        .map((it) => (it.sku || '').toUpperCase().trim())
        .filter((s) => s.length > 0)
    )
  );

  const existingVariants = await ProductVariant.find({
    organizationId,
    sku: { $in: skus },
  }).lean();

  const variantIds = existingVariants.map((v) => v._id);
  const canonicalIds = Array.from(
    new Set(existingVariants.map((v) => v.canonicalProductId).filter(Boolean))
  );

  const [existingInventory, existingCanonicals] = await Promise.all([
    InventoryItem.find({
      organizationId,
      canonicalVariantId: { $in: variantIds },
    }).lean(),
    CanonicalProduct.find({
      organizationId,
      _id: { $in: canonicalIds },
    }).lean(),
  ]);

  const variantMap = new Map<string, any>();
  for (const v of existingVariants) {
    variantMap.set(v.sku.toUpperCase(), v);
  }

  const inventoryMap = new Map<string, any>();
  for (const inv of existingInventory) {
    if (inv.canonicalVariantId) {
      inventoryMap.set(inv.canonicalVariantId.toString(), inv);
    }
  }

  const canonicalMap = new Map<string, any>();
  for (const cp of existingCanonicals) {
    canonicalMap.set(cp._id.toString(), cp);
  }

  let newCount = 0;
  let priceChangedCount = 0;
  let stockChangedCount = 0;
  let bothChangedCount = 0;
  let unchangedCount = 0;

  const diffs: ProductDiffItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowIndex = i + 1;
    const sku = (item.sku || '').toUpperCase().trim();
    const title = (item.title || '').trim();
    const newPrice = Math.max(0, parseFloat(String(item.retailPrice ?? 0).replace(/[^0-9.-]/g, '')) || 0);
    const newStock = Math.max(0, parseInt(String(item.stock ?? 0).replace(/[^0-9-]/g, ''), 10) || 0);

    const existingVariant = sku ? variantMap.get(sku) : undefined;

    if (!existingVariant) {
      newCount++;
      diffs.push({
        id: item.id || `row-${rowIndex}`,
        rowIndex,
        sku,
        title,
        changeType: 'NEW_PRODUCT',
        oldPrice: null,
        newPrice,
        priceDiff: 0,
        oldStock: null,
        newStock,
        stockDiff: 0,
        brand: item.brand,
        category: item.category,
        isNew: true,
      });
    } else {
      const inv = inventoryMap.get(existingVariant._id.toString());
      const cp = canonicalMap.get(existingVariant.canonicalProductId?.toString());

      const oldPrice = Number(existingVariant.retailPrice ?? (cp?.defaultRetailPrice ?? 0)) || 0;
      const oldStock = Number(inv?.trackedStock ?? 0);

      const priceDiff = Number((newPrice - oldPrice).toFixed(2));
      const stockDiff = newStock - oldStock;

      const priceChanged = Math.abs(priceDiff) > 0.001;
      const stockChanged = stockDiff !== 0;

      let changeType: 'BOTH_CHANGED' | 'PRICE_CHANGED' | 'STOCK_CHANGED' | 'UNCHANGED';
      if (priceChanged && stockChanged) {
        changeType = 'BOTH_CHANGED';
        bothChangedCount++;
      } else if (priceChanged) {
        changeType = 'PRICE_CHANGED';
        priceChangedCount++;
      } else if (stockChanged) {
        changeType = 'STOCK_CHANGED';
        stockChangedCount++;
      } else {
        changeType = 'UNCHANGED';
        unchangedCount++;
      }

      diffs.push({
        id: item.id || `row-${rowIndex}`,
        rowIndex,
        sku,
        title: title || existingVariant.title || cp?.title || '',
        existingTitle: existingVariant.title || cp?.title,
        changeType,
        oldPrice,
        newPrice,
        priceDiff,
        oldStock,
        newStock,
        stockDiff,
        brand: item.brand || cp?.brand,
        category: item.category || cp?.category,
        isNew: false,
      });
    }
  }

  const summary: DiffSummary = {
    totalRows: items.length,
    newCount,
    priceChangedCount,
    stockChangedCount,
    bothChangedCount,
    unchangedCount,
    totalChangedCount: newCount + priceChangedCount + stockChangedCount + bothChangedCount,
  };

  return { summary, diffs };
}

export class CsvController {
  // POST /api/v1/csv/preview - Parse raw CSV text and return columns, row count, detected mappings, differential comparison, and duplicate SKUs
  static async preview(req: Request, res: Response) {
    try {
      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== 'string') {
        return res.status(400).json({
          success: false,
          error: { message: 'CSV content string required', code: 'INVALID_CSV' },
        });
      }

      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      if (!records || records.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'CSV contains no rows or invalid headers', code: 'EMPTY_CSV' },
        });
      }

      const headers = Object.keys(records[0]);
      const detectedMapping = autoDetectFieldMapping(headers);

      const skuCountMap = new Map<string, number>();

      const products = records.map((record: any, index: number) => {
        const sku = getRowValue(record, 'sku', detectedMapping).toUpperCase();
        const title = getRowValue(record, 'title', detectedMapping);
        const brand = getRowValue(record, 'brand', detectedMapping) || 'Generic';
        const category = getRowValue(record, 'category', detectedMapping) || 'General';
        const description = getRowValue(record, 'description', detectedMapping);
        const barcode = getRowValue(record, 'barcode', detectedMapping);
        const costPrice = Math.max(0, parseFloat(getRowValue(record, 'costPrice', detectedMapping) || '0') || 0);
        const retailPrice = Math.max(0, parseFloat(getRowValue(record, 'retailPrice', detectedMapping) || '0') || 0);
        const stock = Math.max(0, parseInt(getRowValue(record, 'stock', detectedMapping) || '0', 10) || 0);
        const images = getRowValue(record, 'images', detectedMapping);
        const tags = getRowValue(record, 'tags', detectedMapping);

        if (sku) {
          skuCountMap.set(sku, (skuCountMap.get(sku) || 0) + 1);
        }

        return {
          id: `row-${index + 1}`,
          rowIndex: index + 1,
          sku,
          title,
          brand,
          category,
          description,
          barcode,
          costPrice,
          retailPrice,
          stock,
          images,
          tags,
          raw: record,
        };
      });

      const duplicateSkus: string[] = [];
      skuCountMap.forEach((count, sku) => {
        if (count > 1) duplicateSkus.push(sku);
      });

      // Compute native differential comparison against current database records
      const diffResult = await computeDifferentialComparison(products, req.tenantId);

      return res.json({
        success: true,
        data: {
          headers,
          detectedMapping,
          totalRows: records.length,
          previewRows: records,
          products,
          duplicateSkus,
          summary: diffResult.summary,
          diffs: diffResult.diffs,
        },
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: `CSV Parsing error: ${error.message}` },
      });
    }
  }

  // POST /api/v1/csv/inspect - Inspect and compare arbitrary products list against Master Catalog
  static async inspect(req: Request, res: Response) {
    try {
      const { csvContent, products: suppliedProducts, mappingConfig } = req.body;
      let items: any[] = [];

      if (Array.isArray(suppliedProducts) && suppliedProducts.length > 0) {
        items = suppliedProducts;
      } else if (csvContent && typeof csvContent === 'string') {
        const records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });

        if (records && records.length > 0) {
          const headers = Object.keys(records[0]);
          const resolvedMapping = {
            ...autoDetectFieldMapping(headers),
            ...mappingConfig,
          };

          items = records.map((record: any, index: number) => ({
            id: `row-${index + 1}`,
            rowIndex: index + 1,
            sku: getRowValue(record, 'sku', resolvedMapping).toUpperCase(),
            title: getRowValue(record, 'title', resolvedMapping),
            brand: getRowValue(record, 'brand', resolvedMapping) || 'Generic',
            category: getRowValue(record, 'category', resolvedMapping) || 'General',
            description: getRowValue(record, 'description', resolvedMapping),
            retailPrice: Math.max(0, parseFloat(getRowValue(record, 'retailPrice', resolvedMapping) || '0') || 0),
            stock: Math.max(0, parseInt(getRowValue(record, 'stock', resolvedMapping) || '0', 10) || 0),
          }));
        }
      }

      const diffResult = await computeDifferentialComparison(items, req.tenantId);
      return res.json({
        success: true,
        data: diffResult,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: `Inspection error: ${error.message}` },
      });
    }
  }

  // POST /api/v1/csv/import - Execute CSV import with smart auto-mapping, multi-field ingestion, and duplicate SKU protection
  static async import(req: Request, res: Response) {
    try {
      const { csvContent, products: suppliedProducts, fileName, mappingConfig = {}, destinationChannels } = req.body;

      let items: any[] = [];
      let totalRows = 0;
      let fileSize = 0;

      if (Array.isArray(suppliedProducts) && suppliedProducts.length > 0) {
        items = suppliedProducts;
        totalRows = suppliedProducts.length;
        fileSize = Buffer.byteLength(JSON.stringify(suppliedProducts), 'utf8');
      } else if (csvContent && typeof csvContent === 'string') {
        const records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });

        if (!records || records.length === 0) {
          return res.status(400).json({
            success: false,
            error: { message: 'The uploaded CSV file contains no valid rows.' },
          });
        }

        const headers = Object.keys(records[0]);
        const resolvedMapping = {
          ...autoDetectFieldMapping(headers),
          ...mappingConfig,
        };

        items = records.map((row: any, idx: number) => ({
          sku: getRowValue(row, 'sku', resolvedMapping).toUpperCase(),
          title: getRowValue(row, 'title', resolvedMapping),
          brand: getRowValue(row, 'brand', resolvedMapping) || 'Generic',
          category: getRowValue(row, 'category', resolvedMapping) || 'General',
          description: getRowValue(row, 'description', resolvedMapping),
          barcode: getRowValue(row, 'barcode', resolvedMapping),
          costPrice: Math.max(0, parseFloat(getRowValue(row, 'costPrice', resolvedMapping) || '0') || 0),
          retailPrice: Math.max(0, parseFloat(getRowValue(row, 'retailPrice', resolvedMapping) || '0') || 0),
          stock: Math.max(0, parseInt(getRowValue(row, 'stock', resolvedMapping) || '0', 10) || 0),
          tags: getRowValue(row, 'tags', resolvedMapping),
          images: getRowValue(row, 'images', resolvedMapping),
        }));

        totalRows = records.length;
        fileSize = Buffer.byteLength(csvContent, 'utf8');
      } else {
        return res.status(400).json({
          success: false,
          error: { message: 'CSV file content or products list is required' },
        });
      }

      // Create tracking job
      const importJob = await CsvImportJob.create({
        organizationId: req.tenantId,
        fileName: fileName || 'catalog-import.csv',
        fileSize,
        status: CsvJobStatus.IMPORTING,
        totalRows,
        mappingConfig,
        destinationChannels: destinationChannels || [],
      });

      let successfulRows = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let priceOnlyCount = 0;
      let stockOnlyCount = 0;
      let bothChangedCount = 0;
      let unchangedCount = 0;
      let failedRows = 0;
      const rowErrors: any[] = [];

      // Duplicate SKU tracking in this batch: add ONLY the first one and skip subsequent duplicates
      const seenBatchSkus = new Map<string, { rowNumber: number; title: string }>();
      const skippedDuplicates: Array<{
        rowNumber: number;
        sku: string;
        title: string;
        firstRow: number;
        firstTitle: string;
      }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowNumber = i + 1;

        try {
          const sku = (item.sku || '').toUpperCase().trim();
          const title = (item.title || '').trim();
          const brand = (item.brand || '').trim() || 'Generic';
          const category = (item.category || '').trim() || 'General';
          const description = (item.description || '').trim();
          const barcode = (item.barcode || '').trim();
          const costPrice = Math.max(0, parseFloat(String(item.costPrice || '0')) || 0);
          const retailPrice = Math.max(0, parseFloat(String(item.retailPrice || '0')) || 0);
          const stock = Math.max(0, parseInt(String(item.stock || '0'), 10) || 0);

          if (!sku) {
            throw new Error(`Missing required SKU at row ${rowNumber}`);
          }
          if (!title) {
            throw new Error(`Missing required Title at row ${rowNumber}`);
          }

          // If SKU already seen in this batch, keep ONLY the first one and skip this duplicate
          if (seenBatchSkus.has(sku)) {
            const first = seenBatchSkus.get(sku)!;
            skippedDuplicates.push({
              rowNumber,
              sku,
              title,
              firstRow: first.rowNumber,
              firstTitle: first.title,
            });
            continue;
          }

          seenBatchSkus.set(sku, { rowNumber, title });

          const rawTags = item.tags;
          const tags = Array.isArray(rawTags)
            ? rawTags
            : typeof rawTags === 'string'
            ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];

          const rawImages = item.images;
          const images = Array.isArray(rawImages)
            ? rawImages
            : typeof rawImages === 'string'
            ? rawImages
                .split(/[,;|]/)
                .map((u: string) => u.trim())
                .filter((u: string) => u.length > 0)
                .map((url: string, idx: number) => ({
                  url,
                  altText: title,
                  position: idx,
                  isPrimary: idx === 0,
                }))
            : [];

          // Check if variant / canonical product already exists in database
          let variant = await ProductVariant.findOne({
            organizationId: req.tenantId,
            sku,
          });

          let canonicalProd: any;

          if (variant) {
            // Update existing
            canonicalProd = await CanonicalProduct.findById(variant.canonicalProductId);

            const oldPrice = Number(variant.retailPrice ?? (canonicalProd?.defaultRetailPrice ?? 0)) || 0;
            const inv = await InventoryItem.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
            });
            const oldStock = Number(inv?.trackedStock ?? 0);

            const priceDiff = Number((retailPrice - oldPrice).toFixed(2));
            const stockDiff = inv ? stock - oldStock : 0;
            const priceChanged = Math.abs(priceDiff) > 0.001;
            const stockChanged = stockDiff !== 0;

            if (priceChanged && stockChanged) {
              bothChangedCount++;
            } else if (priceChanged) {
              priceOnlyCount++;
            } else if (stockChanged) {
              stockOnlyCount++;
            } else {
              unchangedCount++;
            }

            if (canonicalProd) {
              if (brand && brand !== 'Generic') canonicalProd.brand = brand;
              if (category && category !== 'General') canonicalProd.category = category;
              if (description) canonicalProd.description = description;
              if (tags.length > 0) canonicalProd.tags = tags;
              if (images.length > 0) canonicalProd.images = images;
              if (costPrice > 0) canonicalProd.defaultCostPrice = costPrice;
              if (retailPrice > 0) canonicalProd.defaultRetailPrice = retailPrice;
              await canonicalProd.save();
            }

            if (costPrice > 0) variant.costPrice = costPrice;
            if (retailPrice > 0) variant.retailPrice = retailPrice;
            if (barcode) variant.barcode = barcode;
            if (title) variant.title = title;
            await variant.save();

            // Update inventory
            if (inv) {
              inv.trackedStock = stock;
              inv.availableToAllocate = Math.max(0, stock - inv.reservedStock - inv.safetyStock);
              await inv.save();

              if (stockDiff !== 0) {
                await InventoryMovement.create({
                  organizationId: req.tenantId,
                  canonicalVariantId: variant._id,
                  changeType: InventoryChangeType.MANUAL_ADJUSTMENT,
                  quantityChanged: stockDiff,
                  previousTrackedStock: oldStock,
                  newTrackedStock: stock,
                  reason: `CSV Differential Update (Job: ${importJob._id})`,
                  performedBy: req.user?.userId,
                });
              }
            }
            updatedCount++;
          } else {
            // Check if CanonicalProduct with masterSku exists
            canonicalProd = await CanonicalProduct.findOne({
              organizationId: req.tenantId,
              masterSku: sku,
            });

            if (!canonicalProd) {
              canonicalProd = await CanonicalProduct.create({
                organizationId: req.tenantId,
                title,
                masterSku: sku,
                brand,
                category,
                description,
                tags,
                images,
                defaultCostPrice: costPrice,
                defaultRetailPrice: retailPrice,
                totalVariants: 1,
              });
            }

            variant = await ProductVariant.create({
              organizationId: req.tenantId,
              canonicalProductId: canonicalProd._id,
              sku,
              barcode: barcode || undefined,
              title,
              costPrice,
              retailPrice,
            });

            await ProductCostHistory.create({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              costPrice,
              effectiveFrom: new Date(),
              reason: 'Created via CSV Import',
            });

            await InventoryItem.create({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              sku,
              trackedStock: stock,
              reservedStock: 0,
              safetyStock: 0,
              availableToAllocate: stock,
            });

            if (stock > 0) {
              await InventoryMovement.create({
                organizationId: req.tenantId,
                canonicalVariantId: variant._id,
                changeType: InventoryChangeType.RESTOCK,
                quantityChanged: stock,
                previousTrackedStock: 0,
                newTrackedStock: stock,
                reason: `Initial stock from CSV Import (Job: ${importJob._id})`,
                performedBy: req.user?.userId,
              });
            }
            createdCount++;
          }

          // Auto-link with matching channel products (eBay, etc.) to ensure instant mapping
          const matchingChannelProducts = await ChannelProduct.find({
            organizationId: req.tenantId,
            sku,
          });
          for (const chProd of matchingChannelProducts) {
            await ProductMapping.findOneAndUpdate(
              {
                organizationId: req.tenantId,
                channelProductId: chProd._id,
              },
              {
                $set: {
                  canonicalProductId: canonicalProd._id,
                  canonicalVariantId: variant._id,
                  channelConnectionId: chProd.channelConnectionId,
                  channelProductId: chProd._id,
                  channelType: chProd.channelType,
                  mappingConfidence: MappingConfidence.EXACT_SKU,
                  syncPrice: true,
                  syncInventory: true,
                  status: MappingStatus.MAPPED,
                  updatedAt: new Date(),
                },
                $unset: {
                  unmappedAt: 1,
                  unmappedReason: 1,
                },
              },
              { upsert: true, new: true }
            );
          }

          successfulRows++;
        } catch (err: any) {
          failedRows++;
          rowErrors.push({
            row: rowNumber,
            sku: item.sku || 'UNKNOWN',
            error: err.message,
          });
        }
      }

      importJob.status = failedRows === items.length ? CsvJobStatus.FAILED : CsvJobStatus.COMPLETED;
      importJob.processedRows = items.length;
      importJob.successfulRows = successfulRows;
      importJob.failedRows = failedRows;
      importJob.rowErrors = rowErrors;
      importJob.completedAt = new Date();
      await importJob.save();

      let message = `File processed successfully! Master Catalog updated: ${successfulRows} product${successfulRows === 1 ? '' : 's'} (${createdCount} new, ${priceOnlyCount} price updates, ${stockOnlyCount} stock updates, ${bothChangedCount} price & stock updates, ${unchangedCount} unchanged). External store listings (eBay, Shopify) were kept safe and untouched.`;

      if (skippedDuplicates.length > 0) {
        const dupSummary = skippedDuplicates.map(
          (d) => `SKU "${d.sku}" (${d.firstTitle} & ${d.title})`
        ).join(', ');
        message += ` Notice: Duplicate SKU products in file (${dupSummary}) were deduplicated; the first occurrence was imported.`;
      }

      return res.json({
        success: true,
        data: {
          jobId: importJob._id,
          totalRows: items.length,
          successfulRows,
          createdCount,
          updatedCount,
          priceOnlyCount,
          stockOnlyCount,
          bothChangedCount,
          unchangedCount,
          failedRows,
          skippedDuplicates,
          errors: rowErrors.slice(0, 20),
          message,
        },
      });
    } catch (error: any) {
      logger.error('CSV Import failed:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'CSV Import failed' },
      });
    }
  }

  // GET /api/v1/csv/jobs - List import job history
  static async getJobs(req: Request, res: Response) {
    try {
      const jobs = await CsvImportJob.find({ organizationId: req.tenantId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      return res.json({
        success: true,
        data: jobs,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list CSV jobs' },
      });
    }
  }

  // GET /api/v1/csv/export - Export product catalog to CSV with formula injection sanitization
  static async export(req: Request, res: Response) {
    try {
      const variants = await ProductVariant.find({ organizationId: req.tenantId })
        .populate('canonicalProductId', 'title brand category status')
        .lean();

      const variantIds = variants.map((v) => v._id);
      const inventoryItems = await InventoryItem.find({
        canonicalVariantId: { $in: variantIds },
      }).lean();

      const rows = variants.map((v: any) => {
        const inv = inventoryItems.find(
          (i) => i.canonicalVariantId?.toString() === v._id?.toString()
        );
        return {
          SKU: sanitizeForCsv(v.sku),
          Title: sanitizeForCsv(v.title || v.canonicalProductId?.title),
          Brand: sanitizeForCsv(v.canonicalProductId?.brand),
          Category: sanitizeForCsv(v.canonicalProductId?.category),
          Barcode: sanitizeForCsv(v.barcode),
          'Cost Price': sanitizeForCsv(v.costPrice),
          'Retail Price': sanitizeForCsv(v.retailPrice),
          'Tracked Stock': sanitizeForCsv(inv?.trackedStock ?? 0),
          'Reserved Stock': sanitizeForCsv(inv?.reservedStock ?? 0),
          'Safety Stock': sanitizeForCsv(inv?.safetyStock ?? 0),
          'Available to Allocate': sanitizeForCsv(inv?.availableToAllocate ?? 0),
          Status: sanitizeForCsv(v.canonicalProductId?.status),
        };
      });

      const csvData = stringify(rows, { header: true });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="canonical-products-export.csv"');
      return res.send(csvData);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to export products to CSV' },
      });
    }
  }
}
