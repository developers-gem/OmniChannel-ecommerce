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
} from '../../database/models';
import { CsvJobStatus, InventoryChangeType } from '@multichannel/shared';
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

export class CsvController {
  // POST /api/v1/csv/preview - Parse raw CSV text and return columns, row count, and first 5 rows preview
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
      const previewRows = records.slice(0, 5);

      return res.json({
        success: true,
        data: {
          headers,
          totalRows: records.length,
          previewRows,
        },
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: `CSV Parsing error: ${error.message}` },
      });
    }
  }

  // POST /api/v1/csv/import - Execute CSV import with column mapping and row-level error reporting
  static async import(req: Request, res: Response) {
    try {
      const { csvContent, fileName, mappingConfig, destinationChannels } = req.body;

      if (!csvContent || !mappingConfig) {
        return res.status(400).json({
          success: false,
          error: { message: 'CSV content and mapping config are required' },
        });
      }

      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      // Create tracking job
      const importJob = await CsvImportJob.create({
        organizationId: req.tenantId,
        fileName: fileName || 'catalog-import.csv',
        fileSize: Buffer.byteLength(csvContent, 'utf8'),
        status: CsvJobStatus.IMPORTING,
        totalRows: records.length,
        mappingConfig,
        destinationChannels: destinationChannels || [],
      });

      let successfulRows = 0;
      let failedRows = 0;
      const rowErrors: any[] = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 1;

        try {
          const sku = (row[mappingConfig.sku] || '').trim().toUpperCase();
          const title = (row[mappingConfig.title] || '').trim();
          const costPrice = parseFloat(row[mappingConfig.costPrice] || '0') || 0;
          const retailPrice = parseFloat(row[mappingConfig.retailPrice] || '0') || 0;
          const stock = parseInt(row[mappingConfig.stock] || '0', 10) || 0;
          const brand = (row[mappingConfig.brand] || '').trim();
          const category = (row[mappingConfig.category] || '').trim();
          const barcode = (row[mappingConfig.barcode] || '').trim();

          if (!sku) {
            throw new Error('Missing required SKU');
          }
          if (!title) {
            throw new Error('Missing required Title');
          }

          // Check if variant / canonical product already exists
          let variant = await ProductVariant.findOne({
            organizationId: req.tenantId,
            sku,
          });

          let canonicalProd: any;

          if (variant) {
            // Update existing
            canonicalProd = await CanonicalProduct.findById(variant.canonicalProductId);
            if (canonicalProd) {
              if (brand) canonicalProd.brand = brand;
              if (category) canonicalProd.category = category;
              await canonicalProd.save();
            }

            variant.costPrice = costPrice;
            variant.retailPrice = retailPrice;
            if (barcode) variant.barcode = barcode;
            await variant.save();

            // Update inventory
            const inv = await InventoryItem.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
            });
            if (inv) {
              const diff = stock - inv.trackedStock;
              inv.trackedStock = stock;
              inv.availableToAllocate = Math.max(0, stock - inv.reservedStock - inv.safetyStock);
              await inv.save();

              if (diff !== 0) {
                await InventoryMovement.create({
                  organizationId: req.tenantId,
                  canonicalVariantId: variant._id,
                  changeType: InventoryChangeType.MANUAL_ADJUSTMENT,
                  quantityChanged: diff,
                  previousTrackedStock: stock - diff,
                  newTrackedStock: stock,
                  reason: `CSV Import update (Job: ${importJob._id})`,
                  performedBy: req.user?.userId,
                });
              }
            }
          } else {
            // Create new Canonical Product and Variant
            canonicalProd = await CanonicalProduct.create({
              organizationId: req.tenantId,
              title,
              masterSku: sku,
              brand,
              category,
              defaultCostPrice: costPrice,
              defaultRetailPrice: retailPrice,
              totalVariants: 1,
            });

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
          }

          successfulRows++;
        } catch (err: any) {
          failedRows++;
          rowErrors.push({
            row: rowNumber,
            sku: row[mappingConfig.sku] || 'UNKNOWN',
            error: err.message,
          });
        }
      }

      importJob.status = failedRows === records.length ? CsvJobStatus.FAILED : CsvJobStatus.COMPLETED;
      importJob.processedRows = records.length;
      importJob.successfulRows = successfulRows;
      importJob.failedRows = failedRows;
      importJob.rowErrors = rowErrors;
      importJob.completedAt = new Date();
      await importJob.save();

      return res.json({
        success: true,
        data: {
          jobId: importJob._id,
          totalRows: records.length,
          successfulRows,
          failedRows,
          errors: rowErrors.slice(0, 20),
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
          (i) => i.canonicalVariantId.toString() === v._id.toString()
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
